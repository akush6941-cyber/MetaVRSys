/**
 * AetherDesk MR: Spatial Command & Immersive Media Suite
 * Production-ready Horizon OS Mixed Reality (WebXR Passthrough) Experience
 * - Pure Room Passthrough & Ambient Lighting
 * - Seated/Couch Ergonomic Arc (0.6m - 1.2m reachable zone)
 * - 100% Hands-First Direct Touch & Pinch Navigation
 * - Triple-Panel Glassmorphic Workspace:
 *     1. Center: Immersive Media Player & Cinema Mode Dimmer
 *     2. Left: Daily Flow (Pomodoro Focus & Objectives Checklist)
 *     3. Right: Tactile Holographic Companion (Pinch-to-Rotate 3D Viewer)
 */

import React, { useEffect, useRef, useState } from 'react';
import { App, AppStateUpdate } from './core/App';
import {
  Glasses,
  Hand,
  Maximize2,
  RotateCcw,
  Volume2,
  VolumeX,
  Sparkles,
  Info,
  CheckCircle2,
  Tv,
  CheckSquare,
  Box,
  Eye,
  EyeOff
} from 'lucide-react';

export default function MainApp() {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<App | null>(null);

  const [state, setState] = useState<AppStateUpdate>({
    isInMR: false,
    isCinemaMode: false,
    activeChannelName: 'CYBER WAVE SPECTRUM',
    isTimerRunning: false,
    pomodoroRemainingSec: 25 * 60,
    completedTasksCount: 2,
    totalTasksCount: 4,
    activeModelName: 'QUANTUM CHRONOSPHERE',
    isAudioEnabled: true,
    leftHandTracked: false,
    rightHandTracked: false,
    isPassthroughSimActive: true,
  });

  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const appInstance = new App(containerRef.current, (updated) => {
      setState((prev) => ({ ...prev, ...updated }));
    });
    appRef.current = appInstance;

    return () => {
      appInstance.destroy();
      appRef.current = null;
    };
  }, []);

  const handleResetWorkspace = () => {
    appRef.current?.resetWorkspacePositions();
  };

  const handleToggleCinema = () => {
    appRef.current?.mediaPanel.toggleCinemaMode();
  };

  const handleToggleAudio = () => {
    if (appRef.current) {
      const enabled = appRef.current.audio.toggleMute();
      setState((prev) => ({ ...prev, isAudioEnabled: enabled }));
    }
  };

  const handleTogglePassthroughSim = () => {
    if (appRef.current) {
      const active = appRef.current.togglePassthroughSimulator();
      setState((prev) => ({ ...prev, isPassthroughSimActive: active }));
    }
  };

  const formatSec = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* 3D WebXR MR Viewport */}
      <div
        ref={containerRef}
        className="w-full h-full absolute inset-0 cursor-grab active:cursor-grabbing"
      />

      {/* Top Horizon OS Spatial Control Bar */}
      <header className="absolute top-0 left-0 right-0 p-4 md:p-6 pointer-events-none flex items-start justify-between z-20">
        <div>
          <div className="flex items-center gap-2 mb-1 pointer-events-auto">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center shadow-lg shadow-cyan-950/40 backdrop-blur-md">
              <Glasses className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-wider text-cyan-300 font-mono flex items-center gap-2">
                AETHERDESK <span className="text-white text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/30">MR</span>
              </h1>
              <p className="text-[11px] text-slate-400 font-mono tracking-tight hidden sm:block">
                Spatial Command & Immersive Media Suite · Horizon OS Standards
              </p>
            </div>
          </div>
        </div>

        {/* Top Right Quick Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Cinema Mode Toggle */}
          <button
            onClick={handleToggleCinema}
            className={`px-3 py-1.5 text-xs font-mono rounded-lg border backdrop-blur-md flex items-center gap-1.5 transition-all shadow-md ${
              state.isCinemaMode
                ? 'bg-emerald-950/80 border-emerald-400 text-emerald-300 shadow-emerald-900/40'
                : 'bg-slate-900/80 border-slate-700/60 text-slate-300 hover:bg-slate-800'
            }`}
            title="Toggle Cinema Dimmer Mode"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {state.isCinemaMode ? 'CINEMA ACTIVE' : 'CINEMA MODE'}
            </span>
          </button>

          {/* Reset Workspace */}
          <button
            onClick={handleResetWorkspace}
            className="px-3 py-1.5 text-xs font-mono rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 backdrop-blur-md flex items-center gap-1.5 transition-colors shadow-md"
            title="Reset Windows to Seated Arc"
          >
            <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">RE-CENTER</span>
          </button>

          {/* Passthrough Room Sim Toggle (Desktop Preview) */}
          {!state.isInMR && (
            <button
              onClick={handleTogglePassthroughSim}
              className={`p-2 rounded-lg border backdrop-blur-md transition-colors shadow-md ${
                state.isPassthroughSimActive
                  ? 'bg-slate-900/80 border-cyan-500/40 text-cyan-300'
                  : 'bg-slate-900/80 border-slate-700/60 text-slate-500'
              }`}
              title="Toggle Desktop Room Simulator"
            >
              {state.isPassthroughSimActive ? (
                <Eye className="w-4 h-4" />
              ) : (
                <EyeOff className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Audio Toggle */}
          <button
            onClick={handleToggleAudio}
            className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 backdrop-blur-md transition-colors shadow-md"
            title="Toggle Audio Synthesizer"
          >
            {state.isAudioEnabled ? (
              <Volume2 className="w-4 h-4 text-cyan-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {/* Guide Modal Toggle */}
          <button
            onClick={() => setShowGuide(true)}
            className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 backdrop-blur-md transition-colors shadow-md"
            title="MR Manual & Hand Gestures"
          >
            <Info className="w-4 h-4 text-cyan-400" />
          </button>
        </div>
      </header>

      {/* Floating Left Telemetry Bar (Horizon OS Style Glass Cards) */}
      <aside className="absolute left-4 top-24 pointer-events-none z-20 hidden md:flex flex-col gap-2.5">
        {/* MR Mode Status Card */}
        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 backdrop-blur-lg text-xs font-mono space-y-1.5 w-64 shadow-2xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1.5">
              <Glasses className="w-3.5 h-3.5 text-cyan-400" /> PASSTHROUGH
            </span>
            <span className={state.isInMR ? 'text-emerald-400 font-bold' : 'text-cyan-400'}>
              {state.isInMR ? '● ROOM AR ACTIVE' : 'DESKTOP SIM'}
            </span>
          </div>
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>Seated Arc: 0.85m</span>
            <span className="text-emerald-400">Couch Ready</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-cyan-400 h-full w-[85%]" />
          </div>
        </div>

        {/* Hand Input Telemetry */}
        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 backdrop-blur-lg text-xs font-mono space-y-2 w-64 shadow-2xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1.5">
              <Hand className="w-3.5 h-3.5 text-cyan-400" /> HAND INPUT (W3C)
            </span>
            <span className="text-[10px] text-slate-400">NO CONTROLLER</span>
          </div>

          <div className="space-y-1 text-[11px]">
            <div className="flex items-center justify-between text-slate-400">
              <span>Left Hand:</span>
              <span className={state.leftHandTracked ? 'text-emerald-400' : 'text-slate-400'}>
                {state.leftHandTracked ? 'TRACKED (HALO)' : 'WAITING'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Right Hand:</span>
              <span className={state.rightHandTracked ? 'text-emerald-400' : 'text-slate-400'}>
                {state.rightHandTracked ? 'TRACKED (HALO)' : 'WAITING'}
              </span>
            </div>
          </div>
        </div>

        {/* Live Workspace Summary */}
        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 backdrop-blur-lg text-xs font-mono space-y-2 w-64 shadow-2xl">
          <div className="flex items-center justify-between text-slate-400">
            <span>ACTIVE SUITE</span>
            <span className="text-cyan-400 text-[10px]">3 WINDOWS</span>
          </div>

          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1 text-slate-400">
                <Tv className="w-3 h-3 text-cyan-400" /> Center:
              </span>
              <span className="truncate max-w-[130px] text-cyan-200">
                {state.activeChannelName}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1 text-slate-400">
                <CheckSquare className="w-3 h-3 text-emerald-400" /> Focus:
              </span>
              <span className="text-emerald-300">
                {formatSec(state.pomodoroRemainingSec)} ({state.completedTasksCount}/{state.totalTasksCount})
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1 text-slate-400">
                <Box className="w-3 h-3 text-purple-400" /> Artifact:
              </span>
              <span className="text-purple-300">3D Hologram</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Guide Modal */}
      {showGuide && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-md z-40 flex items-center justify-center p-4">
          <div className="bg-slate-900/95 border border-cyan-500/40 rounded-2xl p-6 max-w-lg w-full text-slate-200 font-mono text-xs space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Glasses className="w-5 h-5 text-cyan-400" />
                <span className="text-sm font-bold tracking-wide text-cyan-300">
                  AETHERDESK MR // USER GUIDE
                </span>
              </div>
              <button
                onClick={() => setShowGuide(false)}
                className="text-slate-400 hover:text-white px-2 py-1 text-sm rounded hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-slate-300 leading-relaxed max-h-[70vh] overflow-y-auto pr-2">
              <div>
                <p className="text-cyan-400 font-bold mb-1 flex items-center gap-1.5">
                  <Hand className="w-4 h-4" /> 1. Direct Touch & Hand Interactions:
                </p>
                <ul className="list-disc list-inside text-slate-400 space-y-1">
                  <li>
                    <strong className="text-slate-200">Tap / Direct Poke:</strong> Touch buttons on any panel directly with your index fingertip. Visual micro-halos guide your depth.
                  </li>
                  <li>
                    <strong className="text-slate-200">Move Window (Top Title Bar or Bottom Handle):</strong> Pinch the top header rail or bottom pill bar to move any window. Supports direct pinch (0.15m hitbox) OR pointing with your hand ray from a distance!
                  </li>
                  <li>
                    <strong className="text-slate-200">Pinch Corner Pin to Resize:</strong> Pinch the glowing spherical pin at the top-right corner to scale windows up or down.
                  </li>
                  <li>
                    <strong className="text-slate-200">Pinch 3D Artifact:</strong> Pinch the floating holographic asset on the right panel to spin and inspect it in 3D.
                  </li>
                </ul>
              </div>

              <div>
                <p className="text-cyan-400 font-bold mb-1 flex items-center gap-1.5">
                  <Maximize2 className="w-4 h-4" /> 2. Cinema Mode Dimmer:
                </p>
                <p className="text-slate-400">
                  Tap "CINEMA MODE" to gradually dim your real physical room with an ambient spatial vignette, expanding the media player into an IMAX curved screen.
                </p>
              </div>

              <div>
                <p className="text-cyan-400 font-bold mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> 3. Seated Couch Ergonomics:
                </p>
                <p className="text-slate-400">
                  All 3 panels are curved along a 0.85m arc (0.6m - 1.2m reachable zone). You can sit comfortably without leaning forward. Tap "RE-CENTER" anytime to reset window positions.
                </p>
              </div>

              <div>
                <p className="text-cyan-400 font-bold mb-1 flex items-center gap-1.5">
                  <Glasses className="w-4 h-4" /> 4. Meta Quest Browser Launch:
                </p>
                <p className="text-slate-400">
                  Click <strong className="text-cyan-300">ENTER MR / PASSTHROUGH</strong> below. Your physical room will appear instantly with zero controllers needed.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowGuide(false)}
              className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl transition-colors text-center tracking-wider shadow-lg shadow-cyan-900/40"
            >
              RETURN TO WORKSPACE
            </button>
          </div>
        </div>
      )}

      {/* Bottom Hint */}
      <footer className="absolute bottom-2 left-0 right-0 pointer-events-none flex flex-col items-center gap-1 z-20">
        <p className="text-[11px] text-slate-400 font-mono text-center px-4 bg-slate-950/60 py-0.5 rounded-full backdrop-blur-sm">
          Meta Quest 3 / Quest 3S: Click "ENTER MR / PASSTHROUGH" · Move: Pinch Top/Bottom Handles (Direct or Ray)
        </p>
      </footer>
    </div>
  );
}
