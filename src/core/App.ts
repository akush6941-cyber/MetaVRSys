/**
 * App - Main Spatial Computing Engine for AetherDesk MR
 * Features:
 * - VisionOS / Horizon OS Spatial Architecture
 * - Center Screen: "Spatial Cinema Player" (Curved 16:9 screen, HTML5 Video, Floating Dock)
 * - Left Screen: "Spatial Web Deck" (Simulated Browser Experience, 3D Tab Pills, Interactive Canvas Content)
 * - Bulletproof Interactive Touch & Click Engine (2D Pointerdown + WebXR Direct Fingertip Poke)
 * - Seated Ergonomic 0.85m Arc with Synchronous Transform & Locked Pitch/Roll
 */

import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { HandController } from '../xr/HandController';
import { CinemaPanel } from '../panels/CinemaPanel';
import { WebDeckPanel } from '../panels/WebDeckPanel';

export interface AppStateUpdate {
  isInMR: boolean;
  isCinemaMode: boolean;
  isVideoPlaying: boolean;
  activeWebTab: string;
  pomodoroRemainingSec: number;
  completedTasksCount: number;
  isAudioEnabled: boolean;
  leftHandTracked: boolean;
  rightHandTracked: boolean;
  isPassthroughSimActive: boolean;
}

export class App {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  public audio: AudioEngine;
  public handController: HandController;

  // Spatial Screens
  public cinemaPanel: CinemaPanel;
  public webDeckPanel: WebDeckPanel;

  // Cinema Mode Room Dimmer Dome
  private cinemaDimmerMesh: THREE.Mesh;
  private cinemaDimmerTargetOpacity: number = 0.0;
  private cinemaDimmerCurrentOpacity: number = 0.0;

  // Desktop Passthrough Simulator Environment
  private roomSimGroup: THREE.Group;
  public isPassthroughSimActive: boolean = true;

  // Seated Reach Arc Visualizer
  private reachArcMesh: THREE.Line;

  public isInMR: boolean = false;
  private container: HTMLElement;
  private clock: THREE.Clock;
  private onStateChange?: (state: AppStateUpdate) => void;

  // Desktop Interaction
  private raycaster: THREE.Raycaster;
  private mouseVec: THREE.Vector2;
  private isMouseDown: boolean = false;
  private currentSession: XRSession | null = null;
  public mrButtonElement: HTMLElement | null = null;

