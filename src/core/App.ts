/**
 * App - Main Spatial Computing Engine for "AetherDesk MR"
 * Standards:
 * - Meta Horizon OS Mixed Reality Architecture
 * - Pure Room Passthrough (immersive-ar with local-floor and hand-tracking)
 * - Cinema Mode Room Dimmer Dome
 * - Seated/Couch Ergonomic Arc (0.6m - 1.2m reachable zone)
 * - Triple-Panel Glassmorphic Workspace
 * - Desktop Passthrough Simulator for non-VR reviewers
 */

import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { HandController } from '../xr/HandController';
import { MediaPanel } from '../panels/MediaPanel';
import { WidgetsPanel } from '../panels/WidgetsPanel';
import { ArtifactPanel } from '../panels/ArtifactPanel';

export interface AppStateUpdate {
  isInMR: boolean;
  isCinemaMode: boolean;
  activeChannelName: string;
  isTimerRunning: boolean;
  pomodoroRemainingSec: number;
  completedTasksCount: number;
  totalTasksCount: number;
  activeModelName: string;
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

  // Triple-Panel Workspace
  public mediaPanel: MediaPanel;
  public widgetsPanel: WidgetsPanel;
  public artifactPanel: ArtifactPanel;

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

  // Desktop interaction raycaster
  private raycaster: THREE.Raycaster;
  private mouseVec: THREE.Vector2;
  private isMouseDown: boolean = false;
  private currentSession: XRSession | null = null;
  public mrButtonElement: HTMLElement | null = null;

  constructor(container: HTMLElement, onStateChange?: (state: AppStateUpdate) => void) {
    this.container = container;
    this.onStateChange = onStateChange;
    this.clock = new THREE.Clock();

    // 1. Scene Setup (Alpha true for MR Passthrough)
    this.scene = new THREE.Scene();

    // 2. Camera at Seated Position (0, 1.2, 0)
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(65, aspect, 0.05, 50);
    this.camera.position.set(0, 1.2, 0);
    this.camera.lookAt(0, 1.2, -0.85);

    // 3. WebGLRenderer configured for WebXR Passthrough
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true, // Crucial for real room passthrough
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0); // Transparent canvas background
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.xr.enabled = true;

    container.appendChild(this.renderer.domElement);

    // 4. Lighting
    this.setupLighting();

    // 5. Audio Synthesizer
    this.audio = new AudioEngine();

    // 6. Cinema Dimmer Dome (Inverted sphere around user)
    this.cinemaDimmerMesh = this.buildCinemaDimmer();
    this.scene.add(this.cinemaDimmerMesh);

    // 7. Desktop Room Simulator (Chic minimal living room for desktop preview)
    this.roomSimGroup = this.buildRoomSimulator();
    this.scene.add(this.roomSimGroup);

    // 8. Seated 0.85m Arc Visualizer
    this.reachArcMesh = this.buildReachArc();
    this.scene.add(this.reachArcMesh);

    // 9. Build Triple-Panel Spatial Workspace
    this.mediaPanel = new MediaPanel(this.audio, (active) => {
      this.cinemaDimmerTargetOpacity = active ? 0.92 : 0.0;
    });

    this.widgetsPanel = new WidgetsPanel(this.audio);
    this.artifactPanel = new ArtifactPanel(this.audio);

    this.scene.add(this.mediaPanel.group);
    this.scene.add(this.widgetsPanel.group);
    this.scene.add(this.artifactPanel.group);

    // Position panels in comfortable ergonomic seated arc
    this.resetWorkspacePositions();

    // 10. WebXR Hand Controller Engine
    this.handController = new HandController(this.scene, this.renderer, this.audio);

    // 11. Desktop Mouse Interactions
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
    // Soft ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambient);

    // Directional ceiling light
    const sun = new THREE.DirectionalLight(0xfff7ed, 1.6);
    sun.position.set(0.5, 3.0, 1.0);
    this.scene.add(sun);

