/**
 * HandController - WebXR Hand Tracking and Horizon OS Style Spatial Gesture Engine.
 * Features:
 * - W3C WebXR Hand Input specification (25 joints)
 * - Universal Grab Handles: Top Title Bar AND Bottom Pill Handle (0.15m hitbox radius)
 * - Distance-Independent Raycast / Pinch Grab (point and pinch from seated couch distance)
 * - Real-time dynamic (x, y, z) transform locking during drag
 * - Visual Feedback: Glowing handle/border highlight + audio/haptic click on hover
 * - Drag Tactile Feedback: 1.02x scale feedback while holding/moving window
 * - Direct Touch UV Raycaster for buttons & checklists
 * - Corner Resize Pin (top-right)
 * - 3D Hologram single-pinch rotation
 */

import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { MediaPanel } from '../panels/MediaPanel';
import { WidgetsPanel } from '../panels/WidgetsPanel';
import { ArtifactPanel } from '../panels/ArtifactPanel';

export type AnySpatialPanel = MediaPanel | WidgetsPanel | ArtifactPanel;

export interface HandState {
  indexTipPos: THREE.Vector3;
  thumbTipPos: THREE.Vector3;
  wristPos: THREE.Vector3;
  pinchPoint: THREE.Vector3;
  pinchDistance: number;
  isPinching: boolean;
  isPinchStarted: boolean;
  isPinchEnded: boolean;
  handedness: 'left' | 'right';
  isTracked: boolean;
}

export class HandController {
  public hands: THREE.XRHandSpace[] = [];
  public handStates: HandState[] = [];

  // Visual Contact Micro-Halos at fingertips
  private visualHalos: {
    indexHaloMesh: THREE.Mesh;
    thumbHaloMesh: THREE.Mesh;
    pinchGlowMesh: THREE.Mesh;
    rayPointerMesh: THREE.Mesh;
  }[] = [];

  // Raycasters for distance pointing
  private raycasters: THREE.Raycaster[] = [new THREE.Raycaster(), new THREE.Raycaster()];

  // Hover tracking for audio/haptic trigger on enter
  private hoveredPanels: (AnySpatialPanel | null)[] = [null, null];

  // Active Manipulations
  private activeMovePanel: {
    panel: AnySpatialPanel;
    handIndex: number;
    initialHandPos: THREE.Vector3;
    initialPanelPos: THREE.Vector3;
    initialOffset: THREE.Vector3;
    initialDistance: number;
    isDistanceRay: boolean;
    rayOffset: THREE.Vector3;
  } | null = null;

  private activeResizePanel: {
    panel: AnySpatialPanel;
    handIndex: number;
    initialHandPos: THREE.Vector3;
    initialScale: number;
  } | null = null;

  private activeHologramPinch: {
    panel: ArtifactPanel;
    handIndex: number;
    lastPinchPos: THREE.Vector3;
  } | null = null;

