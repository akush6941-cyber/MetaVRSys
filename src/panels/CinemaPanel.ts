/**
 * CinemaPanel - Center Curved Spatial Media Player Screen
 * 16:9 Curved Cylindrical Screen powered by HTML5 Video + VideoTexture,
 * with floating interactive control dock (Play/Pause, Scrubber, Volume, Cinema Dimmer, and Handle).
 */

import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';

export class CinemaPanel {
  public group: THREE.Group;
  public mediaScreenGroup: THREE.Group;
  public controlDock!: THREE.Group;
  public screenMesh: THREE.Mesh;
  public handleMesh: THREE.Mesh;
  public handleHitbox: THREE.Mesh;

  // Video Element & Texture
  public videoElement: HTMLVideoElement;
  public videoTexture: THREE.VideoTexture | THREE.CanvasTexture;
  public isUsingProceduralFallback: boolean = false;
  private fallbackCanvas: HTMLCanvasElement;
  private fallbackCtx: CanvasRenderingContext2D;

  // Interactive 3D Control Meshes
  public btnPlay: THREE.Mesh;
  public scrubberTrack: THREE.Mesh;
  public scrubberFill: THREE.Mesh;
  public scrubberKnob: THREE.Mesh;
  public btnVolume: THREE.Mesh;
  public btnCinema: THREE.Mesh;

  // State
  public isPlaying: boolean = false;
  public currentTime: number = 0;
  public duration: number = 180; // default duration in seconds
  public volume: number = 0.8;
  public isMuted: boolean = false;
  public isCinemaMode: boolean = false;
  public isDragging: boolean = false;

  // Dimensions
  public baseWidth: number = 0.96;  // 16:9 ratio (0.96m x 0.54m)
  public baseHeight: number = 0.54;
  public curveRadius: number = 2.4;

  private audio: AudioEngine;
  private onCinemaToggle?: (active: boolean) => void;

