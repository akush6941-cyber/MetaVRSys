/**
 * WidgetsPanel - Left Spatial Widget & Daily Flow Panel
 * Features:
 * - Pomodoro Focus Timer with live countdown and circular progress
 * - Interactive Daily Objectives Checklist (direct touch check/uncheck)
 * - Quick Notes card with ambient metrics
 * - Pill handle for free 3D window translation
 * - Corner resize pin
 */

import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';

export interface TaskItem {
  id: string;
  title: string;
  completed: boolean;
}

export class WidgetsPanel {
  public group: THREE.Group;
  public panelMesh: THREE.Mesh;
  public handleMesh: THREE.Mesh;
  public resizePinMesh: THREE.Mesh;

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

  // Quick Notes
  public noteText: string = 'Spatial Command active. Zero controllers required in MR session.';

  public baseWidth: number = 0.68;
  public baseHeight: number = 0.58;
  public scaleFactor: number = 1.0;

  private audio: AudioEngine;

  constructor(audio: AudioEngine) {
    this.audio = audio;
    this.group = new THREE.Group();

    // Setup high-res 2D canvas (800x680)
    this.canvas = document.createElement('canvas');
    this.canvas.width = 800;
    this.canvas.height = 680;
    this.ctx = this.canvas.getContext('2d')!;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    // Curved or flat panel geometry
    const panelGeo = new THREE.PlaneGeometry(this.baseWidth, this.baseHeight);
    const panelMat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.panelMesh = new THREE.Mesh(panelGeo, panelMat);
    this.group.add(this.panelMesh);

    // Frosted Glass Backing
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
    const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    this.group.add(edgeLines);

    // Pill Handle
    const handleGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.22, 16);
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

    // Corner Resize Pin
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

    this.renderCanvas();
  }

  public update(delta: number): void {
    if (this.isTimerRunning) {
      this.pomodoroRemainingSec -= delta;
      if (this.pomodoroRemainingSec <= 0) {
        this.pomodoroRemainingSec = 0;
        this.isTimerRunning = false;
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

    // CARD 1: POMODORO FOCUS TIMER (Y: 76 to 250)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.fillRect(25, 76, w - 50, 174);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(25, 76, w - 50, 174);

    // Timer Circle Ring (Left of Card)
    const ringCenterX = 120;
    const ringCenterY = 163;
    const ringRadius = 55;

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
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`${mins}:${secs < 10 ? '0' : ''}${secs}`, ringCenterX, ringCenterY + 8);

    // Pomodoro Controls (Right of Card)
    ctx.textAlign = 'left';
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('POMODORO FOCUS', 210, 115);

    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(this.isTimerRunning ? '● Focus Session in Progress' : '○ Standby · Tap Start to Begin', 210, 140);

    // Button 1: [START / PAUSE]
    ctx.fillStyle = this.isTimerRunning ? '#f59e0b' : '#0284c7';
    ctx.fillRect(210, 165, 140, 42);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.isTimerRunning ? '⏸ PAUSE' : '▶ START', 280, 192);

    // Button 2: [RESET]
    ctx.fillStyle = '#334155';
    ctx.fillRect(365, 165, 100, 42);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('RESET', 415, 192);

    // Button 3: [+5 MIN]
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(480, 165, 110, 42);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('+5 MIN', 535, 192);

    // CARD 2: DAILY OBJECTIVES (Y: 270 to 520)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.fillRect(25, 270, w - 50, 250);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(25, 270, w - 50, 250);

    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText('OBJECTIVES CHECKLIST (TAP TO TOGGLE)', 45, 305);

    // Task Items
    this.tasks.forEach((task, idx) => {
      const itemY = 345 + idx * 46;

      // Checkbox Box
      const boxSize = 24;
      const boxX = 45;
      const boxY = itemY - 18;

      ctx.fillStyle = task.completed ? '#0284c7' : '#1e293b';
      ctx.fillRect(boxX, boxY, boxSize, boxSize);
      ctx.strokeStyle = task.completed ? '#00f0ff' : '#475569';
      ctx.lineWidth = 2;
      ctx.strokeRect(boxX, boxY, boxSize, boxSize);

      if (task.completed) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('✓', boxX + boxSize / 2, boxY + 18);
      }

      // Task Label
      ctx.font = task.completed ? '16px sans-serif' : '16px sans-serif';
      ctx.fillStyle = task.completed ? '#94a3b8' : '#f1f5f9';
      ctx.textAlign = 'left';
      ctx.fillText(task.title, 85, itemY);

      if (task.completed) {
        // Strike-through line
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const textW = ctx.measureText(task.title).width;
        ctx.moveTo(85, itemY - 5);
        ctx.lineTo(85 + textW, itemY - 5);
        ctx.stroke();
      }
    });

    // CARD 3: QUICK NOTES (Y: 535 to 650)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.fillRect(25, 535, w - 50, 115);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(25, 535, w - 50, 115);

    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'left';
    ctx.fillText('QUICK NOTES // SEATED COMMAND', 45, 565);

    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(this.noteText, 45, 595);

    ctx.font = '12px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('• Seated Arc: 0.85m Radius · Passthrough Enabled · 72+ FPS', 45, 625);
  }

  public handleTouchUV(u: number, v: number): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const x = u * w;
    const y = (1 - v) * h;

    // 1. Pomodoro Buttons
    if (y >= 165 && y <= 207) {
      if (x >= 210 && x <= 350) {
        // START / PAUSE
        this.isTimerRunning = !this.isTimerRunning;
        this.audio.playClick(this.isTimerRunning ? 1.2 : 0.9);
        return;
      } else if (x >= 365 && x <= 465) {
        // RESET
        this.isTimerRunning = false;
        this.pomodoroRemainingSec = this.pomodoroTotalSec;
        this.audio.playClick(0.8);
        return;
      } else if (x >= 480 && x <= 590) {
        // +5 MIN
        this.pomodoroRemainingSec += 5 * 60;
        this.pomodoroTotalSec += 5 * 60;
        this.audio.playClick(1.4);
        return;
      }
    }

    // 2. Checklist Items
    this.tasks.forEach((task, idx) => {
      const itemY = 345 + idx * 46;
      if (y >= itemY - 22 && y <= itemY + 16 && x >= 40 && x <= w - 60) {
        task.completed = !task.completed;
        this.audio.playClick(task.completed ? 1.3 : 0.8);
        if (task.completed) {
          this.audio.triggerHaptic(0.6, 50);
        }
      }
    });
  }

  public setScale(factor: number): void {
    const clamped = Math.max(0.6, Math.min(2.0, factor));
    this.scaleFactor = clamped;
    this.group.scale.set(clamped, clamped, clamped);
  }
}
