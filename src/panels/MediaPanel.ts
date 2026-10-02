/**
 * MediaPanel - Center Immersive Media Player Panel
 * 100% Component Encapsulated:
 * - All meshes parented strictly to this.group
 * - Real 3D SpatialButtons for Playback, Channel Switcher, and Cinema Mode
 * - Full WebXR fingertip poke & controller raycast select support
 */

import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { SpatialButton } from '../ui/SpatialButton';

export class MediaPanel {
  public group: THREE.Group;
  public screenMesh: THREE.Mesh;
  public handleMesh: THREE.Mesh;
  public topBarMesh: THREE.Mesh;
  public bottomBarHitbox: THREE.Mesh;
  public topBarHitbox: THREE.Mesh;
  public resizePinMesh: THREE.Mesh;
  private edgeLines: THREE.LineSegments;
  private handleMat: THREE.MeshStandardMaterial;
  private topBarMat: THREE.MeshStandardMaterial;

  // Real 3D Interactive Buttons
  public buttons: SpatialButton[] = [];
  public interactiveButtonMeshes: THREE.Mesh[] = [];

  private btnPrev!: SpatialButton;
  private btnPlay!: SpatialButton;
  private btnNext!: SpatialButton;
  private btnSource!: SpatialButton;
  private btnCinema!: SpatialButton;

  // Visualizer Canvas & Texture
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;

  // Playback State
  public isPlaying: boolean = true;
  public currentTime: number = 42; // seconds
  public duration: number = 210; // seconds
  public currentChannel: number = 0;
  public isCinemaMode: boolean = false;
  public scaleFactor: number = 1.0;
  public isDragging: boolean = false;
  public isHovered: boolean = false;

  // Dimensions
  public baseWidth: number = 0.88;
  public baseHeight: number = 0.52;

  // Channel Names
  public readonly channels = [
    'CYBER WAVE SPECTRUM',
    'COSMIC NEBULA 4K',
    'SPATIAL MATRIX TELEMETRY',
    'HORIZON SUNSET VIBES',
  ];

  private audio: AudioEngine;
  private onCinemaToggle?: (active: boolean) => void;

  constructor(audio: AudioEngine, onCinemaToggle?: (active: boolean) => void) {
    this.audio = audio;
    this.onCinemaToggle = onCinemaToggle;
    this.group = new THREE.Group();

    // 1. Setup Canvas Texture (1024x576 for crisp 16:9 VR legibility)
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 576;
    this.ctx = this.canvas.getContext('2d')!;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    // 2. Build Curved Screen Geometry
    const radius = 2.4;
    const thetaLength = this.baseWidth / radius;
    const screenGeo = new THREE.CylinderGeometry(
      radius,
      radius,
      this.baseHeight,
      32,
      1,
      true,
      -thetaLength / 2 + Math.PI,
      thetaLength
    );

    const screenMat = new THREE.MeshBasicMaterial({
      map: this.texture,
      side: THREE.DoubleSide,
    });

    this.screenMesh = new THREE.Mesh(screenGeo, screenMat);
    this.screenMesh.position.set(0, 0, 0);
    this.group.add(this.screenMesh);

    // 3. Screen Bezel & Frosted Glass Backing
    const bezelGeo = new THREE.CylinderGeometry(
      radius + 0.002,
      radius + 0.002,
      this.baseHeight + 0.02,
      32,
      1,
      true,
      -thetaLength / 2 - 0.01 + Math.PI,
      thetaLength + 0.02
    );
    const bezelMat = new THREE.MeshStandardMaterial({
      color: 0x0a101f,
      roughness: 0.25,
      metalness: 0.85,
      transparent: true,
      opacity: 0.75,
      side: THREE.BackSide,
    });
    const bezel = new THREE.Mesh(bezelGeo, bezelMat);
    bezel.position.set(0, 0, -0.002);
    this.group.add(bezel);

    // Subtle edge glow wire
    const edgeGeo = new THREE.EdgesGeometry(bezelGeo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.35,
    });
    this.edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    this.group.add(this.edgeLines);