  constructor(audio: AudioEngine, onCinemaToggle?: (active: boolean) => void) {
    this.audio = audio;
    this.onCinemaToggle = onCinemaToggle;
    this.group = new THREE.Group();
    this.mediaScreenGroup = this.group;

    // 1. Setup HTML5 Video Element with Royalty-Free Sample + CORS
    this.videoElement = document.createElement('video');
    this.videoElement.crossOrigin = 'anonymous';
    this.videoElement.playsInline = true;
    this.videoElement.loop = true;
    this.videoElement.preload = 'auto';
    this.videoElement.volume = this.volume;

    // Fast-loading Google public CDN video sample
    this.videoElement.src = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

    // 2. Setup High-FPS Procedural Fallback Canvas (Guarantees visual playback even if network is offline)
    this.fallbackCanvas = document.createElement('canvas');
    this.fallbackCanvas.width = 1280;
    this.fallbackCanvas.height = 720;
    this.fallbackCtx = this.fallbackCanvas.getContext('2d')!;

    // Try video texture; fallback gracefully if video cannot play
    this.videoTexture = new THREE.VideoTexture(this.videoElement);
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.magFilter = THREE.LinearFilter;

    this.videoElement.addEventListener('loadedmetadata', () => {
      if (this.videoElement.duration && !isNaN(this.videoElement.duration)) {
        this.duration = this.videoElement.duration;
      }
    });

    this.videoElement.addEventListener('error', () => {
      // Switch seamlessly to procedural high-res spatial visualizer
      this.isUsingProceduralFallback = true;
      const canvasTexture = new THREE.CanvasTexture(this.fallbackCanvas);
      canvasTexture.minFilter = THREE.LinearFilter;
      canvasTexture.magFilter = THREE.LinearFilter;
      (this.screenMesh.material as THREE.MeshBasicMaterial).map = canvasTexture;
      (this.screenMesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
    });

    // 3. Build Curved 16:9 Cylindrical Screen Geometry
    const thetaLength = this.baseWidth / this.curveRadius;
    const screenGeo = new THREE.CylinderGeometry(
      this.curveRadius,
      this.curveRadius,
      this.baseHeight,
      48,
      1,
      true,
      -thetaLength / 2 + Math.PI,
      thetaLength
    );

    const screenMat = new THREE.MeshBasicMaterial({
      map: this.videoTexture,
      side: THREE.DoubleSide,
    });

    this.screenMesh = new THREE.Mesh(screenGeo, screenMat);
    this.screenMesh.name = 'CinemaScreen';
    this.group.add(this.screenMesh);

    // Make clicking/poking directly on the screen toggle play/pause
    this.screenMesh.userData = {
      id: 'cinema-screen',
      type: 'screen',
      width: this.baseWidth,
      height: this.baseHeight,
      depth: 0.02,
      onClick: () => {
        this.togglePlay();
      },
      onTrigger: () => {
        this.togglePlay();
      },
    };

    // 4. Sleek Outer Bezel and Rim
    const bezelGeo = new THREE.CylinderGeometry(
      this.curveRadius + 0.003,
      this.curveRadius + 0.003,
      this.baseHeight + 0.016,
      48,
      1,
      true,
      -thetaLength / 2 - 0.008 + Math.PI,
      thetaLength + 0.016
    );
    const bezelMat = new THREE.MeshStandardMaterial({
      color: 0x050b14,
      roughness: 0.3,
      metalness: 0.8,
      side: THREE.BackSide,
    });
    const bezel = new THREE.Mesh(bezelGeo, bezelMat);
    bezel.position.set(0, 0, -0.002);
    this.group.add(bezel);

    // Glowing Bezel Wire
    const edgeGeo = new THREE.EdgesGeometry(bezelGeo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.4,
    });
    const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    this.group.add(edgeLines);

    // 5. Floating Interactive Control Dock (directly beneath video screen)
    const mediaControls = new THREE.Group();
    mediaControls.name = 'MediaControls';
    mediaControls.position.set(0, -0.42, 0.04);
    mediaControls.rotation.set(0, 0, 0);
    this.controlDock = mediaControls;

    // A. Play / Pause Button
    this.btnPlay = this.createButton(
      '▶ PLAY',
      0.14,
      0.042,
      0x0284c7,
      () => this.togglePlay()
    );
    this.btnPlay.position.set(-0.36, 0, 0);
    mediaControls.add(this.btnPlay);

    // B. Time Scrubber Bar (Track + Fill + Knob)
    const trackWidth = 0.38;
    const trackHeight = 0.024;
    const trackGeo = new THREE.BoxGeometry(trackWidth, trackHeight, 0.01);
    const trackMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.6,
    });
    this.scrubberTrack = new THREE.Mesh(trackGeo, trackMat);
    this.scrubberTrack.position.set(-0.04, 0, 0);
    const scrubberAction = (point?: THREE.Vector3) => {
      if (!point) return;
      const local = this.scrubberTrack.worldToLocal(point.clone());
      const norm = THREE.MathUtils.clamp((local.x + trackWidth / 2) / trackWidth, 0, 1);
      this.seek(norm);
    };

    this.scrubberTrack.userData = {
      id: 'cinema-scrubber',
      type: 'scrubber',
      width: trackWidth,
      height: trackHeight,
      depth: 0.01,
      originalZ: 0,
      onClick: scrubberAction,
      onTrigger: scrubberAction,
    };
    mediaControls.add(this.scrubberTrack);

    // Scrubber Fill (Active cyan progress bar)
    const fillGeo = new THREE.BoxGeometry(0.001, trackHeight * 0.8, 0.012);
    const fillMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    this.scrubberFill = new THREE.Mesh(fillGeo, fillMat);
    this.scrubberFill.position.set(-trackWidth / 2, 0, 0.002);
    this.scrubberTrack.add(this.scrubberFill);

    // Scrubber Knob
    const knobGeo = new THREE.SphereGeometry(0.012, 16, 16);
    const knobMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.4,
      roughness: 0.2,
      metalness: 0.9,
    });
    this.scrubberKnob = new THREE.Mesh(knobGeo, knobMat);
    this.scrubberKnob.position.set(-trackWidth / 2, 0, 0.008);
    this.scrubberTrack.add(this.scrubberKnob);

    // C. Volume Button
    this.btnVolume = this.createButton(
      '🔊 80%',
      0.11,
      0.042,
      0x334155,
      () => this.toggleVolume()
    );
    this.btnVolume.position.set(0.24, 0, 0);
    mediaControls.add(this.btnVolume);

    // D. Cinema Mode Button
    this.btnCinema = this.createButton(
      '✦ CINEMA',
      0.13,
      0.042,
      0x475569,
      () => this.toggleCinema()
    );
    this.btnCinema.position.set(0.38, 0, 0);
    mediaControls.add(this.btnCinema);

    // Attach mediaControls directly to mediaScreenGroup
    this.mediaScreenGroup.add(mediaControls);

    // 6. Bottom Pill Handle Bar (Active Grab Target for 3D Repositioning)
    const handleY = -0.49;
    const handleZ = 0.04;
    const handleGeo = new THREE.CylinderGeometry(0.008, 0.008, this.baseWidth * 0.6, 16);
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.4,
      metalness: 0.9,
      roughness: 0.2,
    });
    this.handleMesh = new THREE.Mesh(handleGeo, handleMat);
    this.handleMesh.rotation.z = Math.PI / 2;
    this.handleMesh.position.set(0, handleY, handleZ);
    this.mediaScreenGroup.add(this.handleMesh);

    // 0.15m Hitbox for effortless grabbing
    const hitGeo = new THREE.BoxGeometry(this.baseWidth * 0.75, 0.14, 0.14);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.handleHitbox = new THREE.Mesh(hitGeo, hitMat);
    this.handleHitbox.position.copy(this.handleMesh.position);
    this.handleHitbox.userData = {
      id: 'cinema-handle',
      type: 'handle',
      panelGroup: this.mediaScreenGroup,
    };
    this.mediaScreenGroup.add(this.handleHitbox);

    // 2. Seated Arc Cockpit Alignment: Media Screen Group at x: 0.48, y: 1.25, z: -0.75, rotation.y: -0.32
    this.mediaScreenGroup.position.set(0.48, 1.25, -0.75);
    this.mediaScreenGroup.rotation.set(0, -0.32, 0);
  }

  /**
   * Helper to create sleek 3D Button Meshes with text label on canvas
   */
  private createButton(
    label: string,
    width: number,
    height: number,
    color: number,
    onClick: () => void
  ): THREE.Mesh {
    const depth = 0.012;
    const geo = new THREE.BoxGeometry(width, height, depth);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x090f1d,
      roughness: 0.25,
      metalness: 0.8,
      emissive: color,
      emissiveIntensity: 0.35,
    });
    const mesh = new THREE.Mesh(geo, mat);

    // Front label canvas
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const faceMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
    });
    const faceMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.92, height * 0.88),
      faceMat
    );
    faceMesh.position.set(0, 0, depth / 2 + 0.001);
    mesh.add(faceMesh);

    const updateLabel = (text: string, active: boolean = false) => {
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = active ? 'rgba(16, 185, 129, 0.3)' : 'rgba(15, 23, 42, 0.7)';
      ctx.fillRect(4, 4, canvas.width - 8, canvas.height - 8);

      ctx.strokeStyle = active ? '#34d399' : '#38bdf8';
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

      ctx.font = 'bold 36px monospace';
      ctx.fillStyle = active ? '#34d399' : '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
      texture.needsUpdate = true;
    };

    updateLabel(label);

    const clickHandler = () => {
      onClick();
    };

    mesh.userData = {
      id: `btn-${label}`,
      type: 'button',
      width,
      height,
      depth,
      originalZ: 0,
      onClick: clickHandler,
      onTrigger: clickHandler,
      updateLabel,
    };

    faceMesh.userData = mesh.userData;

    return mesh;
  }

  public getInteractiveMeshes(): THREE.Mesh[] {
    return [
      this.screenMesh,
      this.btnPlay,
      this.scrubberTrack,
      this.btnVolume,
      this.btnCinema,
      this.handleHitbox,
    ];
  }

  public togglePlay(): void {
    this.isPlaying = !this.isPlaying;
    this.audio.playClick(this.isPlaying ? 1.3 : 0.9);

    if (this.videoElement && !this.isUsingProceduralFallback) {
      if (this.isPlaying) {
        this.videoElement.play().catch(() => {
          // Autoplay policy or CORS error fallback
          this.isUsingProceduralFallback = true;
        });
      } else {
        this.videoElement.pause();
      }
    }

    const labelFn = this.btnPlay.userData.updateLabel;
    if (labelFn) {
      labelFn(this.isPlaying ? '⏸ PAUSE' : '▶ PLAY', this.isPlaying);
    }
  }

  public seek(progress: number): void {
    const targetTime = progress * this.duration;
    this.currentTime = targetTime;
    if (this.videoElement && !this.isUsingProceduralFallback) {
      this.videoElement.currentTime = targetTime;
    }
    this.audio.playScrubTick();
    this.updateScrubberVisuals();
  }

  public toggleVolume(): void {
    if (this.isMuted) {
      this.isMuted = false;
      this.volume = 0.8;
    } else if (this.volume > 0.5) {
      this.volume = 0.4;
    } else {
      this.isMuted = true;
      this.volume = 0;
    }

    if (this.videoElement) {
      this.videoElement.muted = this.isMuted;
      this.videoElement.volume = this.volume;
    }

    this.audio.playClick(1.1);

    const label = this.isMuted ? '🔇 MUTE' : `🔊 ${Math.round(this.volume * 100)}%`;
    this.btnVolume.userData.updateLabel?.(label, !this.isMuted);
  }

  public toggleCinema(): void {
    this.isCinemaMode = !this.isCinemaMode;
    this.audio.playWindowMove();

    const scale = this.isCinemaMode ? 1.35 : 1.0;
    this.group.scale.set(scale, scale, scale);

    this.btnCinema.userData.updateLabel?.(
      this.isCinemaMode ? '✦ ACTIVE' : '✦ CINEMA',
      this.isCinemaMode
    );

    if (this.onCinemaToggle) {
      this.onCinemaToggle(this.isCinemaMode);
    }
  }

  public update(delta: number): void {
    // 1. Synchronize Video / Procedural playback time
    if (this.isPlaying) {
      if (this.videoElement && !this.isUsingProceduralFallback) {
        this.currentTime = this.videoElement.currentTime || 0;
        if (this.videoElement.duration && !isNaN(this.videoElement.duration)) {
          this.duration = this.videoElement.duration;
        }
      } else {
        this.currentTime = (this.currentTime + delta) % this.duration;
      }
      this.updateScrubberVisuals();
    }

    // 2. Render Procedural Media if video is unavailable/buffering
    if (this.isUsingProceduralFallback) {
      this.renderProceduralCanvas();
    }
  }

  private updateScrubberVisuals(): void {
    const trackWidth = 0.38;
    const progress = THREE.MathUtils.clamp(this.currentTime / Math.max(1, this.duration), 0, 1);

    // Update fill geometry width
    const fillWidth = Math.max(0.001, trackWidth * progress);
    this.scrubberFill.scale.x = fillWidth / 0.001;
    this.scrubberFill.position.x = -trackWidth / 2 + fillWidth / 2;

    // Update knob position
    this.scrubberKnob.position.x = -trackWidth / 2 + fillWidth;
  }

  private renderProceduralCanvas(): void {
    const ctx = this.fallbackCtx;
    const w = this.fallbackCanvas.width;
    const h = this.fallbackCanvas.height;
    const t = performance.now() * 0.001;

    // Sleek Synthwave Cyberpunk Horizon
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#020617');
    grad.addColorStop(0.6, '#1e1b4b');
    grad.addColorStop(1, '#090d16');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Perspective Grid
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 1.5;
    const horizonY = h * 0.58;

    for (let x = -w * 0.5; x <= w * 1.5; x += 60) {
      ctx.beginPath();
      ctx.moveTo(w / 2, horizonY);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    const gridOffset = (t * 120) % 40;
    for (let y = horizonY; y <= h; y += (y - horizonY) * 0.25 + 10) {
      const lineY = y + gridOffset * ((y - horizonY) / (h - horizonY));
      if (lineY <= h) {
        ctx.beginPath();
        ctx.moveTo(0, lineY);
        ctx.lineTo(w, lineY);
        ctx.stroke();
      }
    }

    // Glowing Holographic Sun
    const sunGrad = ctx.createRadialGradient(w / 2, horizonY - 40, 10, w / 2, horizonY - 40, 160);
    sunGrad.addColorStop(0, '#f43f5e');
    sunGrad.addColorStop(0.7, '#d946ef');
    sunGrad.addColorStop(1, 'rgba(124, 58, 237, 0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(w / 2, horizonY - 40, 160, 0, Math.PI * 2);
    ctx.fill();

    // Floating Audio Visualizer Waves
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let x = 80; x < w - 80; x += 12) {
      const wave = Math.sin(x * 0.015 + t * 4) * 35 + Math.cos(x * 0.03 + t * 2) * 20;
      const y = horizonY - 30 + wave;
      if (x === 80) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // On-screen HUD info
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText('SPATIAL CINEMA // VISION OS 4K STREAM', 60, 60);

    const mins = Math.floor(this.currentTime / 60);
    const secs = Math.floor(this.currentTime % 60);
    const durMins = Math.floor(this.duration / 60);
    const durSecs = Math.floor(this.duration % 60);
    ctx.textAlign = 'right';
    ctx.font = '20px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(
      `${mins}:${secs < 10 ? '0' : ''}${secs} / ${durMins}:${durSecs < 10 ? '0' : ''}${durSecs}`,
      w - 60,
      60
    );

    if ((this.screenMesh.material as THREE.MeshBasicMaterial).map) {
      ((this.screenMesh.material as THREE.MeshBasicMaterial).map as THREE.Texture).needsUpdate = true;
    }
  }
}