  constructor(container: HTMLElement, onStateChange?: (state: AppStateUpdate) => void) {
    this.container = container;
    this.onStateChange = onStateChange;
    this.clock = new THREE.Clock();

    // 1. Scene Setup (Alpha: true for pure room passthrough)
    this.scene = new THREE.Scene();

    // 2. Camera at Seated Position (0, 1.2, 0)
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(65, aspect, 0.05, 50);
    this.camera.position.set(0, 1.2, 0);
    this.camera.lookAt(0, 1.2, -0.85);

    // 3. WebGLRenderer configured for WebXR Passthrough
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true, // Passthrough transparent background
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.xr.enabled = true;

    // Ensure the canvas explicitly accepts pointer events
    this.renderer.domElement.style.pointerEvents = 'auto';
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.inset = '0';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

    container.appendChild(this.renderer.domElement);

    // 4. Lighting
    this.setupLighting();

    // 5. Audio Synthesizer
    this.audio = new AudioEngine();

    // 6. Cinema Dimmer Dome (Inverted sphere around seated user)
    this.cinemaDimmerMesh = this.buildCinemaDimmer();
    this.scene.add(this.cinemaDimmerMesh);

    // 7. Desktop Room Simulator (preview on desktop)
    this.roomSimGroup = this.buildRoomSimulator();
    this.scene.add(this.roomSimGroup);

    // 8. Seated 0.85m Arc Visualizer
    this.reachArcMesh = this.buildReachArc();
    this.scene.add(this.reachArcMesh);

    // 9. Build Center Cinema Screen & Left Web Deck Screen
    this.cinemaPanel = new CinemaPanel(this.audio, (active) => {
      this.cinemaDimmerTargetOpacity = active ? 0.92 : 0.0;
    });

    this.webDeckPanel = new WebDeckPanel(this.audio);

    this.scene.add(this.cinemaPanel.group);
    this.scene.add(this.webDeckPanel.group);

    // Initial position setup
    this.resetWorkspacePositions();

    // 10. WebXR Hand Controller Engine
    this.handController = new HandController(this.scene, this.renderer, this.audio);

    // 11. Desktop Mouse Interactions (Universal Pointerdown 2D Engine)
    this.raycaster = new THREE.Raycaster();
    this.mouseVec = new THREE.Vector2();
    this.setupDesktopInteractions();

    // 12. Setup MR Entry Button
    this.setupMREntryButton();

    // 13. Event Listeners & Animation Loop
    window.addEventListener('resize', this.onWindowResize);
    this.renderer.setAnimationLoop(this.animate);
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 1.4);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff7ed, 1.8);
    sun.position.set(0.5, 3.0, 1.0);
    this.scene.add(sun);

    const backGlow = new THREE.PointLight(0x00f0ff, 1.5, 3.5);
    backGlow.position.set(0, 1.5, -1.6);
    this.scene.add(backGlow);
  }

  private buildCinemaDimmer(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(6.0, 32, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x010307,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 1.2, 0);
    return mesh;
  }

  private buildRoomSimulator(): THREE.Group {
    const group = new THREE.Group();

    // Wood floor
    const floorGeo = new THREE.PlaneGeometry(12, 12);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x181512,
      roughness: 0.85,
      metalness: 0.1,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    group.add(floor);

    // Soft rug
    const rugGeo = new THREE.PlaneGeometry(3.4, 3.4);
    const rugMat = new THREE.MeshStandardMaterial({
      color: 0x222226,
      roughness: 0.95,
      metalness: 0.0,
    });
    const rug = new THREE.Mesh(rugGeo, rugMat);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.005, -0.6);
    group.add(rug);

    // Modern back wall
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x141418,
      roughness: 0.9,
    });
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), wallMat);
    backWall.position.set(0, 3, -3.8);
    group.add(backWall);

    return group;
  }

  private buildReachArc(): THREE.Line {
    const points: THREE.Vector3[] = [];
    const radius = 0.85;
    for (let a = -Math.PI * 0.45; a <= Math.PI * 0.45; a += 0.05) {
      points.push(new THREE.Vector3(Math.sin(a) * radius, 0.02, -Math.cos(a) * radius));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.25,
    });
    return new THREE.Line(geo, mat);
  }

  /**
   * Reset panels to comfortable seated ergonomic wrap-around cockpit (eye level 1.2m, arm reach 0.75m)
   */
  public resetWorkspacePositions(): void {
    // Right Screen: Media Screen at x: 0.55, y: 1.2, z: -0.75, rotated inward at -0.35 rad
    this.cinemaPanel.group.position.set(0.55, 1.2, -0.75);
    this.cinemaPanel.group.rotation.set(0, -0.35, 0);

    // Left Screen: Web Deck at x: -0.55, y: 1.2, z: -0.75, rotated inward at 0.35 rad
    this.webDeckPanel.group.position.set(-0.55, 1.2, -0.75);
    this.webDeckPanel.group.rotation.set(0, 0.35, 0);

    this.audio.playWindowSnap();
  }

  public togglePassthroughSimulator(): boolean {
    this.isPassthroughSimActive = !this.isPassthroughSimActive;
    this.roomSimGroup.visible = this.isPassthroughSimActive && !this.isInMR;
    return this.isPassthroughSimActive;
  }

  /**
   * Unified Interactive Meshes for 2D Raycast and WebXR Fingertip Poke
   */
  public getAllInteractiveMeshes(): THREE.Mesh[] {
    return [
      ...this.cinemaPanel.getInteractiveMeshes(),
      ...this.webDeckPanel.getInteractiveMeshes(),
    ];
  }

  // Alias for interactiveButtons
  public getAllInteractiveButtons(): THREE.Mesh[] {
    return this.getAllInteractiveMeshes();
  }

  /**
   * Dual-Mode Input Pipeline: Standard Desktop 2D Raycasting
   */
  private setupDesktopInteractions(): void {
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  private onPointerDown = (event: PointerEvent): void => {
    // 1. Only run desktop raycasting when NOT in an active WebXR session
    if (this.renderer.xr.isPresenting) return;

    // Allow standard DOM HTML elements (like header buttons or modal close) to work naturally
    if ((event.target as HTMLElement)?.closest('button, a, input, textarea, [role="button"]')) {
      return;
    }

    this.isMouseDown = true;

    // 2. Calculate normalized device coordinates (-1 to +1)
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.mouseVec.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouseVec.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    } else {
      this.mouseVec.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mouseVec.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    this.raycaster.setFromCamera(this.mouseVec, this.camera);
    const interactiveButtons = this.getAllInteractiveMeshes();

    // 3. Intersect against interactive buttons & screens
    const intersects = this.raycaster.intersectObjects(interactiveButtons, true);

    if (intersects.length > 0) {
      const hit = intersects[0];
      let target: THREE.Object3D | null = hit.object;

      // Check if clicked element or its parent is a handle for window dragging
      let handleCandidate: THREE.Object3D | null = target;
      while (handleCandidate && handleCandidate.userData?.type !== 'handle' && handleCandidate.parent) {
        handleCandidate = handleCandidate.parent;
      }
      if (handleCandidate && handleCandidate.userData?.type === 'handle' && handleCandidate.userData.panelGroup) {
        this.renderer.domElement.style.cursor = 'grabbing';
        this.handController.simulateMouseInteraction(
          hit.point,
          'down',
          this.camera.position,
          interactiveButtons
        );
        return;
      }

      // Find the button or screen object with onClick / onTrigger handler
      while (target && !target.userData?.onClick && !target.userData?.onTrigger && target.parent) {
        target = target.parent;
      }

      const clickHandler = target?.userData?.onClick || target?.userData?.onTrigger;
      if (target && typeof clickHandler === 'function') {
        // Visual button depression feedback
        const origZ = target.userData.originalZ ?? target.position.z;
        target.position.z = origZ - 0.006;
        setTimeout(() => {
          if (target) target.position.z = origZ;
        }, 120);

        this.audio.playClick(1.2);
        clickHandler(hit.point, hit.uv);
        return;
      }
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (this.renderer.xr.isPresenting) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.mouseVec.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouseVec.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    } else {
      this.mouseVec.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mouseVec.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    this.raycaster.setFromCamera(this.mouseVec, this.camera);
    const interactiveButtons = this.getAllInteractiveMeshes();

    // If mouse is down, simulate handle drag
    if (this.isMouseDown) {
      const hitPt = this.camera.position
        .clone()
        .add(this.raycaster.ray.direction.clone().multiplyScalar(0.82));

      this.handController.simulateMouseInteraction(
        hitPt,
        'move',
        this.camera.position,
        interactiveButtons
      );
      return;
    }

    // Dynamic Hover Cursor for Desktop Experience
    const intersects = this.raycaster.intersectObjects(interactiveButtons, true);
    if (intersects.length > 0) {
      let target: THREE.Object3D | null = intersects[0].object;
      while (target && !target.userData?.type && !target.userData?.onClick && !target.userData?.onTrigger && target.parent) {
        target = target.parent;
      }
      if (target?.userData?.type === 'handle') {
        this.renderer.domElement.style.cursor = 'grab';
      } else if (target?.userData?.onClick || target?.userData?.onTrigger || target?.userData?.type === 'screen' || target?.userData?.type === 'button') {
        this.renderer.domElement.style.cursor = 'pointer';
      } else {
        this.renderer.domElement.style.cursor = 'default';
      }
    } else {
      this.renderer.domElement.style.cursor = 'default';
    }
  };

  private onPointerUp = (): void => {
    if (this.renderer.xr.isPresenting) return;
    this.isMouseDown = false;
    this.renderer.domElement.style.cursor = 'default';
    this.handController.simulateMouseInteraction(
      new THREE.Vector3(),
      'up',
      this.camera.position,
      this.getAllInteractiveMeshes()
    );
  };

  private onWindowResize = (): void => {
    if (!this.container) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private setupMREntryButton(): void {
    const btn = document.createElement('button');
    btn.id = 'enter-mr-button';
    btn.textContent = 'ENTER MR / PASSTHROUGH';
    btn.style.position = 'absolute';
    btn.style.bottom = '28px';
    btn.style.left = '50%';
    btn.style.transform = 'translateX(-50%)';
    btn.style.padding = '14px 32px';
    btn.style.border = '1px solid rgba(0, 240, 255, 0.6)';
    btn.style.borderRadius = '9999px';
    btn.style.background = 'rgba(3, 7, 18, 0.88)';
    btn.style.backdropFilter = 'blur(12px)';
    btn.style.color = '#38bdf8';
    btn.style.fontFamily = 'monospace';
    btn.style.fontSize = '14px';
    btn.style.fontWeight = 'bold';
    btn.style.letterSpacing = '1.5px';
    btn.style.cursor = 'pointer';
    btn.style.zIndex = '999';
    btn.style.pointerEvents = 'auto';
    btn.style.boxShadow = '0 0 24px rgba(56, 189, 248, 0.3)';
    btn.style.transition = 'all 0.2s ease';

    const onSessionStarted = async (session: XRSession) => {
      session.addEventListener('end', onSessionEnded);
      await this.renderer.xr.setSession(session);
      this.currentSession = session;
      this.isInMR = true;
      btn.textContent = 'EXIT MR';

      this.roomSimGroup.visible = false;
      this.renderer.setClearColor(0x000000, 0);
    };

    const onSessionEnded = () => {
      if (this.currentSession) {
        this.currentSession.removeEventListener('end', onSessionEnded);
        this.currentSession = null;
      }
      this.isInMR = false;
      btn.textContent = 'ENTER MR / PASSTHROUGH';

      this.roomSimGroup.visible = this.isPassthroughSimActive;
    };

    btn.onclick = async () => {
      if (this.currentSession) {
        this.currentSession.end();
        return;
      }

      if (!navigator.xr) {
        alert('WebXR is not supported on this browser. Open in Meta Quest Browser for Mixed Reality!');
        return;
      }

      const sessionOptions = {
        requiredFeatures: ['local-floor', 'hand-tracking'],
        optionalFeatures: ['bounded-floor', 'layers', 'hit-test'],
      };

      try {
        const isArSupported = await navigator.xr.isSessionSupported('immersive-ar');
        if (isArSupported) {
          const session = await navigator.xr.requestSession('immersive-ar', sessionOptions);
          await onSessionStarted(session);
          return;
        }

        const isVrSupported = await navigator.xr.isSessionSupported('immersive-vr');
        if (isVrSupported) {
          const session = await navigator.xr.requestSession('immersive-vr', sessionOptions);
          await onSessionStarted(session);
          return;
        }

        alert('Immersive AR/VR is not supported on this device.');
      } catch (err) {
        console.error('Failed to launch WebXR session:', err);
        try {
          const session = await navigator.xr.requestSession('immersive-vr', {
            optionalFeatures: ['local-floor', 'hand-tracking'],
          });
          await onSessionStarted(session);
        } catch (e) {
          console.error('Fallback failed:', e);
          alert('Could not start WebXR session: ' + (e as Error).message);
        }
      }
    };

    this.container.appendChild(btn);
    this.mrButtonElement = btn;
  }

  /**
   * Main per-frame render loop (72/90/120 FPS target)
   */
  private animate = (_timestamp: number, _frame?: XRFrame): void => {
    const delta = Math.min(this.clock.getDelta(), 0.05);

    // 1. Cinema Dimmer Smooth Interpolation
    this.cinemaDimmerCurrentOpacity +=
      (this.cinemaDimmerTargetOpacity - this.cinemaDimmerCurrentOpacity) * 0.08;
    (this.cinemaDimmerMesh.material as THREE.MeshBasicMaterial).opacity =
      this.cinemaDimmerCurrentOpacity;

    this.cinemaDimmerMesh.position.copy(this.camera.position);

    // 2. Update WebXR Hands and Direct Fingertip Poke Engine
    const interactiveMeshes = this.getAllInteractiveMeshes();
    this.handController.update(delta, this.camera.position, interactiveMeshes);

    // 3. Update Panels
    this.cinemaPanel.update(delta);
    this.webDeckPanel.update(delta);

    // 4. Render Three.js Scene
    this.renderer.render(this.scene, this.camera);

    // 5. Update React UI state
    if (this.onStateChange) {
      const leftTracked = this.handController.handStates[0].isTracked;
      const rightTracked = this.handController.handStates[1].isTracked;
      const completedTasks = this.webDeckPanel.tasks.filter((t) => t.completed).length;

      this.onStateChange({
        isInMR: this.isInMR,
        isCinemaMode: this.cinemaPanel.isCinemaMode,
        isVideoPlaying: this.cinemaPanel.isPlaying,
        activeWebTab: this.webDeckPanel.activeTab,
        pomodoroRemainingSec: Math.round(this.webDeckPanel.pomodoroRemainingSec),
        completedTasksCount: completedTasks,
        isAudioEnabled: this.audio.getSoundEnabled(),
        leftHandTracked: leftTracked,
        rightHandTracked: rightTracked,
        isPassthroughSimActive: this.isPassthroughSimActive,
      });
    }
  };

  public destroy(): void {
    window.removeEventListener('resize', this.onWindowResize);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.renderer.setAnimationLoop(null);
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
