import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Sparkles,
  RotateCcw,
  Camera,
  Layers,
  SunMedium,
  Compass,
  Sliders,
  ZoomIn,
  Move,
  Scissors,
  Check
} from 'lucide-react';
import { DicomSeries, DicomStudy } from '../types/dicom';
import { MprEngine, Volume3D } from '../services/mprEngine';
import {
  VolumeRaycaster,
  VOLUME_3D_PRESETS,
  Volume3dPreset,
  Volume3dPresetId
} from '../services/volumeRaycaster';

interface Volume3dModalProps {
  isOpen: boolean;
  onClose: () => void;
  series: DicomSeries | null;
  study: DicomStudy | null;
}

export const Volume3dModal: React.FC<Volume3dModalProps> = ({
  isOpen,
  onClose,
  series,
  study
}) => {
  const [volume, setVolume] = useState<Volume3D | null>(null);
  const [loading, setLoading] = useState(true);

  // 3D Camera & Transform State
  const [yaw, setYaw] = useState<number>(20);
  const [pitch, setPitch] = useState<number>(-15);
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Rendering Settings
  const [selectedPreset, setSelectedPreset] = useState<Volume3dPreset>(VOLUME_3D_PRESETS[0]);
  const [thresholdMin, setThresholdMin] = useState<number>(140);
  const [thresholdMax, setThresholdMax] = useState<number>(1400);
  const [clipPlaneZ, setClipPlaneZ] = useState<number>(1.0);

  // Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const [dragBtn, setDragBtn] = useState<number | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initYaw, setInitYaw] = useState(0);
  const [initPitch, setInitPitch] = useState(0);
  const [initPan, setInitPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initZoom, setInitZoom] = useState(1.0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build 3D Voxel Volume when opened
  useEffect(() => {
    if (!isOpen || !series || series.instances.length < 2) {
      setVolume(null);
      return;
    }

    setLoading(true);
    // Asynchronous build so UI never freezes
    const timer = setTimeout(() => {
      const vol = MprEngine.buildVolume(series);
      setVolume(vol);
      setLoading(false);
    }, 50);

    return () => clearTimeout(timer);
  }, [isOpen, series]);

  // Sync preset threshold
  const handleSelectPreset = (preset: Volume3dPreset) => {
    setSelectedPreset(preset);
    setThresholdMin(preset.minThreshold);
    setThresholdMax(preset.maxThreshold);
  };

  const [enableAmbientOcclusion, setEnableAmbientOcclusion] = useState<boolean>(true);
  const [ultraQuality, setUltraQuality] = useState<boolean>(true);

  // Render 3D Canvas
  const render3D = useCallback((quality: 'fast' | 'high' | 'ultra' = 'high') => {
    if (!canvasRef.current || !containerRef.current || !volume) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = containerRef.current.getBoundingClientRect();
    const isFast = quality === 'fast';
    const isUltra = quality === 'ultra' || (ultraQuality && !isFast);
    const renderWidth = isFast ? 220 : (isUltra ? 480 : 360);
    const renderHeight = isFast ? 220 : (isUltra ? 480 : 360);

    const imgData = VolumeRaycaster.render(volume, renderWidth, renderHeight, {
      yawDeg: yaw,
      pitchDeg: pitch,
      zoom,
      panX: pan.x,
      panY: pan.y,
      preset: selectedPreset,
      thresholdMin,
      thresholdMax,
      clipPlaneZ,
      enableAmbientOcclusion,
      quality: isFast ? 'fast' : (isUltra ? 'ultra' : 'high')
    });

    const offscreen = document.createElement('canvas');
    offscreen.width = renderWidth;
    offscreen.height = renderHeight;
    const offCtx = offscreen.getContext('2d');
    if (offCtx) {
      offCtx.putImageData(imgData, 0, 0);

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(offscreen, 0, 0, rect.width, rect.height);

      // Draw 3D Orientation Compass
      drawOrientationCompass(ctx, rect.width - 50, 50, yaw, pitch);

      ctx.restore();
    }
  }, [volume, yaw, pitch, zoom, pan, selectedPreset, thresholdMin, thresholdMax, clipPlaneZ, enableAmbientOcclusion, ultraQuality]);

  // Trigger high quality render when idle
  useEffect(() => {
    if (volume && !isDragging) {
      render3D(ultraQuality ? 'ultra' : 'high');
    }
  }, [volume, isDragging, render3D, ultraQuality]);

  // Trigger fast render while dragging
  useEffect(() => {
    if (volume && isDragging) {
      render3D('fast');
    }
  }, [volume, isDragging, render3D]);

  // Mouse Interactions
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragBtn(e.button);
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitYaw(yaw);
    setInitPitch(pitch);
    setInitPan({ ...pan });
    setInitZoom(zoom);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    if (dragBtn === 0) {
      // Left Click: Free 3D Rotation
      setYaw((initYaw + dx * 0.7) % 360);
      setPitch(Math.max(-88, Math.min(88, initPitch + dy * 0.7)));
    } else if (dragBtn === 1) {
      // Middle Click: Pan
      setPan({ x: initPan.x + dx * 0.8, y: initPan.y + dy * 0.8 });
    } else if (dragBtn === 2) {
      // Right Click: Zoom
      const factor = Math.exp(-dy * 0.008);
      setZoom(Math.max(0.4, Math.min(6.0, initZoom * factor)));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom(prev => Math.max(0.4, Math.min(6.0, prev * factor)));
  };

  // Anatomical Camera View Presets
  const setAnatomicalView = (view: 'A' | 'P' | 'R' | 'L' | 'S' | 'I') => {
    switch (view) {
      case 'A': setYaw(0); setPitch(0); break;
      case 'P': setYaw(180); setPitch(0); break;
      case 'R': setYaw(90); setPitch(0); break;
      case 'L': setYaw(-90); setPitch(0); break;
      case 'S': setYaw(0); setPitch(-85); break;
      case 'I': setYaw(0); setPitch(85); break;
    }
  };

  // Capture High-Res Snapshot
  const handleExportSnapshot = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `3D_VR_${study?.patientName || 'Medical'}_${Date.now()}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 animate-in fade-in select-none">
      <div className="w-full h-full max-w-[1550px] max-h-[920px] bg-radiant-darkest border border-radiant-border rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* 1. Header */}
        <div className="h-12 bg-radiant-panel border-b border-radiant-border flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-amber-600 to-rose-600 rounded-lg text-white font-bold shadow-[0_0_12px_rgba(245,158,11,0.3)]">
              <Sparkles className="w-4 h-4 text-amber-200" />
              <span>3D Volume Rendering Workstation (3D VR)</span>
            </div>
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-300">
              <span className="text-cyan-400 font-semibold">{study?.patientName.replace(/\^/g, ' ')}</span>
              <span className="text-slate-500">•</span>
              <span className="text-amber-300">{series?.seriesDescription || series?.modality}</span>
              <span className="text-slate-500">•</span>
              <span className="font-mono text-slate-400">{volume ? `${volume.dimX}×${volume.dimY}×${volume.dimZ} voxels` : ''}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportSnapshot}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-radiant-dark hover:bg-radiant-hover text-cyan-300 rounded border border-radiant-border text-xs transition-colors"
              title="Save High-Res 3D Image (PNG)"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Snapshot</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2. Main 3D Workspace */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: 3D Viewport */}
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()}
            className="flex-1 relative bg-black flex items-center justify-center cursor-grab active:cursor-grabbing overflow-hidden group"
          >
            {loading ? (
              <div className="flex flex-col items-center gap-3 text-cyan-400">
                <div className="w-10 h-10 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs font-semibold">Constructing 3D Voxel Grid...</span>
              </div>
            ) : (
              <canvas ref={canvasRef} className="w-full h-full" />
            )}

            {/* Quick Anatomical Camera Cube Buttons (Top Left) */}
            <div className="absolute top-3 left-3 flex items-center gap-1 bg-black/60 backdrop-blur-md p-1 rounded-lg border border-radiant-border">
              {(['A', 'P', 'R', 'L', 'S', 'I'] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => setAnatomicalView(view)}
                  className="w-7 h-7 bg-radiant-panel/80 hover:bg-cyan-600 hover:text-white rounded text-xs font-bold font-mono transition-colors"
                  title={`View: ${view === 'A' ? 'Anterior' : view === 'P' ? 'Posterior' : view === 'R' ? 'Right' : view === 'L' ? 'Left' : view === 'S' ? 'Superior' : 'Inferior'}`}
                >
                  {view}
                </button>
              ))}
            </div>

            {/* Navigation Badge (Bottom Left) */}
            <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-radiant-border text-[11px] font-mono text-slate-300">
              <span>Rotate: Left Drag</span> • <span>Zoom: Right Drag / Wheel</span> • <span>Pan: Mid Drag</span>
            </div>

            {/* Rotation Stats (Bottom Right) */}
            <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-radiant-border text-[11px] font-mono text-cyan-300">
              Yaw: {Math.round(yaw)}° • Pitch: {Math.round(pitch)}° • Zoom: {Math.round(zoom * 100)}%
            </div>
          </div>

          {/* Right: Controls & Presets Panel */}
          <div className="w-80 bg-radiant-panel border-l border-radiant-border flex flex-col p-4 gap-4 overflow-y-auto">
            {/* Presets */}
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>3D Clinical Presets</span>
              </div>
              <div className="space-y-1.5">
                {VOLUME_3D_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPreset(p)}
                    className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all ${
                      selectedPreset.id === p.id
                        ? 'bg-amber-950/40 text-amber-300 border-amber-500/80 shadow-[0_0_10px_rgba(245,158,11,0.2)] font-bold'
                        : 'bg-radiant-darkest hover:bg-radiant-hover text-slate-300 border-radiant-border'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{p.name}</span>
                      {selectedPreset.id === p.id && <Check className="w-4 h-4 text-amber-400" />}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{p.category}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-radiant-border" />

            {/* Threshold & Transparency Sliders */}
            <div className="space-y-3">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span>Density Threshold (HU)</span>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Min Threshold:</span>
                  <span className="font-mono text-cyan-300 font-bold">{thresholdMin} HU</span>
                </div>
                <input
                  type="range"
                  min="-500"
                  max="1000"
                  step="10"
                  value={thresholdMin}
                  onChange={(e) => setThresholdMin(parseInt(e.target.value, 10))}
                  className="w-full accent-cyan-500 bg-slate-800 rounded h-1.5 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Max Density:</span>
                  <span className="font-mono text-cyan-300 font-bold">{thresholdMax} HU</span>
                </div>
                <input
                  type="range"
                  min="200"
                  max="3000"
                  step="20"
                  value={thresholdMax}
                  onChange={(e) => setThresholdMax(parseInt(e.target.value, 10))}
                  className="w-full accent-cyan-500 bg-slate-800 rounded h-1.5 cursor-pointer"
                />
              </div>
            </div>

            <div className="h-px bg-radiant-border" />

            {/* Clip Plane (Internal Dissection) */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Scissors className="w-3.5 h-3.5 text-rose-400" />
                <span>Axial Dissection / Clip Plane</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Slice Depth:</span>
                <span className="font-mono text-rose-300 font-bold">{Math.round(clipPlaneZ * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.02"
                value={clipPlaneZ}
                onChange={(e) => setClipPlaneZ(parseFloat(e.target.value))}
                className="w-full accent-rose-500 bg-slate-800 rounded h-1.5 cursor-pointer"
              />
            </div>

            {/* Cinematic Lighting & Quality Settings */}
            <div className="space-y-2.5">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <SunMedium className="w-3.5 h-3.5 text-amber-400" />
                <span>Cinematic Lighting & Shading</span>
              </div>

              {/* Ambient Occlusion Toggle */}
              <button
                onClick={() => setEnableAmbientOcclusion(!enableAmbientOcclusion)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-colors ${
                  enableAmbientOcclusion
                    ? 'bg-cyan-950/40 text-cyan-300 border-cyan-500/60 font-semibold'
                    : 'bg-radiant-darkest text-slate-400 border-radiant-border'
                }`}
              >
                <span>Cavity Shadows (Ambient Occlusion)</span>
                <span className={`w-3 h-3 rounded-full ${enableAmbientOcclusion ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]' : 'bg-slate-700'}`} />
              </button>

              {/* Ultra-HD Quality Toggle */}
              <button
                onClick={() => setUltraQuality(!ultraQuality)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-colors ${
                  ultraQuality
                    ? 'bg-amber-950/40 text-amber-300 border-amber-500/60 font-semibold'
                    : 'bg-radiant-darkest text-slate-400 border-radiant-border'
                }`}
              >
                <span>Ultra-HD Trilinear Raycasting</span>
                <span className={`w-3 h-3 rounded-full ${ultraQuality ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]' : 'bg-slate-700'}`} />
              </button>
            </div>

            <div className="h-px bg-radiant-border" />

            {/* Reset View Button */}
            <button
              onClick={() => {
                setYaw(20);
                setPitch(-15);
                setZoom(1.0);
                setPan({ x: 0, y: 0 });
                setClipPlaneZ(1.0);
                handleSelectPreset(selectedPreset);
              }}
              className="w-full flex items-center justify-center gap-2 py-2 bg-radiant-dark hover:bg-radiant-hover text-slate-300 rounded-lg border border-radiant-border text-xs transition-colors font-medium mt-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset 3D Camera & Plane</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function drawOrientationCompass(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  yawDeg: number,
  pitchDeg: number
) {
  const radY = (yawDeg * Math.PI) / 180;
  const radP = (pitchDeg * Math.PI) / 180;

  const size = 26;

  const axes = [
    { label: 'R', x: size, y: 0, z: 0, color: '#f59e0b' },
    { label: 'A', x: 0, y: size, z: 0, color: '#38bdf8' },
    { label: 'S', x: 0, y: 0, z: size, color: '#10b981' }
  ];

  ctx.lineWidth = 2.5;

  for (const axis of axes) {
    const rx1 = axis.x * Math.cos(radY) - axis.z * Math.sin(radY);
    const rz1 = axis.x * Math.sin(radY) + axis.z * Math.cos(radY);
    const ry = axis.y * Math.cos(radP) - rz1 * Math.sin(radP);

    ctx.strokeStyle = axis.color;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + rx1, cy + ry);
    ctx.stroke();

    ctx.fillStyle = axis.color;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(axis.label, cx + rx1 * 1.3 - 4, cy + ry * 1.3 + 4);
  }
}