    // Subtle cyan backlight for glass panels
    const backGlow = new THREE.PointLight(0x00f0ff, 1.2, 3.0);
    backGlow.position.set(0, 1.5, -1.5);
    this.scene.add(backGlow);
  }

  /**
   * Cinema Mode Dimmer: Inverted sphere that fades to black in the user's room
   */
  private buildCinemaDimmer(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(6.0, 32, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x020408,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 1.2, 0);
    return mesh;
  }

  /**
   * Desktop Passthrough Simulator (Renders a realistic living room environment on non-VR monitors)
   */
  private buildRoomSimulator(): THREE.Group {
    const group = new THREE.Group();

    // Wood floor
    const floorGeo = new THREE.PlaneGeometry(12, 12);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1e1b18,
      roughness: 0.8,
      metalness: 0.1,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    group.add(floor);

    // Soft modern rug under seated area
    const rugGeo = new THREE.PlaneGeometry(3.2, 3.2);
    const rugMat = new THREE.MeshStandardMaterial({
      color: 0x27272a,
      roughness: 0.95,
      metalness: 0.0,
    });
    const rug = new THREE.Mesh(rugGeo, rugMat);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.005, -0.6);
    group.add(rug);

    // Minimalist walls
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.9,
    });
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), wallMat);
    backWall.position.set(0, 3, -3.8);
    group.add(backWall);

    // Subtle modern window frame showing night skyline
    const windowGeo = new THREE.PlaneGeometry(4.5, 3.0);
    const windowMat = new THREE.MeshBasicMaterial({
      color: 0x090d16,
    });
    const windowMesh = new THREE.Mesh(windowGeo, windowMat);
    windowMesh.position.set(0, 2.6, -3.78);
    group.add(windowMesh);

    return group;
  }

  /**
   * Seated Reach Arc Visualizer (Subtle floor curve at 0.85m)
   */
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
   * Reset panels to comfortable seated ergonomic arc (0.85m radius, eye level 1.2m)
   */
  public resetWorkspacePositions(): void {
    const userEye = new THREE.Vector3(0, 1.2, 0);

    // Center Media Panel: straight ahead at -0.85m
    this.mediaPanel.group.position.set(0, 1.22, -0.85);
    this.mediaPanel.group.lookAt(userEye);

    // Left Widgets Panel: 32 deg left
    const leftAngle = THREE.MathUtils.degToRad(-32);
    const leftDist = 0.82;
    this.widgetsPanel.group.position.set(
      Math.sin(leftAngle) * leftDist,
      1.18,
      -Math.cos(leftAngle) * leftDist
    );
    this.widgetsPanel.group.lookAt(userEye);

    // Right Artifact Panel: 32 deg right
    const rightAngle = THREE.MathUtils.degToRad(32);
    const rightDist = 0.82;
    this.artifactPanel.group.position.set(
      Math.sin(rightAngle) * rightDist,
      1.18,
      -Math.cos(rightAngle) * rightDist
    );
    this.artifactPanel.group.lookAt(userEye);

    this.audio.playWindowSnap();
  }

  public togglePassthroughSimulator(): boolean {
    this.isPassthroughSimActive = !this.isPassthroughSimActive;
    this.roomSimGroup.visible = this.isPassthroughSimActive && !this.isInMR;
    return this.isPassthroughSimActive;
  }

  /**
   * Official WebXR Session Launcher: Supports immersive-ar (Pure Passthrough) & immersive-vr fallback
   */
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
    btn.style.boxShadow = '0 0 24px rgba(56, 189, 248, 0.3)';
    btn.style.transition = 'all 0.2s ease';

    const onSessionStarted = async (session: XRSession) => {
      session.addEventListener('end', onSessionEnded);
      await this.renderer.xr.setSession(session);
      this.currentSession = session;
      this.isInMR = true;
      btn.textContent = 'EXIT MR';

      // Hide desktop room simulator in real passthrough
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

      // Restore desktop room simulator if active
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
        // Try native immersive-ar first (Pure Quest Passthrough)
        const isArSupported = await navigator.xr.isSessionSupported('immersive-ar');
        if (isArSupported) {
          const session = await navigator.xr.requestSession('immersive-ar', sessionOptions);
          await onSessionStarted(session);
          return;
        }

        // Fallback to immersive-vr with transparent background
        const isVrSupported = await navigator.xr.isSessionSupported('immersive-vr');
        if (isVrSupported) {
          const session = await navigator.xr.requestSession('immersive-vr', sessionOptions);
          await onSessionStarted(session);
          return;
        }

        alert('Immersive AR/VR is not supported on this device.');
      } catch (err) {
        console.error('Failed to launch WebXR session:', err);
        // Retry with optional features only
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
   * Desktop mouse simulation for reviewers testing on non-VR browsers
   */
  private setupDesktopInteractions(): void {
    const dom = this.renderer.domElement;

    const getRaycastHits = (clientX: number, clientY: number) => {
      const rect = dom.getBoundingClientRect();
      this.mouseVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      this.mouseVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouseVec, this.camera);
    };

    dom.addEventListener('pointerdown', (e: PointerEvent) => {
      if (this.isInMR) return;
      this.isMouseDown = true;
      getRaycastHits(e.clientX, e.clientY);

      const hitHandles = [
        this.mediaPanel.handleMesh,
        this.widgetsPanel.handleMesh,
        this.artifactPanel.handleMesh,
        this.mediaPanel.resizePinMesh,
        this.widgetsPanel.resizePinMesh,
        this.artifactPanel.resizePinMesh,
        this.artifactPanel.hologramContainer,
      ];

      const handleIntersects = this.raycaster.intersectObjects(hitHandles, true);
      if (handleIntersects.length > 0) {
        const hit = handleIntersects[0];
        this.handController.simulateMouseInteraction(
          hit.point,
          'down',
          this.camera.position,
          [this.mediaPanel, this.widgetsPanel, this.artifactPanel],
          this.artifactPanel
        );
        return;
      }

      // Check panel face click (Direct Touch UV)
      const panelScreens = [
        this.mediaPanel.screenMesh,
        this.widgetsPanel.panelMesh,
        this.artifactPanel.panelMesh,
      ];
      const panelIntersects = this.raycaster.intersectObjects(panelScreens, false);

      if (panelIntersects.length > 0) {
        const hit = panelIntersects[0];
        if (hit.uv) {
          if (hit.object === this.mediaPanel.screenMesh) {
            this.mediaPanel.handleTouchUV(hit.uv.x, hit.uv.y);
          } else if (hit.object === this.widgetsPanel.panelMesh) {
            this.widgetsPanel.handleTouchUV(hit.uv.x, hit.uv.y);
          } else if (hit.object === this.artifactPanel.panelMesh) {
            this.artifactPanel.handleTouchUV(hit.uv.x, hit.uv.y);
          }
        }
      }
    });

    window.addEventListener('pointermove', (e: PointerEvent) => {
      if (this.isInMR || !this.isMouseDown) return;
      getRaycastHits(e.clientX, e.clientY);

      // Compute hit point on virtual plane at panel depth
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0.85);
      const hitPt = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(plane, hitPt)) {
        this.handController.simulateMouseInteraction(
          hitPt,
          'move',
          this.camera.position,
          [this.mediaPanel, this.widgetsPanel, this.artifactPanel],
          this.artifactPanel
        );
      }
    });

    window.addEventListener('pointerup', () => {
      if (this.isInMR) return;
      this.isMouseDown = false;
      this.handController.simulateMouseInteraction(
        new THREE.Vector3(),
        'up',
        this.camera.position,
        [this.mediaPanel, this.widgetsPanel, this.artifactPanel],
        this.artifactPanel
      );
    });
  }

  private onWindowResize = (): void => {
    if (!this.container) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

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

    // Follow camera position so dimmer is always centered on user head
    this.cinemaDimmerMesh.position.copy(this.camera.position);

    // 2. Update WebXR Hands and Spatial Gestures
    this.handController.update(
      delta,
      this.camera.position,
      this.mediaPanel,
      this.widgetsPanel,
      this.artifactPanel
    );

    // 3. Update Panels
    this.mediaPanel.update(delta);
    this.widgetsPanel.update(delta);
    this.artifactPanel.update(delta);

    // 4. Render Three.js Scene
    this.renderer.render(this.scene, this.camera);

    // 5. Update React UI state
    if (this.onStateChange) {
      const leftTracked = this.handController.handStates[0].isTracked;
      const rightTracked = this.handController.handStates[1].isTracked;
      const completedTasks = this.widgetsPanel.tasks.filter((t) => t.completed).length;

      this.onStateChange({
        isInMR: this.isInMR,
        isCinemaMode: this.mediaPanel.isCinemaMode,
        activeChannelName: this.mediaPanel.channels[this.mediaPanel.currentChannel],
        isTimerRunning: this.widgetsPanel.isTimerRunning,
        pomodoroRemainingSec: Math.round(this.widgetsPanel.pomodoroRemainingSec),
        completedTasksCount: completedTasks,
        totalTasksCount: this.widgetsPanel.tasks.length,
        activeModelName: this.artifactPanel.modelNames[0],
        isAudioEnabled: this.audio.getSoundEnabled(),
        leftHandTracked: leftTracked,
        rightHandTracked: rightTracked,
        isPassthroughSimActive: this.isPassthroughSimActive,
      });
    }
  };

  public destroy(): void {
    window.removeEventListener('resize', this.onWindowResize);
    this.renderer.setAnimationLoop(null);
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