  // Touch Debounce
  private wasTouchingPanel: boolean[] = [false, false];

  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private audio: AudioEngine;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, audio: AudioEngine) {
    this.scene = scene;
    this.renderer = renderer;
    this.audio = audio;

    for (let i = 0; i < 2; i++) {
      const hand = this.renderer.xr.getHand(i);
      this.hands.push(hand);
      this.scene.add(hand);

      this.handStates.push({
        indexTipPos: new THREE.Vector3(),
        thumbTipPos: new THREE.Vector3(),
        wristPos: new THREE.Vector3(),
        pinchPoint: new THREE.Vector3(),
        pinchDistance: 1.0,
        isPinching: false,
        isPinchStarted: false,
        isPinchEnded: false,
        handedness: i === 0 ? 'left' : 'right',
        isTracked: false,
      });

      // Visual Micro-Halo (A glowing energy ring around index fingertip)
      const ringGeo = new THREE.RingGeometry(0.007, 0.011, 24);
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      });
      const indexHaloMesh = new THREE.Mesh(ringGeo, haloMat);
      indexHaloMesh.visible = false;
      this.scene.add(indexHaloMesh);

      // Thumb Contact Dot
      const thumbGeo = new THREE.SphereGeometry(0.006, 16, 16);
      const thumbMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.75,
      });
      const thumbHaloMesh = new THREE.Mesh(thumbGeo, thumbMat);
      thumbHaloMesh.visible = false;
      this.scene.add(thumbHaloMesh);

      // Pinch Energy Spark
      const pinchGlowGeo = new THREE.SphereGeometry(0.012, 16, 16);
      const pinchGlowMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
      });
      const pinchGlowMesh = new THREE.Mesh(pinchGlowGeo, pinchGlowMat);
      pinchGlowMesh.visible = false;
      this.scene.add(pinchGlowMesh);

      // Distance Pointer Reticle dot
      const pointerGeo = new THREE.SphereGeometry(0.009, 12, 12);
      const pointerMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      });
      const rayPointerMesh = new THREE.Mesh(pointerGeo, pointerMat);
      rayPointerMesh.visible = false;
      this.scene.add(rayPointerMesh);

      this.visualHalos.push({ indexHaloMesh, thumbHaloMesh, pinchGlowMesh, rayPointerMesh });

      hand.addEventListener('connected', (event: unknown) => {
        const xrEvent = event as { data?: { handedness?: 'left' | 'right' } };
        if (xrEvent?.data?.handedness) {
          this.handStates[i].handedness = xrEvent.data.handedness;
        }
      });

      hand.addEventListener('disconnected', () => {
        this.handStates[i].isTracked = false;
        this.visualHalos[i].indexHaloMesh.visible = false;
        this.visualHalos[i].thumbHaloMesh.visible = false;
        this.visualHalos[i].pinchGlowMesh.visible = false;
        this.visualHalos[i].rayPointerMesh.visible = false;
        this.releaseAllGrabs(i);
      });
    }
  }

  /**
   * Main per-frame hand tracking & interaction loop
   */
  public update(
    _delta: number,
    userHeadPos: THREE.Vector3,
    mediaPanel: MediaPanel,
    widgetsPanel: WidgetsPanel,
    artifactPanel: ArtifactPanel
  ): void {
    // Forgiving pinch thresholds for Quest hand tracking
    const PINCH_START = 0.028; // 28mm start
    const PINCH_END = 0.045;   // 45mm release

    const allPanels: AnySpatialPanel[] = [mediaPanel, widgetsPanel, artifactPanel];

    for (let i = 0; i < 2; i++) {
      const hand = this.hands[i];
      const state = this.handStates[i];
      const visuals = this.visualHalos[i];

      state.isPinchStarted = false;
      state.isPinchEnded = false;

      const indexTip = hand.joints?.['index-finger-tip'];
      const thumbTip = hand.joints?.['thumb-tip'];
      const wrist = hand.joints?.['wrist'];

      if (indexTip && thumbTip && indexTip.visible && thumbTip.visible) {
        state.isTracked = true;
        indexTip.getWorldPosition(state.indexTipPos);
        thumbTip.getWorldPosition(state.thumbTipPos);
        if (wrist && wrist.visible) {
          wrist.getWorldPosition(state.wristPos);
        } else {
          // Fallback wrist position if not reported
          state.wristPos.copy(state.indexTipPos).sub(new THREE.Vector3(0, 0.1, 0));
        }

        state.pinchDistance = state.thumbTipPos.distanceTo(state.indexTipPos);
        state.pinchPoint.copy(state.thumbTipPos).add(state.indexTipPos).multiplyScalar(0.5);

        const wasPinching = state.isPinching;
        if (!wasPinching && state.pinchDistance < PINCH_START) {
          state.isPinching = true;
          state.isPinchStarted = true;
        } else if (wasPinching && state.pinchDistance > PINCH_END) {
          state.isPinching = false;
          state.isPinchEnded = true;
        }

        // Visual Halos
        visuals.indexHaloMesh.visible = true;
        visuals.thumbHaloMesh.visible = true;
        visuals.indexHaloMesh.position.copy(state.indexTipPos);
        visuals.thumbHaloMesh.position.copy(state.thumbTipPos);
        visuals.indexHaloMesh.lookAt(userHeadPos);

        if (state.isPinching) {
          visuals.pinchGlowMesh.visible = true;
          visuals.pinchGlowMesh.position.copy(state.pinchPoint);
          (visuals.pinchGlowMesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
          (visuals.indexHaloMesh.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
        } else {
          visuals.pinchGlowMesh.visible = false;
          (visuals.indexHaloMesh.material as THREE.MeshBasicMaterial).color.setHex(0x00f0ff);
        }

        // Raycast from user eye through pinch point (intuitive gaze-assisted ray)
        const rayDir = state.pinchPoint.clone().sub(userHeadPos).normalize();
        this.raycasters[i].set(userHeadPos, rayDir);

        // If actively dragging with this hand, hide distance pointer dot
        if (this.activeMovePanel && this.activeMovePanel.handIndex === i) {
          visuals.rayPointerMesh.visible = false;
        } else {
          // Check Proximity & Ray Hover Detection (for handles & visual feedback)
          const targetHover = this.findHoveredPanel(i, state.pinchPoint, userHeadPos, allPanels, visuals.rayPointerMesh);

          // Handle entering/exiting hover highlight & tactile click
          if (targetHover !== this.hoveredPanels[i]) {
            if (this.hoveredPanels[i] && !this.activeMovePanel) {
              this.hoveredPanels[i]?.setGrabHighlight(false);
            }
            if (targetHover && !this.activeMovePanel) {
              targetHover.setGrabHighlight(true);
              this.audio.playClick(1.8);
              this.audio.triggerHaptic(0.4, 25);
            }
            this.hoveredPanels[i] = targetHover;
          }
        }

        // 1. Gesture: Handle Window Move Pinch
        if (state.isPinchStarted) {
          this.checkPinchStart(i, state.pinchPoint, userHeadPos, allPanels, artifactPanel);
        } else if (state.isPinchEnded) {
          this.releaseAllGrabs(i);
        } else if (state.isPinching) {
          this.handleActivePinch(i, state.pinchPoint, userHeadPos);
        }

        // 2. Gesture: Direct Index Fingertip Touch on Panels (when not pinching or dragging)
        if (!state.isPinching && !this.activeMovePanel) {
          this.checkDirectFingertipTouch(i, state.indexTipPos, allPanels);
        }
      } else {
        state.isTracked = false;
        visuals.indexHaloMesh.visible = false;
        visuals.thumbHaloMesh.visible = false;
        visuals.pinchGlowMesh.visible = false;
        visuals.rayPointerMesh.visible = false;
        if (this.hoveredPanels[i]) {
          this.hoveredPanels[i]?.setGrabHighlight(false);
          this.hoveredPanels[i] = null;
        }
        this.releaseAllGrabs(i);
      }
    }
  }

  /**
   * Find hovered panel via direct 0.15m proximity OR distance raycast
   */
  private findHoveredPanel(
    handIndex: number,
    pinchPoint: THREE.Vector3,
    _userHeadPos: THREE.Vector3,
    panels: AnySpatialPanel[],
    pointerMesh: THREE.Mesh
  ): AnySpatialPanel | null {
    const PROXIMITY_RADIUS = 0.15; // 0.15m (150mm) expanded grab hitbox radius

    // 1. First check Direct Proximity to Top Bar or Bottom Pill Handle
    for (const p of panels) {
      const topPos = new THREE.Vector3();
      const bottomPos = new THREE.Vector3();
      p.topBarMesh.getWorldPosition(topPos);
      p.handleMesh.getWorldPosition(bottomPos);

      const dTop = topPos.distanceTo(pinchPoint);
      const dBottom = bottomPos.distanceTo(pinchPoint);

      if (dTop <= PROXIMITY_RADIUS || dBottom <= PROXIMITY_RADIUS) {
        pointerMesh.visible = false;
        return p;
      }
    }

    // 2. Second check Distance Raycast
    const ray = this.raycasters[handIndex];
    let closestPanel: AnySpatialPanel | null = null;
    let closestDist = Infinity;
    let hitLocation: THREE.Vector3 | null = null;

    for (const p of panels) {
      // Test top hitbox, bottom hitbox, and panel face
      const targets = [p.topBarHitbox, p.bottomBarHitbox, p.topBarMesh, p.handleMesh];
      const panelMesh = 'screenMesh' in p ? p.screenMesh : (p as WidgetsPanel).panelMesh;
      targets.push(panelMesh);

      const intersects = ray.intersectObjects(targets, true);
      if (intersects.length > 0) {
        const d = intersects[0].distance;
        if (d < closestDist) {
          closestDist = d;
          closestPanel = p;
          hitLocation = intersects[0].point;
        }
      }
    }

    if (closestPanel && hitLocation) {
      pointerMesh.visible = true;
      pointerMesh.position.copy(hitLocation);
      return closestPanel;
    } else {
      pointerMesh.visible = false;
      return null;
    }
  }

  private checkPinchStart(
    handIndex: number,
    pinchPoint: THREE.Vector3,
    userHeadPos: THREE.Vector3,
    panels: AnySpatialPanel[],
    artifactPanel: ArtifactPanel
  ): void {
    const PROXIMITY_RADIUS = 0.15; // 0.15m (150mm) hitbox radius
    const PIN_RADIUS = 0.085;      // 85mm corner pin grab radius

    // 1. Check Corner Resize Pins first (Top-Right of panels)
    for (const p of panels) {
      const pinWorld = new THREE.Vector3();
      p.resizePinMesh.getWorldPosition(pinWorld);

      if (pinWorld.distanceTo(pinchPoint) < PIN_RADIUS) {
        this.activeResizePanel = {
          panel: p,
          handIndex,
          initialHandPos: pinchPoint.clone(),
          initialScale: p.scaleFactor,
        };
        this.audio.playClick(1.5);
        this.audio.triggerHaptic(0.5, 30);
        return;
      }
    }

    // 2. Check 3D Hologram Container on ArtifactPanel (Single pinch rotate)
    const holoWorld = new THREE.Vector3();
    artifactPanel.hologramContainer.getWorldPosition(holoWorld);
    if (holoWorld.distanceTo(pinchPoint) < 0.18) {
      this.activeHologramPinch = {
        panel: artifactPanel,
        handIndex,
        lastPinchPos: pinchPoint.clone(),
      };
      this.audio.playClick(1.2);
      this.audio.triggerHaptic(0.5, 25);
      return;
    }

    // 3. Direct Proximity Grab (Top Bar OR Bottom Pill Handle within 0.15m)
    for (const p of panels) {
      const topPos = new THREE.Vector3();
      const bottomPos = new THREE.Vector3();
      p.topBarMesh.getWorldPosition(topPos);
      p.handleMesh.getWorldPosition(bottomPos);

      const dTop = topPos.distanceTo(pinchPoint);
      const dBottom = bottomPos.distanceTo(pinchPoint);

      if (dTop <= PROXIMITY_RADIUS || dBottom <= PROXIMITY_RADIUS) {
        this.startDraggingPanel(p, handIndex, pinchPoint, userHeadPos, false);
        return;
      }
    }

    // 4. Distance-Independent Raycast Grab (Point & Pinch from afar)
    const ray = this.raycasters[handIndex];
    let closestPanel: AnySpatialPanel | null = null;
    let closestDist = Infinity;

    for (const p of panels) {
      const targets = [
        p.topBarHitbox,
        p.bottomBarHitbox,
        p.topBarMesh,
        p.handleMesh,
        'screenMesh' in p ? p.screenMesh : (p as WidgetsPanel).panelMesh,
      ];

      const intersects = ray.intersectObjects(targets, true);
      if (intersects.length > 0) {
        const d = intersects[0].distance;
        if (d < closestDist) {
          closestDist = d;
          closestPanel = p;
        }
      }
    }

    if (closestPanel) {
      this.startDraggingPanel(closestPanel, handIndex, pinchPoint, userHeadPos, true);
    }
  }

  private startDraggingPanel(
    panel: AnySpatialPanel,
    handIndex: number,
    pinchPoint: THREE.Vector3,
    userHeadPos: THREE.Vector3,
    isDistanceRay: boolean
  ): void {
    // Hide pointer reticle dot while actively dragging
    this.visualHalos[handIndex].rayPointerMesh.visible = false;

    const initialPanelPos = panel.group.position.clone();
    // Clamp initial distance between 0.5m and 0.85m
    const initialDistance = THREE.MathUtils.clamp(userHeadPos.distanceTo(initialPanelPos), 0.5, 0.85);

    // Calculate angular ray offset so the panel doesn't jump
    const currentRay = pinchPoint.clone().sub(userHeadPos).normalize();
    const rayCenterPoint = userHeadPos.clone().add(currentRay.multiplyScalar(initialDistance));
    const rayOffset = initialPanelPos.clone().sub(rayCenterPoint);

    this.activeMovePanel = {
      panel,
      handIndex,
      initialHandPos: pinchPoint.clone(),
      initialPanelPos,
      initialOffset: initialPanelPos.clone().sub(pinchPoint),
      initialDistance,
      isDistanceRay,
      rayOffset,
    };

    // Visual feedback: 1.02x scale feedback and bright cyan glow
    panel.setDraggingState(true);

    this.audio.playWindowMove();
    this.audio.triggerHaptic(0.7, 45);
  }

  private handleActivePinch(
    handIndex: number,
    pinchPoint: THREE.Vector3,
    userHeadPos: THREE.Vector3
  ): void {
    // 1. Moving Window (Dynamic transform update on every frame)
    if (this.activeMovePanel && this.activeMovePanel.handIndex === handIndex) {
      const drag = this.activeMovePanel;
      const p = drag.panel;

      let targetPos: THREE.Vector3;

      if (!drag.isDistanceRay) {
        // Direct Proximity Grab: Follow hand midpoint with relative offset
        targetPos = pinchPoint.clone().add(drag.initialOffset);
      } else {
        // Distance Raycast Grab: Maintain distance along hand ray
        const currentRay = pinchPoint.clone().sub(userHeadPos).normalize();
        targetPos = userHeadPos.clone().add(currentRay.multiplyScalar(drag.initialDistance)).add(drag.rayOffset);
      }

      // Requirement 3: Clamp Y-position between 0.9m and 1.4m (prevents sinking into floor)
      targetPos.y = THREE.MathUtils.clamp(targetPos.y, 0.9, 1.4);

      // Requirement 3: Clamp 3D distance from userHeadPos (camera) between 0.5m and 0.85m
      const offsetFromHead = targetPos.clone().sub(userHeadPos);
      const distFromHead = offsetFromHead.length();
      const clampedDist = THREE.MathUtils.clamp(distFromHead, 0.5, 0.85);

      if (distFromHead > 0.0001) {
        offsetFromHead.multiplyScalar(clampedDist / distFromHead);
        targetPos.copy(userHeadPos).add(offsetFromHead);
      }
      targetPos.y = THREE.MathUtils.clamp(targetPos.y, 0.9, 1.4);

      // Requirement 4: Damped Movement (lerp 0.18) for smooth, weighted hand follow
      p.group.position.lerp(targetPos, 0.18);

      // Requirement 2: Lock Upright Orientation (Pitch & Roll strictly 0)
      // Only allow Y-axis rotation (Yaw) so panel smoothly faces user head
      const lookTarget = new THREE.Vector3(userHeadPos.x, p.group.position.y, userHeadPos.z);
      p.group.lookAt(lookTarget);
      p.group.rotation.x = 0;
      p.group.rotation.z = 0;
      return;
    }

    // 2. Resizing Window
    if (this.activeResizePanel && this.activeResizePanel.handIndex === handIndex) {
      const p = this.activeResizePanel.panel;
      const initialPos = this.activeResizePanel.initialHandPos;
      const centerWorld = new THREE.Vector3();
      p.group.getWorldPosition(centerWorld);

      const initialDist = centerWorld.distanceTo(initialPos);
      const currentDist = centerWorld.distanceTo(pinchPoint);
      const ratio = currentDist / Math.max(0.01, initialDist);

      p.setScale(this.activeResizePanel.initialScale * ratio);
      return;
    }

    // 3. Rotating 3D Hologram
    if (this.activeHologramPinch && this.activeHologramPinch.handIndex === handIndex) {
      const delta = pinchPoint.clone().sub(this.activeHologramPinch.lastPinchPos);
      this.activeHologramPinch.panel.rotateHologram(delta.x, delta.y);
      this.activeHologramPinch.lastPinchPos.copy(pinchPoint);
    }
  }

  private releaseAllGrabs(handIndex: number): void {
    if (this.activeMovePanel && this.activeMovePanel.handIndex === handIndex) {
      const p = this.activeMovePanel.panel;
      p.setDraggingState(false);
      p.setGrabHighlight(false);
      this.audio.playWindowSnap();
      this.audio.triggerHaptic(0.5, 30);
      this.activeMovePanel = null;
    }
    if (this.activeResizePanel && this.activeResizePanel.handIndex === handIndex) {
      this.activeResizePanel = null;
    }
    if (this.activeHologramPinch && this.activeHologramPinch.handIndex === handIndex) {
      this.activeHologramPinch = null;
    }
  }

  /**
   * Direct Touch & Poke Detection for Glass Panels
   */
  private checkDirectFingertipTouch(
    handIndex: number,
    indexTipPos: THREE.Vector3,
    panels: AnySpatialPanel[]
  ): void {
    let touchedAny = false;

    for (const panel of panels) {
      const panelMesh =
        'screenMesh' in panel ? panel.screenMesh : (panel as WidgetsPanel).panelMesh;

      const localTip = panelMesh.worldToLocal(indexTipPos.clone());
      const halfW = panel.baseWidth / 2;
      const halfH = panel.baseHeight / 2;

      if (
        localTip.x >= -halfW &&
        localTip.x <= halfW &&
        localTip.y >= -halfH &&
        localTip.y <= halfH
      ) {
        // Depth contact threshold (within ±18mm of surface)
        if (Math.abs(localTip.z) < 0.018) {
          touchedAny = true;

          if (!this.wasTouchingPanel[handIndex]) {
            this.wasTouchingPanel[handIndex] = true;

            const u = (localTip.x + halfW) / panel.baseWidth;
            const v = (localTip.y + halfH) / panel.baseHeight;

            panel.handleTouchUV(u, v);
            this.audio.triggerHaptic(0.5, 30);
          }
          break;
        }
      }
    }

    if (!touchedAny) {
      this.wasTouchingPanel[handIndex] = false;
    }
  }

  /**
   * Desktop mouse simulation for window handles, resize pins, and panel touch
   */
  public simulateMouseInteraction(
    hitPoint: THREE.Vector3,
    type: 'down' | 'move' | 'up',
    userHeadPos: THREE.Vector3,
    panels: AnySpatialPanel[],
    artifactPanel: ArtifactPanel
  ): void {
    if (type === 'down') {
      this.checkPinchStart(0, hitPoint, userHeadPos, panels, artifactPanel);
    } else if (type === 'move') {
      this.handleActivePinch(0, hitPoint, userHeadPos);
    } else {
      this.releaseAllGrabs(0);
    }
  }
}
