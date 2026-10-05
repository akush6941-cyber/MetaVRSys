/**
 * WebDeckPanel - Left Spatial Web/Content Deck (Simulated Browser Experience)
 * Features:
 * - Top Navigation Bar with Address/Search Bar & 3D Interactive Tab Pills:
 *     [ 📊 DASHBOARD ]  [ 🔥 TRENDING MEDIA ]  [ ⚡ DEV DOCS ]
 * - Dynamic Canvas Texture with interactive clickable regions:
 *     - Dashboard: Focus Pomodoro (Start/Pause, +5m, Reset), Daily Checklist (interactive checkboxes), Quick Bookmarks
 *     - Trending Media: 3 Expandable Article Cards with live selection highlight
 *     - Dev Docs: 4 Feature Toggles (Depth Sensing, Contact Halos, Gaze Rays, Spatial Audio)
 * - Synchronous Bottom Handle for 3D Repositioning (Pitch & Roll locked)
 */

import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';

export interface TaskItem {
  id: string;
  title: string;
  completed: boolean;
}

export interface ArticleCard {
  id: string;
  title: string;
  readTime: string;
  category: string;
  snippet: string;
  isBookmarked: boolean;
}

export interface DevFeatureToggle {
  id: string;
  name: string;
  enabled: boolean;
  tag: string;
}

export class WebDeckPanel {
  public group: THREE.Group;
  public screenMesh: THREE.Mesh;
  public handleMesh: THREE.Mesh;
  public handleHitbox: THREE.Mesh;

  // 3D Navigation Tab Pill Meshes
  public tabDashboardMesh: THREE.Mesh;
  public tabTrendingMesh: THREE.Mesh;
  public tabDocsMesh: THREE.Mesh;

  // Interactive 2D Canvas & Texture
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;

  // State
  public activeTab: 'dashboard' | 'trending' | 'docs' = 'dashboard';
  public currentUrl: string = 'https://spatial.web/dashboard';

  // Dashboard Data
  public pomodoroRemainingSec: number = 25 * 60;
  public isTimerRunning: boolean = false;
  public tasks: TaskItem[] = [
    { id: '1', title: 'Verify WebXR Hand Tracking joints', completed: true },
    { id: '2', title: 'Calibrate Horizon OS 0.85m Seated Arc', completed: true },
    { id: '3', title: 'Test Spatial Audio Synthesizer Latency', completed: false },
    { id: '4', title: 'Compile VisionOS Mixed Reality Shader', completed: false },
  ];
  public bookmarks: { name: string; icon: string; count: number }[] = [
    { name: 'VisionOS Files', icon: '📁', count: 12 },
    { name: 'Horizon Chat', icon: '💬', count: 4 },
    { name: 'Aether Cloud', icon: '☁️', count: 8 },
    { name: 'Neural Mesh', icon: '🧠', count: 3 },
  ];

  // Trending Media Data
  public articles: ArticleCard[] = [
    {
      id: 'art-1',
      title: 'WebXR Hand Tracking 2.0: The End of Physical Controllers',
      readTime: '4 min read',
      category: 'SPATIAL COMPUTING',
      snippet: 'W3C hand input specifications now enable sub-millimeter finger pinch tracking inside Meta Quest browsers.',
      isBookmarked: true,
    },
    {
      id: 'art-2',
      title: 'Vision Pro vs Quest 3: Comparative Ergonomics for Seated Workspaces',
      readTime: '6 min read',
      category: 'HARDWARE REVIEW',
      snippet: 'How the 0.85m comfort envelope prevents neck fatigue during multi-window spatial productivity.',
      isBookmarked: false,
    },
    {
      id: 'art-3',
      title: 'Procedural Audio Synthesis: Zero-Latency UI Soundscapes in Three.js',
      readTime: '3 min read',
      category: 'GRAPHICS & AUDIO',
      snippet: 'Pure Web Audio API synthesizers eliminate heavy sound file loading while providing rich tactile clicks.',
      isBookmarked: false,
    },
  ];
  public selectedArticleId: string = 'art-1';

