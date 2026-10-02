/**
 * MediaPanel - Center Immersive Media Player Panel
 * Features:
 * - Curved 16:9 glassmorphic screen with dynamic procedural visualizers
 * - Interactive timeline scrubber
 * - Touch-sensitive playback controls: Play/Pause, Channel Switch, Cinema Mode
 * - Horizon OS pill handle for free 3D window translation
 * - Corner resize pin for scaling
 */

import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';

export interface SpatialWindowHandle {
  mesh: THREE.Mesh;
  panelGroup: THREE.Group;
  initialOffset: THREE.Vector3;
  type: 'move' | 'resize';
}

export class MediaPanel {
  public group: THREE.Group;
  public screenMesh: THREE.Mesh;
  public handleMesh: THREE.Mesh;
  public resizePinMesh: THREE.Mesh;

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
    // Subtle cylinder curve for authentic VR cinema immersion
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
    // Cylinder faces outward, position at origin of panel
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
    const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    this.group.add(edgeLines);

    // 4. Horizon OS Bottom Pill Handle for moving
    const handleGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.24, 16);
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.4,
      metalness: 0.9,
      roughness: 0.2,
    });
    this.handleMesh = new THREE.Mesh(handleGeo, handleMat);
    this.handleMesh.rotation.z = Math.PI / 2;
    this.handleMesh.position.set(0, -this.baseHeight / 2 - 0.035, 0.01);
    this.group.add(this.handleMesh);

    // 5. Corner Resize Pin (Top-Right)
    const pinGeo = new THREE.SphereGeometry(0.015, 16, 16);
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

    // Initial render
    this.renderCanvas(0);
  }

  /**
   * Procedural video & visualizer rendering loop
   */
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

    // Background gradient based on channel
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

      // Radial glowing nebula clouds
      const cx = w / 2 + Math.sin(time * 0.8) * 60;
      const cy = h / 2 + Math.cos(time * 0.6) * 40;
      const nebGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, 380);
      nebGrad.addColorStop(0, 'rgba(217, 70, 239, 0.45)');
      nebGrad.addColorStop(0.5, 'rgba(124, 58, 237, 0.25)');
      nebGrad.addColorStop(1, 'rgba(2, 6, 23, 0)');

      ctx.fillStyle = nebGrad;
      ctx.fillRect(0, 0, w, h);

      // Orbiting particles
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

      // Telemetry graph
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

      // Glowing Sun
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2 - 20, 80, 0, Math.PI * 2);
      ctx.fill();

      // Horizon line
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

    // Bottom Playback Controls Bar
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fillRect(0, h - 90, w, 90);

    // Scrubber Bar
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

    // Control Buttons (Drawn on canvas for direct hit testing)
    const btnY = h - 35;
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';

    // [PREV]
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('◀◀ PREV', 100, btnY);

    // [PLAY / PAUSE]
    ctx.fillStyle = this.isPlaying ? '#38bdf8' : '#f59e0b';
    ctx.fillText(this.isPlaying ? '⏸ PAUSE' : '▶ PLAY', 220, btnY);

    // [NEXT]
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('NEXT ▶▶', 340, btnY);

    // [CHANNEL]
    ctx.fillStyle = '#c084fc';
    ctx.fillText('⚡ SWITCH SOURCE', 520, btnY);

    // [CINEMA MODE]
    ctx.fillStyle = this.isCinemaMode ? '#4ade80' : '#e2e8f0';
    ctx.fillText(this.isCinemaMode ? '✦ CINEMA ACTIVE' : '✦ CINEMA MODE', w - 140, btnY);
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  /**
   * Handle direct touch or click hit at UV coordinates (0..1, 0..1)
   */
  public handleTouchUV(u: number, v: number): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const x = u * w;
    const y = (1 - v) * h; // flip Y for Three.js UV

    // 1. Scrubber Click / Seek
    const scrubX = 40;
    const scrubY = h - 68;
    const scrubWidth = w - 80;
    if (y >= scrubY - 14 && y <= scrubY + 20 && x >= scrubX && x <= scrubX + scrubWidth) {
      const prog = (x - scrubX) / scrubWidth;
      this.currentTime = Math.max(0, Math.min(this.duration, prog * this.duration));
      this.audio.playScrubTick();
      return;
    }

    // 2. Playback Buttons (y in bottom bar)
    if (y >= h - 55 && y <= h - 15) {
      if (x >= 50 && x <= 150) {
        // PREV
        this.currentChannel =
          (this.currentChannel - 1 + this.channels.length) % this.channels.length;
        this.audio.playClick(0.9);
      } else if (x >= 170 && x <= 270) {
        // PLAY / PAUSE
        this.isPlaying = !this.isPlaying;
        this.audio.playClick(this.isPlaying ? 1.2 : 0.8);
      } else if (x >= 290 && x <= 390) {
        // NEXT
        this.currentChannel = (this.currentChannel + 1) % this.channels.length;
        this.audio.playClick(1.1);
      } else if (x >= 430 && x <= 620) {
        // SWITCH SOURCE
        this.currentChannel = (this.currentChannel + 1) % this.channels.length;
        this.audio.playClick(1.3);
      } else if (x >= w - 220 && x <= w - 40) {
        // CINEMA MODE TOGGLE
        this.toggleCinemaMode();
      }
    }
  }

  public toggleCinemaMode(): void {
    this.isCinemaMode = !this.isCinemaMode;
    this.audio.playWindowMove();

    // Scale animation
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
    this.group.scale.set(clamped, clamped, clamped);
  }
}
