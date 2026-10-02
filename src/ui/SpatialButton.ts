/**
 * SpatialButton - Tactile 3D Glassmorphic Button for WebXR Horizon OS.
 * Features:
 * - Real 3D Mesh with BoxGeometry and frosted glass material
 * - High-resolution canvas label face for crisp text in VR
 * - Direct fingertip poke support with physical depth compression in Z
 * - WebXR controller select / pinch ray support
 * - Dynamic state updates (toggle, label, active color)
 */

import * as THREE from 'three';

export interface SpatialButtonOptions {
  width: number;
  height: number;
  depth?: number;
  label: string;
  sublabel?: string;
  color?: number;
  activeColor?: number;
  textColor?: string;
  textAlign?: 'center' | 'left';
  onClick: () => void;
}

export class SpatialButton {
  public mesh: THREE.Mesh;
  public labelCanvas: HTMLCanvasElement;
  public labelTexture: THREE.CanvasTexture;
  private mat: THREE.MeshStandardMaterial;
  private labelMat: THREE.MeshBasicMaterial;
  private edgeLines: THREE.LineSegments;

  public originalZ: number = 0.015;
  private baseColor: number;
  private activeColor: number;
  private currentLabel: string;
  private isToggled: boolean = false;
  private textAlign: 'center' | 'left';

  constructor(options: SpatialButtonOptions) {
    const depth = options.depth || 0.012;
    this.baseColor = options.color || 0x0284c7;
    this.activeColor = options.activeColor || 0x10b981;
    this.currentLabel = options.label;
    this.textAlign = options.textAlign || (options.label.startsWith('✓ ') || options.label.startsWith('○ ') ? 'left' : 'center');

    // 1. Button Base Geometry & Frosted Glass Material
    const geo = new THREE.BoxGeometry(options.width, options.height, depth);
    this.mat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.7,
      roughness: 0.25,
      emissive: this.baseColor,
      emissiveIntensity: 0.35,
    });

    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.castShadow = true;

    // 2. Bezel Edge Wire
    const edgeGeo = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.45,
    });
    this.edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    this.mesh.add(this.edgeLines);

    // 3. High-Res Width-Proportional Canvas Label Face on Front (+Z)
    const aspect = Math.max(1, options.width / options.height);
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.height = 128;
    this.labelCanvas.width = Math.min(1024, Math.max(256, Math.round(128 * aspect)));

    this.labelTexture = new THREE.CanvasTexture(this.labelCanvas);
    this.labelTexture.minFilter = THREE.LinearFilter;
    this.labelTexture.magFilter = THREE.LinearFilter;

    this.labelMat = new THREE.MeshBasicMaterial({
      map: this.labelTexture,
      transparent: true,
    });

    const faceGeo = new THREE.PlaneGeometry(options.width * 0.94, options.height * 0.9);
    const faceMesh = new THREE.Mesh(faceGeo, this.labelMat);
    faceMesh.position.set(0, 0, depth / 2 + 0.001);
    this.mesh.add(faceMesh);

    // 4. Attach userData for WebXR Direct Poke and Ray Select
    this.mesh.userData = {
      isPressed: false,
      originalZ: this.originalZ,
      onClick: options.onClick,
      buttonRef: this.mesh,
      width: options.width,
      height: options.height,
      depth: depth,
    };
    // Also point face child back to root button
    faceMesh.userData = {
      buttonRef: this.mesh,
      onClick: options.onClick,
      originalZ: this.originalZ,
    };

    this.renderLabel();
  }

  public setPosition(x: number, y: number, z: number = 0.015): void {
    this.originalZ = z;
    this.mesh.position.set(x, y, z);
    this.mesh.userData.originalZ = z;
    if (this.mesh.children.length > 1) {
      this.mesh.children[1].userData.originalZ = z;
    }
  }

  public setHovered(hovered: boolean): void {
    const intensity = hovered ? 0.8 : (this.isToggled ? 0.6 : 0.35);
    this.mat.emissiveIntensity = intensity;
    (this.edgeLines.material as THREE.LineBasicMaterial).color.setHex(hovered ? 0x00ffff : 0x00f0ff);
    (this.edgeLines.material as THREE.LineBasicMaterial).opacity = hovered ? 0.9 : 0.45;
  }

  public updateLabel(label: string, isToggled?: boolean): void {
    this.currentLabel = label;
    if (isToggled !== undefined) {
      this.isToggled = isToggled;
      const targetEmissive = this.isToggled ? this.activeColor : this.baseColor;
      this.mat.emissive.setHex(targetEmissive);
      this.mat.emissiveIntensity = this.isToggled ? 0.6 : 0.35;
    }
    this.renderLabel();
  }

  private renderLabel(): void {
    const ctx = this.labelCanvas.getContext('2d');
    if (!ctx) return;

    const w = this.labelCanvas.width;
    const h = this.labelCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Background pill/plate
    ctx.fillStyle = this.isToggled ? 'rgba(16, 185, 129, 0.22)' : 'rgba(15, 23, 42, 0.72)';
    ctx.fillRect(4, 4, w - 8, h - 8);

    // Subtle border
    ctx.strokeStyle = this.isToggled ? 'rgba(52, 211, 153, 0.6)' : 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, w - 8, h - 8);

    // Left-aligned Checkbox item
    if (this.textAlign === 'left' && (this.currentLabel.startsWith('✓ ') || this.currentLabel.startsWith('○ '))) {
      const isChecked = this.currentLabel.startsWith('✓ ') || this.isToggled;
      const titleText = this.currentLabel.substring(2);

      // Dedicated checkbox indicator box
      const boxSize = 52;
      const boxX = 22;
      const boxY = (h - boxSize) / 2;

      ctx.fillStyle = isChecked ? 'rgba(16, 185, 129, 0.45)' : 'rgba(30, 41, 59, 0.8)';
      ctx.fillRect(boxX, boxY, boxSize, boxSize);

      ctx.strokeStyle = isChecked ? '#34d399' : '#64748b';
      ctx.lineWidth = 3;
      ctx.strokeRect(boxX, boxY, boxSize, boxSize);

      if (isChecked) {
        ctx.font = 'bold 36px monospace';
        ctx.fillStyle = '#34d399';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✓', boxX + boxSize / 2, boxY + boxSize / 2 + 2);
      }

      // Title Text
      ctx.font = 'bold 32px monospace';
      ctx.fillStyle = isChecked ? '#94a3b8' : '#f8fafc';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(titleText, boxX + boxSize + 24, h / 2 + 1);

    } else {
      // Standard Centered Button
      ctx.font = 'bold 34px monospace';
      ctx.fillStyle = this.isToggled ? '#34d399' : '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Auto-shrink font if text is wide
      let fontSize = 34;
      ctx.font = `bold ${fontSize}px monospace`;
      while (ctx.measureText(this.currentLabel).width > w - 24 && fontSize > 18) {
        fontSize -= 2;
        ctx.font = `bold ${fontSize}px monospace`;
      }

      ctx.fillText(this.currentLabel, w / 2, h / 2 + 1);
    }

    this.labelTexture.needsUpdate = true;
  }
}