  // Dev Docs Toggles
  public devToggles: DevFeatureToggle[] = [
    { id: 'tog-1', name: 'Passthrough Room Depth Sensing', enabled: true, tag: 'CORE API' },
    { id: 'tog-2', name: 'Fingertip Contact Micro-Halos', enabled: true, tag: 'XR GESTURES' },
    { id: 'tog-3', name: 'Gaze-Assisted Hand Rays', enabled: true, tag: 'ERGONOMICS' },
    { id: 'tog-4', name: 'Spatial Audio Binaural Panning', enabled: true, tag: 'AUDIO ENGINE' },
  ];

  // Dimensions
  public baseWidth: number = 0.78;
  public baseHeight: number = 0.58;

  private audio: AudioEngine;

  constructor(audio: AudioEngine) {
    this.audio = audio;
    this.group = new THREE.Group();

    // 1. Setup High-DPI Canvas for Crisp VR Text Legibility (1024x768)
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 768;
    this.ctx = this.canvas.getContext('2d')!;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    // 2. Build Screen Surface Geometry & Material
    const screenGeo = new THREE.PlaneGeometry(this.baseWidth, this.baseHeight);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.texture,
      side: THREE.DoubleSide,
    });
    this.screenMesh = new THREE.Mesh(screenGeo, screenMat);
    this.screenMesh.name = 'WebDeckScreen';
    this.group.add(this.screenMesh);

    // Screen Mesh is interactive: clicking/poking passes normalized UV coordinates
    this.screenMesh.userData = {
      id: 'webdeck-screen',
      type: 'screen',
      width: this.baseWidth,
      height: this.baseHeight,
      depth: 0.015,
      onTrigger: (_point?: THREE.Vector3, uv?: THREE.Vector2) => {
        if (uv) {
          this.handleCanvasTouch(uv.x, uv.y);
        }
      },
    };

    // 3. Frosted Glass Backing Plate
    const backGeo = new THREE.PlaneGeometry(this.baseWidth + 0.016, this.baseHeight + 0.016);
    const backMat = new THREE.MeshStandardMaterial({
      color: 0x070d18,
      roughness: 0.25,
      metalness: 0.85,
      side: THREE.BackSide,
    });
    const back = new THREE.Mesh(backGeo, backMat);
    back.position.set(0, 0, -0.002);
    this.group.add(back);

    // Subtle edge glowing wire
    const edgeGeo = new THREE.EdgesGeometry(backGeo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.35,
    });
    const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    this.group.add(edgeLines);

    // 4. Top Navigation Bar: 3D Tab Pills (Floating at Y: +0.33m)
    const tabY = this.baseHeight / 2 + 0.04;
    const tabZ = 0.014;

    this.tabDashboardMesh = this.createTabPill(
      '📊 DASHBOARD',
      0.22,
      () => this.switchTab('dashboard')
    );
    this.tabDashboardMesh.position.set(-0.25, tabY, tabZ);
    this.group.add(this.tabDashboardMesh);

    this.tabTrendingMesh = this.createTabPill(
      '🔥 TRENDING',
      0.21,
      () => this.switchTab('trending')
    );
    this.tabTrendingMesh.position.set(-0.01, tabY, tabZ);
    this.group.add(this.tabTrendingMesh);

    this.tabDocsMesh = this.createTabPill(
      '⚡ DEV DOCS',
      0.21,
      () => this.switchTab('docs')
    );
    this.tabDocsMesh.position.set(0.22, tabY, tabZ);
    this.group.add(this.tabDocsMesh);

    // 5. Bottom Grab Handle Bar (Y: -0.33m)
    const handleY = -this.baseHeight / 2 - 0.04;
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
    this.handleMesh.position.set(0, handleY, 0.01);
    this.group.add(this.handleMesh);

    // 0.15m Hitbox for effortless grabbing
    const hitGeo = new THREE.BoxGeometry(this.baseWidth * 0.75, 0.14, 0.14);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.handleHitbox = new THREE.Mesh(hitGeo, hitMat);
    this.handleHitbox.position.copy(this.handleMesh.position);
    this.handleHitbox.userData = {
      id: 'webdeck-handle',
      type: 'handle',
      panelGroup: this.group,
    };
    this.group.add(this.handleHitbox);

    // Initial render
    this.updateTabVisuals();
    this.renderCanvas();

    // Position panel on left (32 degrees left along 0.82m seated arc)
    const angle = THREE.MathUtils.degToRad(-30);
    const dist = 0.82;
    this.group.position.set(Math.sin(angle) * dist, 1.2, -Math.cos(angle) * dist);
    this.group.rotation.y = THREE.MathUtils.degToRad(20);
  }

  private createTabPill(title: string, width: number, onClick: () => void): THREE.Mesh {
    const height = 0.038;
    const depth = 0.01;
    const geo = new THREE.BoxGeometry(width, height, depth);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a1222,
      roughness: 0.3,
      metalness: 0.8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.3,
    });
    const mesh = new THREE.Mesh(geo, mat);

    // High-res canvas label
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 96;
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const faceMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
    });
    const faceMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.94, height * 0.9),
      faceMat
    );
    faceMesh.position.set(0, 0, depth / 2 + 0.001);
    mesh.add(faceMesh);

    const updateLabel = (text: string, active: boolean) => {
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = active ? 'rgba(56, 189, 248, 0.35)' : 'rgba(15, 23, 42, 0.7)';
      ctx.fillRect(4, 4, canvas.width - 8, canvas.height - 8);

      ctx.strokeStyle = active ? '#00f0ff' : '#334155';
      ctx.lineWidth = active ? 4 : 2;
      ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

      ctx.font = active ? 'bold 34px monospace' : '30px monospace';
      ctx.fillStyle = active ? '#38bdf8' : '#94a3b8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
      texture.needsUpdate = true;
    };

    updateLabel(title, false);

    mesh.userData = {
      id: `tab-${title}`,
      type: 'tab',
      width,
      height,
      depth,
      originalZ: 0.014,
      onTrigger: onClick,
      updateLabel,
      title,
    };

    faceMesh.userData = mesh.userData;

    return mesh;
  }

  public getInteractiveMeshes(): THREE.Mesh[] {
    return [
      this.screenMesh,
      this.tabDashboardMesh,
      this.tabTrendingMesh,
      this.tabDocsMesh,
      this.handleHitbox,
    ];
  }

  public switchTab(tab: 'dashboard' | 'trending' | 'docs'): void {
    this.activeTab = tab;
    if (tab === 'dashboard') {
      this.currentUrl = 'https://spatial.web/dashboard';
    } else if (tab === 'trending') {
      this.currentUrl = 'https://horizon.os/trending-media';
    } else {
      this.currentUrl = 'https://developer.meta.com/docs/spatial';
    }

    this.audio.playClick(1.4);
    this.updateTabVisuals();
    this.renderCanvas();
  }

  private updateTabVisuals(): void {
    this.tabDashboardMesh.userData.updateLabel?.(
      this.tabDashboardMesh.userData.title,
      this.activeTab === 'dashboard'
    );
    this.tabTrendingMesh.userData.updateLabel?.(
      this.tabTrendingMesh.userData.title,
      this.activeTab === 'trending'
    );
    this.tabDocsMesh.userData.updateLabel?.(
      this.tabDocsMesh.userData.title,
      this.activeTab === 'docs'
    );
  }

  /**
   * Handle Click / Direct Fingertip Poke on the Screen Canvas via normalized UV coordinates
   */
  public handleCanvasTouch(u: number, v: number): void {
    const x = u * this.canvas.width;
    const y = (1 - v) * this.canvas.height;

    if (this.activeTab === 'dashboard') {
      // 1. Pomodoro Timer Buttons (Y: 130 to 175)
      // Play/Pause (X: 180 to 290)
      if (y >= 130 && y <= 175 && x >= 180 && x <= 290) {
        this.isTimerRunning = !this.isTimerRunning;
        this.audio.playClick(this.isTimerRunning ? 1.3 : 0.8);
        this.renderCanvas();
        return;
      }
      // +5 Min (X: 305 to 400)
      if (y >= 130 && y <= 175 && x >= 305 && x <= 400) {
        this.pomodoroRemainingSec += 5 * 60;
        this.audio.playClick(1.5);
        this.renderCanvas();
        return;
      }
      // Reset (X: 415 to 500)
      if (y >= 130 && y <= 175 && x >= 415 && x <= 500) {
        this.isTimerRunning = false;
        this.pomodoroRemainingSec = 25 * 60;
        this.audio.playClick(0.9);
        this.renderCanvas();
        return;
      }

      // 2. Daily Objectives Checkboxes (Y: 260 to 520)
      const taskYStarts = [265, 325, 385, 445];
      for (let i = 0; i < this.tasks.length; i++) {
        const startY = taskYStarts[i];
        if (y >= startY && y <= startY + 48 && x >= 50 && x <= 970) {
          this.tasks[i].completed = !this.tasks[i].completed;
          this.audio.playClick(this.tasks[i].completed ? 1.4 : 0.8);
          this.renderCanvas();
          return;
        }
      }

      // 3. Bookmark Quick Action Cards (Y: 590 to 710)
      const bookmarkXStarts = [50, 285, 520, 755];
      for (let i = 0; i < this.bookmarks.length; i++) {
        const bx = bookmarkXStarts[i];
        if (y >= 590 && y <= 710 && x >= bx && x <= bx + 215) {
          this.bookmarks[i].count += 1;
          this.audio.playClick(1.6);
          this.renderCanvas();
          return;
        }
      }

    } else if (this.activeTab === 'trending') {
      // Clickable Article Cards (Y: 120, 310, 500)
      const cardYStarts = [120, 310, 500];
      for (let i = 0; i < this.articles.length; i++) {
        const startY = cardYStarts[i];
        if (y >= startY && y <= startY + 165 && x >= 50 && x <= 970) {
          this.selectedArticleId = this.articles[i].id;
          // Toggle bookmark if clicked near right edge
          if (x >= 880) {
            this.articles[i].isBookmarked = !this.articles[i].isBookmarked;
          }
          this.audio.playClick(1.3);
          this.renderCanvas();
          return;
        }
      }

    } else if (this.activeTab === 'docs') {
      // Toggle switches (Y: 140, 260, 380, 500)
      const toggleYStarts = [140, 260, 380, 500];
      for (let i = 0; i < this.devToggles.length; i++) {
        const startY = toggleYStarts[i];
        if (y >= startY && y <= startY + 95 && x >= 50 && x <= 970) {
          this.devToggles[i].enabled = !this.devToggles[i].enabled;
          this.audio.playClick(this.devToggles[i].enabled ? 1.4 : 0.8);
          this.renderCanvas();
          return;
        }
      }
    }
  }

  public update(delta: number): void {
    if (this.isTimerRunning && this.activeTab === 'dashboard') {
      this.pomodoroRemainingSec -= delta;
      if (this.pomodoroRemainingSec <= 0) {
        this.pomodoroRemainingSec = 0;
        this.isTimerRunning = false;
        this.audio.playBell();
      }
      this.renderCanvas();
    }
  }

  private renderCanvas(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Glass Backplate
    ctx.fillStyle = 'rgba(7, 13, 25, 0.94)';
    ctx.fillRect(0, 0, w, h);

    // Top Simulated Browser URL Bar
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.fillRect(0, 0, w, 56);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, w, 56);

    // URL Icon & Text
    ctx.font = '15px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText('🔒 ' + this.currentUrl, 30, 35);

    // Right Clock & FPS
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    ctx.font = '14px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.fillText(`${timeStr} · 90 FPS`, w - 30, 35);

    // Render Active Tab Content
    if (this.activeTab === 'dashboard') {
      this.renderDashboardTab();
    } else if (this.activeTab === 'trending') {
      this.renderTrendingTab();
    } else {
      this.renderDocsTab();
    }

    this.texture.needsUpdate = true;
  }

  private renderDashboardTab(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;

    // CARD 1: FOCUS POMODORO (Y: 76 to 195)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(45, 76, w - 90, 120);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(45, 76, w - 90, 120);

    // Ring & Digital Timer
    const mins = Math.floor(this.pomodoroRemainingSec / 60);
    const secs = Math.floor(this.pomodoroRemainingSec % 60);
    ctx.font = 'bold 38px monospace';
    ctx.fillStyle = this.isTimerRunning ? '#34d399' : '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText(`${mins}:${secs < 10 ? '0' : ''}${secs}`, 70, 142);

    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(this.isTimerRunning ? '● FOCUS SESSION ACTIVE' : '○ POMODORO TIMER', 70, 172);

    // Buttons on Right of Timer Card
    // [ ▶ START / ⏸ PAUSE ]
    ctx.fillStyle = this.isTimerRunning ? 'rgba(245, 158, 11, 0.3)' : 'rgba(2, 132, 199, 0.3)';
    ctx.fillRect(180, 130, 110, 44);
    ctx.strokeStyle = this.isTimerRunning ? '#f59e0b' : '#38bdf8';
    ctx.strokeRect(180, 130, 110, 44);
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = this.isTimerRunning ? '#fbbf24' : '#38bdf8';
    ctx.textAlign = 'center';
    ctx.fillText(this.isTimerRunning ? '⏸ PAUSE' : '▶ START', 235, 158);

    // [ +5 MIN ]
    ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
    ctx.fillRect(305, 130, 95, 44);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(305, 130, 95, 44);
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('+5 MIN', 352, 158);

    // [ RESET ]
    ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
    ctx.fillRect(415, 130, 85, 44);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(415, 130, 85, 44);
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('RESET', 457, 158);

    // Quick Stats Badge
    ctx.font = '14px monospace';
    ctx.fillStyle = '#34d399';
    ctx.textAlign = 'right';
    const completedCount = this.tasks.filter((t) => t.completed).length;
    ctx.fillText(`TASKS: ${completedCount}/${this.tasks.length} COMPLETED`, w - 75, 120);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('SEATED ENVELOPE: 0.85M COMFORT', w - 75, 150);

    // CARD 2: DAILY OBJECTIVES CHECKLIST (Y: 215 to 540)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(45, 215, w - 90, 310);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.strokeRect(45, 215, w - 90, 310);

    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText('DAILY OBJECTIVES (TAP TO CHECK / UNCHECK)', 70, 248);

    const taskYStarts = [265, 325, 385, 445];
    this.tasks.forEach((task, idx) => {
      const ty = taskYStarts[idx];

      // Item Box
      ctx.fillStyle = task.completed ? 'rgba(3, 105, 161, 0.25)' : 'rgba(30, 41, 59, 0.5)';
      ctx.fillRect(65, ty, w - 130, 48);
      ctx.strokeStyle = task.completed ? '#0284c7' : '#334155';
      ctx.lineWidth = 1;
      ctx.strokeRect(65, ty, w - 130, 48);

      // Checkbox Indicator Square
      ctx.fillStyle = task.completed ? '#10b981' : '#1e293b';
      ctx.fillRect(85, ty + 10, 28, 28);
      ctx.strokeStyle = task.completed ? '#34d399' : '#64748b';
      ctx.strokeRect(85, ty + 10, 28, 28);

      if (task.completed) {
        ctx.font = 'bold 20px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText('✓', 99, ty + 31);
      }

      // Title
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = task.completed ? '#cbd5e1' : '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(task.title, 130, ty + 30);
    });

    // CARD 3: QUICK BOOKMARKS (Y: 545 to 735)
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('SPATIAL BOOKMARKS (TAP TO OPEN)', 50, 570);

    const bookmarkXStarts = [45, 280, 515, 750];
    this.bookmarks.forEach((bm, idx) => {
      const bx = bookmarkXStarts[idx];
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.fillRect(bx, 585, 225, 125);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.strokeRect(bx, 585, 225, 125);

      ctx.font = '32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(bm.icon, bx + 112, 635);

      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(bm.name, bx + 112, 670);

      ctx.font = '12px monospace';
      ctx.fillStyle = '#64748b';
      ctx.fillText(`${bm.count} Assets`, bx + 112, 692);
    });
  }

  private renderTrendingTab(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;

    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText('TRENDING SPATIAL ARTICLES // CURATED FEED', 50, 95);

    const cardYStarts = [120, 310, 500];
    this.articles.forEach((art, idx) => {
      const cy = cardYStarts[idx];
      const isSelected = art.id === this.selectedArticleId;

      ctx.fillStyle = isSelected ? 'rgba(3, 105, 161, 0.35)' : 'rgba(15, 23, 42, 0.75)';
      ctx.fillRect(45, cy, w - 90, 165);

      ctx.strokeStyle = isSelected ? '#00f0ff' : 'rgba(56, 189, 248, 0.25)';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(45, cy, w - 90, 165);

      // Category Tag
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = '#f59e0b';
      ctx.textAlign = 'left';
      ctx.fillText(art.category, 75, cy + 34);

      // Read time
      ctx.font = '13px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'right';
      ctx.fillText(art.readTime, w - 120, cy + 34);

      // Bookmark Star
      ctx.font = '22px sans-serif';
      ctx.fillStyle = art.isBookmarked ? '#f59e0b' : '#64748b';
      ctx.textAlign = 'center';
      ctx.fillText(art.isBookmarked ? '★' : '☆', w - 85, cy + 38);

      // Article Title
      ctx.font = 'bold 19px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(art.title, 75, cy + 72);

      // Snippet
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(art.snippet, 75, cy + 105);

      // Read More Link
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('READ FULL DISPATCH ➔', 75, cy + 140);
    });
  }

  private renderDocsTab(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;

    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText('META QUEST SPATIAL SDK // FEATURE TOGGLES', 50, 100);

    const toggleYStarts = [135, 255, 375, 495];
    this.devToggles.forEach((tog, idx) => {
      const ty = toggleYStarts[idx];

      ctx.fillStyle = tog.enabled ? 'rgba(6, 78, 59, 0.4)' : 'rgba(15, 23, 42, 0.75)';
      ctx.fillRect(45, ty, w - 90, 95);

      ctx.strokeStyle = tog.enabled ? '#10b981' : 'rgba(56, 189, 248, 0.25)';
      ctx.lineWidth = tog.enabled ? 2 : 1;
      ctx.strokeRect(45, ty, w - 90, 95);

      // Tag
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'left';
      ctx.fillText(tog.tag, 75, ty + 32);

      // Name
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(tog.name, 75, ty + 65);

      // Toggle Pill Switch (Right)
      const pillX = w - 175;
      const pillY = ty + 28;
      ctx.fillStyle = tog.enabled ? '#10b981' : '#334155';
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, 80, 36, 18);
      ctx.fill();

      // Knob
      const knobX = tog.enabled ? pillX + 54 : pillX + 18;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(knobX, pillY + 18, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = tog.enabled ? '#34d399' : '#94a3b8';
      ctx.textAlign = 'right';
      ctx.fillText(tog.enabled ? 'ACTIVE' : 'OFF', pillX - 18, ty + 50);
    });

    // Bottom note
    ctx.font = '14px monospace';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('Tap any row or toggle pill to enable/disable WebXR spatial computing modules.', w / 2, 670);
  }
}