    // 4. Horizon OS Top Title Bar for moving (Active Grab Target)
    const topBarGeo = new THREE.CylinderGeometry(0.009, 0.009, this.baseWidth * 0.72, 16);
    this.topBarMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.4,
      metalness: 0.9,
      roughness: 0.2,
    });
    this.topBarMesh = new THREE.Mesh(topBarGeo, this.topBarMat);
    this.topBarMesh.rotation.z = Math.PI / 2;
    this.topBarMesh.position.set(0, this.baseHeight / 2 + 0.038, 0.01);
    this.group.add(this.topBarMesh);

    // Top Bar 0.15m Hitbox for effortless grabbing
    const topHitGeo = new THREE.BoxGeometry(this.baseWidth * 0.85, 0.16, 0.16);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.topBarHitbox = new THREE.Mesh(topHitGeo, hitMat);
    this.topBarHitbox.position.copy(this.topBarMesh.position);
    this.group.add(this.topBarHitbox);

    // 5. Horizon OS Bottom Pill Handle for moving (Active Grab Target)
    const handleGeo = new THREE.CylinderGeometry(0.009, 0.009, this.baseWidth * 0.55, 16);
    this.handleMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.4,
      metalness: 0.9,
      roughness: 0.2,
    });
    this.handleMesh = new THREE.Mesh(handleGeo, this.handleMat);
    this.handleMesh.rotation.z = Math.PI / 2;
    this.handleMesh.position.set(0, -this.baseHeight / 2 - 0.038, 0.01);
    this.group.add(this.handleMesh);

    // Bottom Bar 0.15m Hitbox for effortless grabbing
    const bottomHitGeo = new THREE.BoxGeometry(this.baseWidth * 0.75, 0.16, 0.16);
    this.bottomBarHitbox = new THREE.Mesh(bottomHitGeo, hitMat);
    this.bottomBarHitbox.position.copy(this.handleMesh.position);
    this.group.add(this.bottomBarHitbox);

    // 6. Corner Resize Pin (Top-Right)
    const pinGeo = new THREE.SphereGeometry(0.018, 16, 16);
    const pinMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.6,
      metalness: 0.8,
      roughness: 0.2,
    });
    this.resizePinMesh = new THREE.Mesh(pinGeo, pinMat);
    this.resizePinMesh.position.set(this.baseWidth / 2 + 0.02, this.baseHeight / 2 + 0.02, 0.01);
    this.group.add(this.resizePinMesh);

    // 7. Construct Real 3D Interactive Buttons Parented Directly to this.group
    this.build3DButtons();

    // Initial render
    this.renderCanvas(0);
  }

  private build3DButtons(): void {
    const btnY = -this.baseHeight / 2 + 0.048; // Y: -0.212
    const btnZ = 0.018;

    // [◀ PREV]
    this.btnPrev = new SpatialButton({
      width: 0.10,
      height: 0.036,
      label: '◀ PREV',
      color: 0x1e293b,
      onClick: () => {
        this.currentChannel =
          (this.currentChannel - 1 + this.channels.length) % this.channels.length;
        this.audio.playClick(0.9);
      },
    });
    this.btnPrev.setPosition(-0.28, btnY, btnZ);
    this.addButton(this.btnPrev);

    // [▶ PLAY / ⏸ PAUSE]
    this.btnPlay = new SpatialButton({
      width: 0.13,
      height: 0.036,
      label: '⏸ PAUSE',
      color: 0x0284c7,
      activeColor: 0x10b981,
      onClick: () => {
        this.isPlaying = !this.isPlaying;
        this.btnPlay.updateLabel(this.isPlaying ? '⏸ PAUSE' : '▶ PLAY', this.isPlaying);
        this.audio.playClick(this.isPlaying ? 1.2 : 0.8);
      },
    });
    this.btnPlay.setPosition(-0.14, btnY, btnZ);
    this.btnPlay.updateLabel('⏸ PAUSE', true);
    this.addButton(this.btnPlay);

    // [NEXT ▶]
    this.btnNext = new SpatialButton({
      width: 0.10,
      height: 0.036,
      label: 'NEXT ▶',
      color: 0x1e293b,
      onClick: () => {
        this.currentChannel = (this.currentChannel + 1) % this.channels.length;
        this.audio.playClick(1.1);
      },
    });
    this.btnNext.setPosition(0.00, btnY, btnZ);
    this.addButton(this.btnNext);

    // [⚡ SOURCE]
    this.btnSource = new SpatialButton({
      width: 0.15,
      height: 0.036,
      label: '⚡ SOURCE',
      color: 0x7c3aed,
      onClick: () => {
        this.currentChannel = (this.currentChannel + 1) % this.channels.length;
        this.audio.playClick(1.3);
      },
    });
    this.btnSource.setPosition(0.145, btnY, btnZ);
    this.addButton(this.btnSource);

    // [✦ CINEMA MODE]
    this.btnCinema = new SpatialButton({
      width: 0.15,
      height: 0.036,
      label: '✦ CINEMA',
      color: 0x334155,
      activeColor: 0x10b981,
      onClick: () => {
        this.toggleCinemaMode();
      },
    });
    this.btnCinema.setPosition(0.31, btnY, btnZ);
    this.addButton(this.btnCinema);
  }

  private addButton(btn: SpatialButton): void {
    this.buttons.push(btn);
    this.interactiveButtonMeshes.push(btn.mesh);
    // CRITICAL: Parent button directly to this.group so it moves synchronously with the window
    this.group.add(btn.mesh);
  }

  public getInteractiveButtons(): THREE.Mesh[] {
    return this.interactiveButtonMeshes;
  }

  public setGrabHighlight(active: boolean): void {
    this.isHovered = active;
    const targetColor = active ? 0x00ffff : 0x38bdf8;
    const targetEmissive = active ? 0x00f0ff : 0x0284c7;
    const intensity = active ? 1.4 : 0.4;

    this.handleMat.color.setHex(targetColor);
    this.handleMat.emissive.setHex(targetEmissive);
    this.handleMat.emissiveIntensity = intensity;

    this.topBarMat.color.setHex(targetColor);
    this.topBarMat.emissive.setHex(targetEmissive);
    this.topBarMat.emissiveIntensity = intensity;

    (this.edgeLines.material as THREE.LineBasicMaterial).color.setHex(active ? 0x00ffff : 0x00f0ff);
    (this.edgeLines.material as THREE.LineBasicMaterial).opacity = active ? 0.85 : 0.35;
  }

  public setDraggingState(dragging: boolean): void {
    this.isDragging = dragging;
    const multiplier = dragging ? 1.02 : 1.0;
    const s = this.scaleFactor * multiplier;
    this.group.scale.set(s, s, s);
    this.setGrabHighlight(dragging);
  }

  public update(delta: number): void {
    if (this.isPlaying) {
      this.currentTime = (this.currentTime + delta) % this.duration;
    }
    const time = performance.now() * 0.001;
    this.renderCanvas(time);
    this.texture.needsUpdate = true;
  }

  private renderCanvas(time: number): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (this.currentChannel === 0) {
      // 1. CYBER WAVE SPECTRUM
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#030712');
      grad.addColorStop(1, '#0f172a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Grid lines
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.12)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      // Dynamic Audio Frequency Bars
      const numBars = 48;
      const barWidth = (w - 120) / numBars;
      for (let i = 0; i < numBars; i++) {
        const freq = Math.sin(time * 4 + i * 0.28) * 0.5 + 0.5;
        const sub = Math.cos(time * 6 + i * 0.14) * 0.3;
        const height = (freq + sub + 0.1) * (h * 0.42);

        const bx = 60 + i * barWidth;
        const by = h - 140 - height;

        const barGrad = ctx.createLinearGradient(0, by, 0, by + height);
        barGrad.addColorStop(0, '#38bdf8');
        barGrad.addColorStop(0.6, '#06b6d4');
        barGrad.addColorStop(1, '#6366f1');

        ctx.fillStyle = barGrad;
        ctx.fillRect(bx, by, barWidth - 3, height);
      }

      // Smooth Waveform Overlay
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 60; x < w - 60; x += 6) {
        const y = h / 2 - 40 + Math.sin(x * 0.015 + time * 5) * 45 + Math.cos(x * 0.03 + time * 3) * 20;
        if (x === 60) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

    } else if (this.currentChannel === 1) {
      // 2. COSMIC NEBULA 4K
      ctx.fillStyle = '#02040a';
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2 + Math.sin(time * 0.8) * 60;
      const cy = h / 2 + Math.cos(time * 0.6) * 40;
      const nebGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, 380);
      nebGrad.addColorStop(0, 'rgba(217, 70, 239, 0.45)');
      nebGrad.addColorStop(0.5, 'rgba(124, 58, 237, 0.25)');
      nebGrad.addColorStop(1, 'rgba(2, 6, 23, 0)');

      ctx.fillStyle = nebGrad;
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < 60; i++) {
        const angle = time * 0.4 + i * (Math.PI * 2 / 60);
        const dist = 120 + Math.sin(time + i) * 80;
        const px = cx + Math.cos(angle) * dist;
        const py = cy + Math.sin(angle) * dist * 0.6;

        ctx.fillStyle = i % 2 === 0 ? '#38bdf8' : '#f43f5e';
        ctx.beginPath();
        ctx.arc(px, py, 2.5 + Math.sin(i) * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

    } else if (this.currentChannel === 2) {
      // 3. SPATIAL MATRIX TELEMETRY
      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, w, h);

      ctx.font = '14px monospace';
      ctx.fillStyle = 'rgba(52, 211, 153, 0.85)';
      ctx.textAlign = 'left';

      ctx.fillText('AETHER_CORE // SPATIAL OS RUNTIME v2.6.4', 60, 60);
      ctx.fillText(`FRAME_RATE: 90.0 FPS | XR_DEVICE: META QUEST 3`, 60, 85);
      ctx.fillText(`HEAD_TRACKING: 6DOF | HAND_ENGINE: W3C_XR_HAND`, 60, 110);
      ctx.fillText(`PASSTHROUGH_STATUS: ACTIVE | SEATED_ARC: 0.85M`, 60, 135);

      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 60; x < w - 60; x += 10) {
        const y = h / 2 + Math.sin(x * 0.02 + time * 8) * 35;
        if (x === 60) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

    } else {
      // 4. HORIZON SUNSET VIBES
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#312e81');
      grad.addColorStop(0.5, '#701a75');
      grad.addColorStop(1, '#f97316');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2 - 20, 80, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, h / 2 + 60, w, h);
    }

    // Top Header info overlay
    ctx.fillStyle = 'rgba(2, 6, 23, 0.75)';
    ctx.fillRect(0, 0, w, 52);

    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText(`IMMERSIVE MEDIA // CH: ${this.channels[this.currentChannel]}`, 40, 32);

    ctx.font = '14px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.fillText(
      `${this.formatTime(this.currentTime)} / ${this.formatTime(this.duration)}`,
      w - 40,
      32
    );

    // Bottom Scrubber Bar & Backplate
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fillRect(0, h - 86, w, 86);

    const scrubX = 40;
    const scrubY = h - 68;
    const scrubWidth = w - 80;
    const progress = this.currentTime / this.duration;

    // Track background
    ctx.fillStyle = '#334155';
    ctx.fillRect(scrubX, scrubY, scrubWidth, 6);

    // Track active fill
    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(scrubX, scrubY, scrubWidth * progress, 6);

    // Scrubber Knob
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(scrubX + scrubWidth * progress, scrubY + 3, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  public handleTouchUV(u: number, v: number): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const x = u * w;
    const y = (1 - v) * h;

    // Scrubber Click / Seek
    const scrubX = 40;
    const scrubY = h - 68;
    const scrubWidth = w - 80;
    if (y >= scrubY - 14 && y <= scrubY + 20 && x >= scrubX && x <= scrubX + scrubWidth) {
      const prog = (x - scrubX) / scrubWidth;
      this.currentTime = Math.max(0, Math.min(this.duration, prog * this.duration));
      this.audio.playScrubTick();
    }
  }

  public toggleCinemaMode(): void {
    this.isCinemaMode = !this.isCinemaMode;
    this.btnCinema.updateLabel(this.isCinemaMode ? '✦ ACTIVE' : '✦ CINEMA', this.isCinemaMode);
    this.audio.playWindowMove();

    const targetScale = this.isCinemaMode ? 1.45 : 1.0;
    this.scaleFactor = targetScale;
    this.group.scale.set(targetScale, targetScale, targetScale);

    if (this.onCinemaToggle) {
      this.onCinemaToggle(this.isCinemaMode);
    }
  }

  public setScale(factor: number): void {
    const clamped = Math.max(0.6, Math.min(2.0, factor));
    this.scaleFactor = clamped;
    const mult = this.isDragging ? 1.02 : 1.0;
    const finalScale = clamped * mult;
    this.group.scale.set(finalScale, finalScale, finalScale);
  }
}
