/**
 * WidgetsPanel - Left Spatial Widget & Daily Flow Panel
 * 100% Component Encapsulated:
 * - All meshes parented strictly to this.group
 * - Real 3D SpatialButtons for Pomodoro Focus & Daily Objectives
 * - Full WebXR fingertip poke & controller raycast select support
 */

import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { SpatialButton } from '../ui/SpatialButton';

export interface TaskItem {
  id: string;
  title: string;
  completed: boolean;
}

export class WidgetsPanel {
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

  private btnStart!: SpatialButton;
  private btnReset!: SpatialButton;
  private btnPlus5!: SpatialButton;
  private taskButtons: SpatialButton[] = [];

  // Canvas Texture for Background Graphics (Timer Ring & Ambient Labels)
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;

  // Pomodoro State
  public pomodoroTotalSec: number = 25 * 60; // 25 mins
  public pomodoroRemainingSec: number = 25 * 60;
  public isTimerRunning: boolean = false;

  // Daily Objectives
  public tasks: TaskItem[] = [
    { id: '1', title: 'Calibrate Passthrough Mesh & Depth', completed: true },
    { id: '2', title: 'Verify WebXR Hand Pinch Thresholds', completed: true },
    { id: '3', title: 'Test Seated 0.85m Horizon Arc', completed: false },
    { id: '4', title: 'Review Spatial Audio Synth Latency', completed: false },
  ];

  public baseWidth: number = 0.68;
  public baseHeight: number = 0.58;
  public scaleFactor: number = 1.0;
  public isDragging: boolean = false;
  public isHovered: boolean = false;

  private audio: AudioEngine;

  constructor(audio: AudioEngine) {
    this.audio = audio;
    this.group = new THREE.Group();

    // 1. Setup 2D Backdrop Canvas for non-interactive ambient graphics
    this.canvas = document.createElement('canvas');
    this.canvas.width = 800;
    this.canvas.height = 680;
    this.ctx = this.canvas.getContext('2d')!;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    // Panel Geometry
    const panelGeo = new THREE.PlaneGeometry(this.baseWidth, this.baseHeight);
    const panelMat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.panelMesh = new THREE.Mesh(panelGeo, panelMat);
    this.group.add(this.panelMesh);

    // Frosted Glass Backing Plate
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

    // Glowing Bezel
    const edgeGeo = new THREE.EdgesGeometry(backGeo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.35,
    });
    this.edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    this.group.add(this.edgeLines);

    // 2. Horizon OS Top Title Bar (Active Grab Target)
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

    // 3. Horizon OS Bottom Pill Handle (Active Grab Target)
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

    // 4. Corner Resize Pin (Top-Right)
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

    // 5. Construct Real 3D Interactive Buttons Parented Directly to this.group
    this.build3DButtons();

