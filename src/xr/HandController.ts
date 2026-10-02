/**
 * HandController - WebXR Hand Tracking and Horizon OS Style Spatial Gesture Engine.
 * Features:
 * - W3C WebXR Hand Input specification (25 joints)
 * - Index Fingertip Micro-Halo depth feedback ring
 * - Direct Touch UV Raycaster for floating glass panels (button taps, checklist pokes)
 * - Pinch-and-Drag Window Move engine (pill handles)
 * - Pinch-and-Scale Window Resize engine (corner pins)
 * - 3D Hologram Pinch-to-Rotate engine
 */

import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { MediaPanel } from '../panels/MediaPanel';
import { WidgetsPanel } from '../panels/WidgetsPanel';
import { ArtifactPanel } from '../panels/ArtifactPanel';

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
  }[] = [];

  // Active Manipulations
  private activeMovePanel: {
    panel: MediaPanel | WidgetsPanel | ArtifactPanel;
    handIndex: number;
    initialOffset: THREE.Vector3;
    initialDistance: number;
  } | null = null;

  private activeResizePanel: {
    panel: MediaPanel | WidgetsPanel | ArtifactPanel;
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
      const pinchGlowGeo = new THREE.SphereGeometry(0.01, 16, 16);
      const pinchGlowMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
      });
      const pinchGlowMesh = new THREE.Mesh(pinchGlowGeo, pinchGlowMat);
      pinchGlowMesh.visible = false;
      this.scene.add(pinchGlowMesh);

      this.visualHalos.push({ indexHaloMesh, thumbHaloMesh, pinchGlowMesh });

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
    const PINCH_START = 0.025; // 25mm
    const PINCH_END = 0.040;   // 40mm

    const allPanels: (MediaPanel | WidgetsPanel | ArtifactPanel)[] = [
      mediaPanel,
      widgetsPanel,
      artifactPanel,
    ];

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

        // Make index halo orient facing user head for optimal visual readability
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

        // 1. Gesture: Handle Window Move Pinch
        if (state.isPinchStarted) {
          this.checkPinchStart(i, state.pinchPoint, allPanels, artifactPanel);
        } else if (state.isPinchEnded) {
          this.releaseAllGrabs(i);
        } else if (state.isPinching) {
          this.handleActivePinch(i, state.pinchPoint, userHeadPos);
        }

        // 2. Gesture: Direct Index Fingertip Touch on Panels (when not pinching)
        if (!state.isPinching) {
          this.checkDirectFingertipTouch(i, state.indexTipPos, allPanels);
        }
      } else {
        state.isTracked = false;
        visuals.indexHaloMesh.visible = false;
        visuals.thumbHaloMesh.visible = false;
        visuals.pinchGlowMesh.visible = false;
        this.releaseAllGrabs(i);
      }
    }
  }

  private checkPinchStart(
    handIndex: number,
    pinchPoint: THREE.Vector3,
    panels: (MediaPanel | WidgetsPanel | ArtifactPanel)[],
    artifactPanel: ArtifactPanel
  ): void {
    const GRAB_RADIUS = 0.085; // 85mm handle grab radius
    const PIN_RADIUS = 0.065;  // 65mm corner pin grab radius

    // 1. Check Window Bottom Pill Handles
    for (const p of panels) {
      const handleWorld = new THREE.Vector3();
      p.handleMesh.getWorldPosition(handleWorld);

      if (handleWorld.distanceTo(pinchPoint) < GRAB_RADIUS) {
        this.activeMovePanel = {
          panel: p,
          handIndex,
          initialOffset: p.group.position.clone().sub(pinchPoint),
          initialDistance: p.group.position.distanceTo(pinchPoint),
        };
        this.audio.playWindowMove();
        return;
      }
    }

    // 2. Check Corner Resize Pins
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
        return;
      }
    }

    // 3. Check 3D Hologram Container on ArtifactPanel (Single pinch rotate)
    const holoWorld = new THREE.Vector3();
    artifactPanel.hologramContainer.getWorldPosition(holoWorld);
    if (holoWorld.distanceTo(pinchPoint) < 0.16) {
      this.activeHologramPinch = {
        panel: artifactPanel,
        handIndex,
        lastPinchPos: pinchPoint.clone(),
      };
      this.audio.playClick(1.2);
    }
  }

  private handleActivePinch(
    handIndex: number,
    pinchPoint: THREE.Vector3,
    userHeadPos: THREE.Vector3
  ): void {
    // 1. Moving Window
    if (this.activeMovePanel && this.activeMovePanel.handIndex === handIndex) {
      const p = this.activeMovePanel.panel;
      const targetPos = pinchPoint.clone().add(this.activeMovePanel.initialOffset);

      // Smooth translation
      p.group.position.lerp(targetPos, 0.4);

      // Billboarding: Maintain comfortable face-forward orientation toward user head
      const lookTarget = userHeadPos.clone();
      lookTarget.y = p.group.position.y; // Keep vertical upright
      p.group.lookAt(lookTarget);
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
      this.audio.playWindowSnap();
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
    panels: (MediaPanel | WidgetsPanel | ArtifactPanel)[]
  ): void {
    let touchedAny = false;

    for (const panel of panels) {
      const panelMesh =
        'screenMesh' in panel ? panel.screenMesh : (panel as WidgetsPanel).panelMesh;

      // Transform tip to panel local coordinates
      const localTip = panelMesh.worldToLocal(indexTipPos.clone());

      const halfW = panel.baseWidth / 2;
      const halfH = panel.baseHeight / 2;

      // Check within panel bounding rectangle
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

            // Calculate UV coordinates (0..1, 0..1)
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
    panels: (MediaPanel | WidgetsPanel | ArtifactPanel)[],
    artifactPanel: ArtifactPanel
  ): void {
    if (type === 'down') {
      this.checkPinchStart(0, hitPoint, panels, artifactPanel);
    } else if (type === 'move') {
      this.handleActivePinch(0, hitPoint, userHeadPos);
    } else {
      this.releaseAllGrabs(0);
    }
  }
}
