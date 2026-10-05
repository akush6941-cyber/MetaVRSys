/**
 * HandController - WebXR Hand Tracking & Spatial Gesture Engine
 * - W3C WebXR Hand Input specification (25 standard joints)
 * - Direct Fingertip Poke (< 0.02m activation threshold with tactile Z-compression)
 * - Distance Pinch Ray Select for seated couch productivity
 * - 6DOF Controller Trigger Select
 * - Universal Synchronous Window Handles (Locked Pitch/Roll, Seated Clamp 0.55m-0.85m)
 */

import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';

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
  public controllers: THREE.XRTargetRaySpace[] = [];
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

  // Active Window Dragging
  public activeDrag: {
    panelGroup: THREE.Group;
    handIndex: number;
    initialOffset: THREE.Vector3;
    initialDistance: number;
    isDistanceRay: boolean;
    rayOffset: THREE.Vector3;
  } | null = null;

  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private audio: AudioEngine;
  private lastInteractiveMeshes: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, audio: AudioEngine) {
    this.scene = scene;
    this.renderer = renderer;
    this.audio = audio;

    for (let i = 0; i < 2; i++) {
      // 1. WebXR Hand Spaces
      const hand = this.renderer.xr.getHand(i);
      this.hands.push(hand);
      this.scene.add(hand);

      // 2. WebXR 6DOF Controllers (Fallback / Hybrid)
      const controller = this.renderer.xr.getController(i);
      this.controllers.push(controller);
      this.scene.add(controller);

      controller.addEventListener('selectstart', () => {
        this.handleControllerSelect(i);
      });

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
        this.releaseDrag(i);
      });
    }
  }

  /**
   * Main per-frame update loop called from App.animate
   */
  public update(
    _delta: number,
    userHeadPos: THREE.Vector3,
    interactiveMeshes: THREE.Mesh[] = []
  ): void {
    this.lastInteractiveMeshes = interactiveMeshes;

    const PINCH_START = 0.028; // 28mm start
    const PINCH_END = 0.045;   // 45mm release

    for (let i = 0; i < 2; i++) {
      const hand = this.hands[i];
      const state = this.handStates[i];
      const visuals = this.visualHalos[i];

      state.isPinchStarted = false;
      state.isPinchEnded = false;

      const indexTip = hand.joints?.['index-finger-tip'];
      const thumbTip = hand.joints?.['thumb-tip'];

      if (indexTip && thumbTip) {
        state.isTracked = true;
        indexTip.getWorldPosition(state.indexTipPos);
        thumbTip.getWorldPosition(state.thumbTipPos);

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

        // Visual contact Halos
        visuals.indexHaloMesh.visible = true;
        visuals.thumbHaloMesh.visible = true;
        visuals.indexHaloMesh.position.copy(state.indexTipPos);
        visuals.thumbHaloMesh.position.copy(state.thumbTipPos);
        visuals.indexHaloMesh.lookAt(userHeadPos);

        if (state.isPinching) {
          visuals.pinchGlowMesh.visible = true;
          visuals.pinchGlowMesh.position.copy(state.pinchPoint);
        } else {
          visuals.pinchGlowMesh.visible = false;
        }

        // Distance Raycast
        const rayDir = state.pinchPoint.clone().sub(userHeadPos).normalize();
        this.raycasters[i].set(userHeadPos, rayDir);

        // Ray pointer reticle
        if (!this.activeDrag) {
          const hits = this.raycasters[i].intersectObjects(interactiveMeshes, true);
          if (hits.length > 0) {
            visuals.rayPointerMesh.visible = true;
            visuals.rayPointerMesh.position.copy(hits[0].point);
          } else {
            visuals.rayPointerMesh.visible = false;
          }
        } else {
          visuals.rayPointerMesh.visible = false;
        }

        // Pinch Interactions (Window drag or Distance Trigger)
        if (state.isPinchStarted) {
          this.checkPinchStart(i, state.pinchPoint, userHeadPos, interactiveMeshes);
        } else if (state.isPinchEnded) {
          this.releaseDrag(i);
        } else if (state.isPinching) {
          this.handleActiveDrag(i, state.pinchPoint, userHeadPos);
        }
      } else {
        state.isTracked = false;
        visuals.indexHaloMesh.visible = false;
        visuals.thumbHaloMesh.visible = false;
        visuals.pinchGlowMesh.visible = false;
        visuals.rayPointerMesh.visible = false;
        this.releaseDrag(i);
      }
    }

    // Direct Fingertip Poke Engine (< 0.02m threshold)
    this.checkDirectFingertipPoke(interactiveMeshes);
  }

  /**
   * Direct Fingertip Poke (< 0.02m Activation with Tactile Z-Compression)
   */
  private checkDirectFingertipPoke(interactiveMeshes: THREE.Mesh[]): void {
    if (interactiveMeshes.length === 0) return;

    const tip0 = this.handStates[0].isTracked ? this.handStates[0].indexTipPos : null;
    const tip1 = this.handStates[1].isTracked ? this.handStates[1].indexTipPos : null;

    if (!tip0 && !tip1) {
      // Release pressed states if no hands active
      for (const mesh of interactiveMeshes) {
        if (mesh.userData.isPressed) {
          mesh.userData.isPressed = false;
          mesh.position.z = mesh.userData.originalZ ?? mesh.position.z;
        }
      }
      return;
    }

    for (const mesh of interactiveMeshes) {
      // Handles are dragged via pinch, not poked
      if (mesh.userData.type === 'handle') continue;

      let minDist = Infinity;
      let activeTip: THREE.Vector3 | null = null;

      if (tip0) {
        const d0 = this.getSurfaceDistance(mesh, tip0);
        if (d0 < minDist) {
          minDist = d0;
          activeTip = tip0;
        }
      }
      if (tip1) {
        const d1 = this.getSurfaceDistance(mesh, tip1);
        if (d1 < minDist) {
          minDist = d1;
          activeTip = tip1;
        }
      }

      // Front activation threshold (< 0.02m / 20mm)
      if (minDist < 0.02 && !mesh.userData.isPressed) {
        mesh.userData.isPressed = true;
        const origZ = mesh.userData.originalZ ?? mesh.position.z;
        mesh.userData.originalZ = origZ;

        // Subtle backward Z-press offset for haptic feedback
        mesh.position.z = origZ - 0.006;

        this.audio.playClick(1.2);
        this.audio.triggerHaptic(0.6, 35);

        // Calculate UV coordinates if touching a screen
        let uv: THREE.Vector2 | undefined;
        if (activeTip && (mesh.userData.type === 'screen' || mesh.userData.type === 'scrubber')) {
          const local = mesh.worldToLocal(activeTip.clone());
          const w = mesh.userData.width || 0.8;
          const h = mesh.userData.height || 0.5;
          uv = new THREE.Vector2((local.x + w / 2) / w, (local.y + h / 2) / h);
        }

        const triggerFn = mesh.userData.onTrigger || mesh.userData.onClick;
        if (typeof triggerFn === 'function') {
          triggerFn(activeTip || new THREE.Vector3(), uv);
        }
      } else if (minDist >= 0.035 && mesh.userData.isPressed) {
        // Release threshold (> 35mm)
        mesh.userData.isPressed = false;
        mesh.position.z = mesh.userData.originalZ ?? mesh.position.z;
      }
    }
  }

  /**
   * Surface-accurate distance calculation to interactive bounds
   */
  private getSurfaceDistance(mesh: THREE.Mesh, tipPos: THREE.Vector3): number {
    const localTip = mesh.worldToLocal(tipPos.clone());
    const halfW = (mesh.userData.width ?? 0.1) / 2;
    const halfH = (mesh.userData.height ?? 0.04) / 2;
    const frontZ = (mesh.userData.depth ?? 0.012) / 2;

    const clampedX = THREE.MathUtils.clamp(localTip.x, -halfW, halfW);
    const clampedY = THREE.MathUtils.clamp(localTip.y, -halfH, halfH);
    return Math.hypot(localTip.x - clampedX, localTip.y - clampedY, localTip.z - frontZ);
  }

  /**
   * Pinch Started: Check if pinching a button, screen, or window handle
   */
  private checkPinchStart(
    handIndex: number,
    pinchPoint: THREE.Vector3,
    userHeadPos: THREE.Vector3,
    interactiveMeshes: THREE.Mesh[]
  ): void {
    const PROXIMITY_GRAB_RADIUS = 0.15; // 0.15m handle grab radius
    const ray = this.raycasters[handIndex];

    // 1. Direct Proximity Grab on Window Handles (< 0.15m)
    for (const mesh of interactiveMeshes) {
      if (mesh.userData.type === 'handle' && mesh.userData.panelGroup) {
        const handleWorld = new THREE.Vector3();
        mesh.getWorldPosition(handleWorld);
        if (handleWorld.distanceTo(pinchPoint) <= PROXIMITY_GRAB_RADIUS) {
          this.startDragging(mesh.userData.panelGroup, handIndex, pinchPoint, userHeadPos, false);
          return;
        }
      }
    }

    // 2. Distance Raycast Hits
    const hits = ray.intersectObjects(interactiveMeshes, true);
    if (hits.length > 0) {
      let target: THREE.Object3D | null = hits[0].object;
      while (target && !target.userData?.onTrigger && !target.userData?.panelGroup && target.parent) {
        target = target.parent;
      }

      if (target) {
        // If handle hit via distance ray -> drag window
        if (target.userData.type === 'handle' && target.userData.panelGroup) {
          this.startDragging(target.userData.panelGroup, handIndex, pinchPoint, userHeadPos, true);
          return;
        }

        // If interactive button or screen hit -> trigger action
        const triggerFn = target.userData.onTrigger || target.userData.onClick;
        if (typeof triggerFn === 'function') {
          const origZ = target.userData.originalZ ?? target.position.z;
          target.position.z = origZ - 0.006;
          setTimeout(() => {
            if (target) target.position.z = origZ;
          }, 120);

          this.audio.playClick(1.2);
          this.audio.triggerHaptic(0.6, 35);
          triggerFn(hits[0].point, hits[0].uv);
          return;
        }
      }
    }
  }

  private startDragging(
    panelGroup: THREE.Group,
    handIndex: number,
    pinchPoint: THREE.Vector3,
    userHeadPos: THREE.Vector3,
    isDistanceRay: boolean
  ): void {
    const initialPos = panelGroup.position.clone();
    const initialDist = THREE.MathUtils.clamp(userHeadPos.distanceTo(initialPos), 0.55, 0.85);

    const currentRay = pinchPoint.clone().sub(userHeadPos).normalize();
    const rayCenterPoint = userHeadPos.clone().add(currentRay.multiplyScalar(initialDist));
    const rayOffset = initialPos.clone().sub(rayCenterPoint);

    this.activeDrag = {
      panelGroup,
      handIndex,
      initialOffset: initialPos.clone().sub(pinchPoint),
      initialDistance: initialDist,
      isDistanceRay,
      rayOffset,
    };

    this.audio.playWindowMove();
    this.audio.triggerHaptic(0.7, 40);
  }

  private handleActiveDrag(
    handIndex: number,
    pinchPoint: THREE.Vector3,
    userHeadPos: THREE.Vector3
  ): void {
    if (!this.activeDrag || this.activeDrag.handIndex !== handIndex) return;

    const drag = this.activeDrag;
    const group = drag.panelGroup;

    let targetPos: THREE.Vector3;
    if (!drag.isDistanceRay) {
      targetPos = pinchPoint.clone().add(drag.initialOffset);
    } else {
      const currentRay = pinchPoint.clone().sub(userHeadPos).normalize();
      targetPos = userHeadPos.clone().add(currentRay.multiplyScalar(drag.initialDistance)).add(drag.rayOffset);
    }

    // Seated Clamping: Y between 0.9m and 1.35m
    targetPos.y = THREE.MathUtils.clamp(targetPos.y, 0.9, 1.35);

    // Seated Clamping: Distance to head between 0.55m and 0.85m
    const offsetFromHead = targetPos.clone().sub(userHeadPos);
    const distFromHead = offsetFromHead.length();
    const clampedDist = THREE.MathUtils.clamp(distFromHead, 0.55, 0.85);

    if (distFromHead > 0.0001) {
      offsetFromHead.multiplyScalar(clampedDist / distFromHead);
      targetPos.copy(userHeadPos).add(offsetFromHead);
    }
    targetPos.y = THREE.MathUtils.clamp(targetPos.y, 0.9, 1.35);

    // Damped follow lerp
    group.position.lerp(targetPos, 0.18);

    // Lock Pitch and Roll (only Yaw look-at user)
    const lookTarget = new THREE.Vector3(userHeadPos.x, group.position.y, userHeadPos.z);
    group.lookAt(lookTarget);
    group.rotation.x = 0;
    group.rotation.z = 0;
  }

  private releaseDrag(handIndex: number): void {
    if (this.activeDrag && this.activeDrag.handIndex === handIndex) {
      this.activeDrag = null;
      this.audio.playWindowSnap();
    }
  }

  /**
   * 6DOF Controller Trigger Select
   */
  private handleControllerSelect(controllerIndex: number): void {
    const controller = this.controllers[controllerIndex];
    if (!controller || this.lastInteractiveMeshes.length === 0) return;

    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    const rayDir = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix).normalize();
    const rayOrigin = new THREE.Vector3();
    controller.getWorldPosition(rayOrigin);

    const ray = new THREE.Raycaster(rayOrigin, rayDir);
    const hits = ray.intersectObjects(this.lastInteractiveMeshes, true);

    if (hits.length > 0) {
      let target: THREE.Object3D | null = hits[0].object;
      while (target && !target.userData?.onTrigger && target.parent) {
        target = target.parent;
      }
      if (target && typeof target.userData?.onTrigger === 'function') {
        const origZ = target.userData.originalZ ?? target.position.z;
        target.position.z = origZ - 0.006;
        setTimeout(() => {
          if (target) target.position.z = origZ;
        }, 120);

        this.audio.playClick(1.2);
        this.audio.triggerHaptic(0.6, 35);
        target.userData.onTrigger(hits[0].point, hits[0].uv);
      }
    }
  }

  /**
   * Desktop mouse simulation for window handles
   */
  public simulateMouseInteraction(
    hitPoint: THREE.Vector3,
    type: 'down' | 'move' | 'up',
    userHeadPos: THREE.Vector3,
    interactiveMeshes: THREE.Mesh[] = []
  ): void {
    if (type === 'down') {
      this.checkPinchStart(0, hitPoint, userHeadPos, interactiveMeshes);
    } else if (type === 'move') {
      this.handleActiveDrag(0, hitPoint, userHeadPos);
    } else {
      this.releaseDrag(0);
    }
  }
}
