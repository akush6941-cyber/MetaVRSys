/**
 * ArtifactPanel - Right Tactile Holographic Companion / 3D Viewer Panel
 * 100% Component Encapsulated:
 * - All meshes parented strictly to this.group
 * - Real 3D SpatialButtons for Switch Model, Auto-Spin, and Explode View
 * - Full WebXR fingertip poke & controller raycast select support
 */

import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { SpatialButton } from '../ui/SpatialButton';

export class ArtifactPanel {
  public group: THREE.Group;
  public panelMesh: THREE.Mesh;
  public handleMesh: THREE.Mesh;
  public topBarMesh: THREE.Mesh;
  public topBarHitbox: THREE.Mesh;
  public bottomBarHitbox: THREE.Mesh;
  public resizePinMesh: THREE.Mesh;
  private edgeLines: THREE.LineSegments;
  private handleMat: THREE.MeshStandardMaterial;
  private topBarMat: THREE.MeshStandardMaterial;

  // Real 3D Interactive Buttons
  public buttons: SpatialButton[] = [];
  public interactiveButtonMeshes: THREE.Mesh[] = [];

  private btnSwitch!: SpatialButton;
  private btnAutoSpin!: SpatialButton;
  private btnExplode!: SpatialButton;

  // 3D Hologram Container
  public hologramContainer: THREE.Group;
  private currentModelIndex: number = 0;
  private modelRoots: THREE.Group[] = [];

  // Hologram Sub-meshes for animation/explosion
  private gyroRings: THREE.Mesh[] = [];
  private planetMesh: THREE.Mesh | null = null;
  private satelliteMesh: THREE.Mesh | null = null;
  private polyInner: THREE.Mesh | null = null;
  private polyOuter: THREE.Mesh | null = null;

  // State
  public isAutoSpin: boolean = true;
  public isExploded: boolean = false;
  private explodeFactor: number = 0;

  // 2D Interface Canvas
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;

  public baseWidth: number = 0.68;
  public baseHeight: number = 0.58;
  public scaleFactor: number = 1.0;
  public isDragging: boolean = false;
  public isHovered: boolean = false;

  public readonly modelNames = [
    'QUANTUM CHRONOSPHERE',
    'EXOPLANET GAIA-9',
    'AETHER MATRIX FRACTAL',
  ];

  private audio: AudioEngine;

  constructor(audio: AudioEngine) {
    this.audio = audio;
    this.group = new THREE.Group();

    // 1. Setup 2D interface canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = 800;
    this.canvas.height = 680;
    this.ctx = this.canvas.getContext('2d')!;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    // Panel Backing
    const panelGeo = new THREE.PlaneGeometry(this.baseWidth, this.baseHeight);
    const panelMat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.panelMesh = new THREE.Mesh(panelGeo, panelMat);
    this.group.add(this.panelMesh);

    // Frosted Glass Plate
    const backGeo = new THREE.PlaneGeometry(this.baseWidth + 0.02, this.baseHeight + 0.02);
    const backMat = new THREE.MeshStandardMaterial({
      color: 0x0a101f,
      roughness: 0.25,
      metalness: 0.85,
      transparent: true,
      opacity: 0.82,
      side: THREE.BackSide,
    });
    const back = new THREE.Mesh(backGeo, backMat);
    back.position.set(0, 0, -0.002);
    this.group.add(back);

    // Glowing Edge
    const edgeGeo = new THREE.EdgesGeometry(backGeo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.35,
    });
    this.edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    this.group.add(this.edgeLines);

    // 4. Horizon OS Top Title Bar (Active Grab Target)
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

    // Top Bar 0.15m Hitbox
    const topHitGeo = new THREE.BoxGeometry(this.baseWidth * 0.85, 0.16, 0.16);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.topBarHitbox = new THREE.Mesh(topHitGeo, hitMat);
    this.topBarHitbox.position.copy(this.topBarMesh.position);
    this.group.add(this.topBarHitbox);

    // 5. Pill Handle (Bottom Active Grab Target)
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

    // Bottom Bar 0.15m Hitbox
    const bottomHitGeo = new THREE.BoxGeometry(this.baseWidth * 0.75, 0.16, 0.16);
    this.bottomBarHitbox = new THREE.Mesh(bottomHitGeo, hitMat);
    this.bottomBarHitbox.position.copy(this.handleMesh.position);
    this.group.add(this.bottomBarHitbox);

    // 6. Corner Resize Pin
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