    this.renderCanvas();
  }

  private build3DButtons(): void {
    // A. Pomodoro Buttons (Row at Y: 0.115)
    this.btnStart = new SpatialButton({
      width: 0.12,
      height: 0.038,
      label: '▶ START',
      color: 0x0284c7,
      activeColor: 0xf59e0b,
      onClick: () => {
        this.isTimerRunning = !this.isTimerRunning;
        this.btnStart.updateLabel(this.isTimerRunning ? '⏸ PAUSE' : '▶ START', this.isTimerRunning);
        this.audio.playClick(this.isTimerRunning ? 1.2 : 0.9);
      },
    });
    this.btnStart.setPosition(0.03, 0.115, 0.014);
    this.addButton(this.btnStart);

    this.btnReset = new SpatialButton({
      width: 0.08,
      height: 0.038,
      label: 'RESET',
      color: 0x334155,
      onClick: () => {
        this.isTimerRunning = false;
        this.pomodoroRemainingSec = this.pomodoroTotalSec;
        this.btnStart.updateLabel('▶ START', false);
        this.audio.playClick(0.8);
      },
    });
    this.btnReset.setPosition(0.14, 0.115, 0.014);
    this.addButton(this.btnReset);

    this.btnPlus5 = new SpatialButton({
      width: 0.08,
      height: 0.038,
      label: '+5 MIN',
      color: 0x1e293b,
      onClick: () => {
        this.pomodoroRemainingSec += 5 * 60;
        this.pomodoroTotalSec += 5 * 60;
        this.audio.playClick(1.4);
      },
    });
    this.btnPlus5.setPosition(0.23, 0.115, 0.014);
    this.addButton(this.btnPlus5);

    // B. Daily Objectives Checklist 3D Row Buttons
    const taskYStarts = [-0.01, -0.06, -0.11, -0.16];
    this.tasks.forEach((task, idx) => {
      const taskBtn = new SpatialButton({
        width: 0.58,
        height: 0.038,
        label: `${task.completed ? '✓ ' : '○ '}${task.title}`,
        color: task.completed ? 0x0369a1 : 0x1e293b,
        activeColor: 0x0284c7,
        onClick: () => {
          task.completed = !task.completed;
          taskBtn.updateLabel(
            `${task.completed ? '✓ ' : '○ '}${task.title}`,
            task.completed
          );
          this.audio.playClick(task.completed ? 1.3 : 0.8);
          if (task.completed) {
            this.audio.triggerHaptic(0.6, 50);
          }
        },
      });
      taskBtn.setPosition(0, taskYStarts[idx], 0.014);
      if (task.completed) {
        taskBtn.updateLabel(`✓ ${task.title}`, true);
      }
      this.addButton(taskBtn);
      this.taskButtons.push(taskBtn);
    });
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
    if (this.isTimerRunning) {
      this.pomodoroRemainingSec -= delta;
      if (this.pomodoroRemainingSec <= 0) {
        this.pomodoroRemainingSec = 0;
        this.isTimerRunning = false;
        this.btnStart.updateLabel('▶ START', false);
        this.audio.playBell();
      }
    }
    this.renderCanvas();
    this.texture.needsUpdate = true;
  }

  private renderCanvas(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Window Body
    ctx.fillStyle = 'rgba(8, 14, 28, 0.9)';
    ctx.fillRect(0, 0, w, h);

    // Header Bar
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.fillRect(0, 0, w, 56);

    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText('DAILY FLOW // PRODUCTIVITY', 30, 36);

    // Live Clock
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    ctx.font = '16px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.fillText(timeStr, w - 30, 36);

    // CARD 1: POMODORO FOCUS TIMER (Y: 76 to 235)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.fillRect(25, 76, w - 50, 160);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(25, 76, w - 50, 160);

    // Timer Circle Ring (Left of Card)
    const ringCenterX = 115;
    const ringCenterY = 156;
    const ringRadius = 50;

    // Background track
    ctx.beginPath();
    ctx.arc(ringCenterX, ringCenterY, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 8;
    ctx.stroke();

    // Progress arc
    const prog = this.pomodoroRemainingSec / this.pomodoroTotalSec;
    ctx.beginPath();
    ctx.arc(ringCenterX, ringCenterY, ringRadius, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
    ctx.strokeStyle = this.isTimerRunning ? '#00f0ff' : '#38bdf8';
    ctx.lineWidth = 8;
    ctx.stroke();

    // Digital Time inside ring
    const mins = Math.floor(this.pomodoroRemainingSec / 60);
    const secs = Math.floor(this.pomodoroRemainingSec % 60);
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`${mins}:${secs < 10 ? '0' : ''}${secs}`, ringCenterX, ringCenterY + 7);

    // Pomodoro Header
    ctx.textAlign = 'left';
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('POMODORO FOCUS', 200, 110);

    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(this.isTimerRunning ? '● Focus Session Active' : '○ Standby · Tap button below', 200, 132);

    // CARD 2: DAILY OBJECTIVES HEADER (Y: 250)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.fillRect(25, 250, w - 50, 260);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(25, 250, w - 50, 260);

    ctx.font = 'bold 17px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText('OBJECTIVES CHECKLIST (TAP BUTTONS)', 45, 280);

    // CARD 3: QUICK NOTES (Y: 525 to 650)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.fillRect(25, 525, w - 50, 125);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(25, 525, w - 50, 125);

    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'left';
    ctx.fillText('SPATIAL COMMAND SUITE', 45, 555);

    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('Touch 3D buttons directly with index finger or pinch from distance.', 45, 585);

    ctx.font = '12px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('• Seated Arc: 0.85m Radius · Passthrough Enabled · 72+ FPS', 45, 615);
  }

  public handleTouchUV(_u: number, _v: number): void {
    // Touch interactions are handled directly via 3D SpatialButtons
  }

  public setScale(factor: number): void {
    const clamped = Math.max(0.6, Math.min(2.0, factor));
    this.scaleFactor = clamped;
    const mult = this.isDragging ? 1.02 : 1.0;
    const finalScale = clamped * mult;
    this.group.scale.set(finalScale, finalScale, finalScale);
  }
}