    // 7. Holographic 3D Asset Floating Pedestal (Parented to this.group)
    this.hologramContainer = new THREE.Group();
    this.hologramContainer.position.set(0, 0.06, 0.12);
    this.group.add(this.hologramContainer);

    this.build3DModels();
    this.showModel(0);

    // 8. Construct Real 3D Interactive Buttons Parented Directly to this.group
    this.build3DButtons();

    this.renderCanvas();
  }

  private build3DButtons(): void {
    const btnY = -this.baseHeight / 2 + 0.055; // Y: -0.235
    const btnZ = 0.018;

    // [⚡ SWITCH]
    this.btnSwitch = new SpatialButton({
      width: 0.18,
      height: 0.04,
      label: '⚡ SWITCH',
      color: 0x0284c7,
      onClick: () => {
        const next = (this.currentModelIndex + 1) % this.modelRoots.length;
        this.showModel(next);
        this.audio.playClick(1.2);
      },
    });
    this.btnSwitch.setPosition(-0.19, btnY, btnZ);
    this.addButton(this.btnSwitch);

    // [● AUTO-SPIN]
    this.btnAutoSpin = new SpatialButton({
      width: 0.18,
      height: 0.04,
      label: '● AUTO-SPIN',
      color: 0x10b981,
      activeColor: 0x10b981,
      onClick: () => {
        this.isAutoSpin = !this.isAutoSpin;
        this.btnAutoSpin.updateLabel(this.isAutoSpin ? '● AUTO-SPIN' : '○ PAUSED', this.isAutoSpin);
        this.audio.playClick(this.isAutoSpin ? 1.4 : 0.8);
      },
    });
    this.btnAutoSpin.setPosition(0.00, btnY, btnZ);
    this.btnAutoSpin.updateLabel('● AUTO-SPIN', true);
    this.addButton(this.btnAutoSpin);

    // [✦ EXPLODE VIEW]
    this.btnExplode = new SpatialButton({
      width: 0.18,
      height: 0.04,
      label: '✦ EXPLODE',
      color: 0x334155,
      activeColor: 0xd946ef,
      onClick: () => {
        this.isExploded = !this.isExploded;
        this.btnExplode.updateLabel(this.isExploded ? '✦ COLLAPSE' : '✦ EXPLODE', this.isExploded);
        this.audio.playClick(this.isExploded ? 1.6 : 0.9);
      },
    });
    this.btnExplode.setPosition(0.19, btnY, btnZ);
    this.addButton(this.btnExplode);
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

  private build3DModels(): void {
    // Model 0: Quantum ChronoSphere Gyroscope
    const model0 = new THREE.Group();
    const ringRadii = [0.11, 0.08, 0.05];
    const ringColors = [0x00f0ff, 0x38bdf8, 0x0284c7];

    ringRadii.forEach((r, idx) => {
      const geo = new THREE.TorusGeometry(r, 0.004, 16, 48);
      const mat = new THREE.MeshStandardMaterial({
        color: ringColors[idx],
        metalness: 0.8,
        roughness: 0.2,
        emissive: ringColors[idx],
        emissiveIntensity: 0.4,
      });
      const mesh = new THREE.Mesh(geo, mat);
      model0.add(mesh);
      this.gyroRings.push(mesh);
    });

    const coreGeo = new THREE.IcosahedronGeometry(0.025, 2);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    model0.add(coreMesh);
    this.modelRoots.push(model0);
    this.hologramContainer.add(model0);

    // Model 1: Holographic Exoplanet Gaia-9
    const model1 = new THREE.Group();
    const planetGeo = new THREE.SphereGeometry(0.07, 32, 32);
    const planetMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      metalness: 0.2,
      roughness: 0.6,
      wireframe: true,
      emissive: 0x0284c7,
      emissiveIntensity: 0.3,
    });
    this.planetMesh = new THREE.Mesh(planetGeo, planetMat);
    model1.add(this.planetMesh);

    const planetRingGeo = new THREE.RingGeometry(0.09, 0.12, 32);
    const planetRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
      wireframe: true,
    });
    const planetRing = new THREE.Mesh(planetRingGeo, planetRingMat);
    planetRing.rotation.x = Math.PI / 2.5;
    model1.add(planetRing);

    const satGeo = new THREE.BoxGeometry(0.012, 0.012, 0.012);
    const satMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    this.satelliteMesh = new THREE.Mesh(satGeo, satMat);
    model1.add(this.satelliteMesh);

    this.modelRoots.push(model1);
    this.hologramContainer.add(model1);

    // Model 2: Aether Matrix Polyhedron
    const model2 = new THREE.Group();
    const outerGeo = new THREE.DodecahedronGeometry(0.08, 0);
    const outerMat = new THREE.MeshStandardMaterial({
      color: 0xd946ef,
      metalness: 0.9,
      roughness: 0.1,
      transparent: true,
      opacity: 0.65,
      wireframe: true,
    });
    this.polyOuter = new THREE.Mesh(outerGeo, outerMat);
    model2.add(this.polyOuter);

    const innerGeo = new THREE.OctahedronGeometry(0.045, 0);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: false,
    });
    this.polyInner = new THREE.Mesh(innerGeo, innerMat);
    model2.add(this.polyInner);

    this.modelRoots.push(model2);
    this.hologramContainer.add(model2);
  }

  private showModel(index: number): void {
    this.currentModelIndex = index;
    this.modelRoots.forEach((m, idx) => {
      m.visible = idx === index;
    });
    this.renderCanvas();
  }

  public update(delta: number): void {
    const time = performance.now() * 0.001;

    const targetExplode = this.isExploded ? 1.0 : 0.0;
    this.explodeFactor += (targetExplode - this.explodeFactor) * 0.1;

    if (this.isAutoSpin) {
      this.hologramContainer.rotation.y += 0.012;
      this.hologramContainer.rotation.x = Math.sin(time * 0.5) * 0.1;
    }

    if (this.currentModelIndex === 0 && this.gyroRings.length >= 3) {
      this.gyroRings[0].rotation.x += 0.015;
      this.gyroRings[1].rotation.y += 0.022;
      this.gyroRings[2].rotation.z += 0.03;

      const offset = this.explodeFactor * 0.04;
      this.gyroRings[0].position.set(0, offset, 0);
      this.gyroRings[1].position.set(offset, 0, 0);
      this.gyroRings[2].position.set(0, 0, offset);
    }

    if (this.currentModelIndex === 1 && this.satelliteMesh) {
      const orbitRadius = 0.11 + this.explodeFactor * 0.06;
      this.satelliteMesh.position.set(
        Math.cos(time * 2.2) * orbitRadius,
        Math.sin(time * 1.5) * 0.03,
        Math.sin(time * 2.2) * orbitRadius
      );
    }

    if (this.currentModelIndex === 2 && this.polyOuter && this.polyInner) {
      this.polyOuter.rotation.y = time * 0.8;
      this.polyInner.rotation.x = -time * 1.2;
      const scale = 1.0 + this.explodeFactor * 0.5;
      this.polyOuter.scale.set(scale, scale, scale);
    }

    this.renderCanvas();
    this.texture.needsUpdate = true;
  }

  private renderCanvas(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(8, 14, 28, 0.9)';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.fillRect(0, 0, w, 56);

    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText('3D SPATIAL ARTIFACT VIEWER', 30, 36);

    ctx.font = '14px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.fillText('PINCH & ROTATE', w - 30, 36);

    // Viewport Guideline Circle
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2, 270, 160, 0, Math.PI * 2);
    ctx.stroke();

    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.beginPath();
    ctx.arc(w / 2, 270, 180, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Current Model Name Badge
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(w / 2 - 170, 425, 340, 34);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.strokeRect(w / 2 - 170, 425, 340, 34);

    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.fillText(this.modelNames[this.currentModelIndex], w / 2, 448);

    ctx.font = '13px monospace';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('Pinch Artifact: Free Rotate · Tap 3D Buttons Below', w / 2, 600);
  }

  public handleTouchUV(_u: number, _v: number): void {
    // Legacy UV fallback (all clicks now handled via 3D SpatialButtons)
  }

  public rotateHologram(deltaX: number, deltaY: number): void {
    this.isAutoSpin = false;
    this.btnAutoSpin.updateLabel('○ PAUSED', false);
    this.hologramContainer.rotation.y += deltaX * 3.0;
    this.hologramContainer.rotation.x += deltaY * 3.0;
  }

  public setScale(factor: number): void {
    const clamped = Math.max(0.6, Math.min(2.0, factor));
    this.scaleFactor = clamped;
    const mult = this.isDragging ? 1.02 : 1.0;
    const finalScale = clamped * mult;
    this.group.scale.set(finalScale, finalScale, finalScale);
  }
}
