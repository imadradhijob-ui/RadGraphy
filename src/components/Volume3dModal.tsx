import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Sparkles,
  RotateCcw,
  RotateCw,
  Camera,
  SunMedium,
  Sliders,
  Scissors,
  Check,
  Zap,
  Layers,
  ZoomIn,
  ZoomOut,
  Move
} from 'lucide-react';
import { DicomSeries, DicomStudy } from '../types/dicom';
import { MprEngine, Volume3D, findMainVolumetricSeries, isTopogramOrSingleSlice } from '../services/mprEngine';
import {
  VolumeRaycaster,
  VOLUME_3D_PRESETS,
  Volume3dPreset
} from '../services/volumeRaycaster';
import { WebglVolumeRenderer } from '../services/webglVolumeRenderer';

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
  const [selectedSeriesUid, setSelectedSeriesUid] = useState<string | null>(null);
  const [volume, setVolume] = useState<Volume3D | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize selected series when modal opens or initial series/study changes
  useEffect(() => {
    if (!isOpen) return;

    const mainVolumetric = findMainVolumetricSeries(study);
    // If passed series has >= 4 slices and is not scout/topogram, use it
    if (series && series.instances.length >= 4 && !isTopogramOrSingleSlice(series)) {
      setSelectedSeriesUid(series.seriesInstanceUid);
    } else if (mainVolumetric) {
      setSelectedSeriesUid(mainVolumetric.seriesInstanceUid);
    } else {
      const best = study?.series.find(s => s.instances.length >= 2 && !isTopogramOrSingleSlice(s)) ||
        study?.series.find(s => s.instances.length >= 2) ||
        series ||
        study?.series[0];
      if (best) {
        setSelectedSeriesUid(best.seriesInstanceUid);
      }
    }
  }, [isOpen, series, study]);

  const active3dSeries = study?.series.find(s => s.seriesInstanceUid === selectedSeriesUid) || series;

  // 3D Camera & Transform State (Canonical Anterior View: Yaw 0°, Pitch 0°, Zoom 1.0x fills ~82% of screen)
  const [yaw, setYaw] = useState<number>(0);
  const [pitch, setPitch] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Rendering Settings
  const [selectedPreset, setSelectedPreset] = useState<Volume3dPreset>(VOLUME_3D_PRESETS[0]);
  const [thresholdMin, setThresholdMin] = useState<number>(VOLUME_3D_PRESETS[0].minThreshold);
  const [thresholdMax, setThresholdMax] = useState<number>(VOLUME_3D_PRESETS[0].maxThreshold);
  const [clipPlaneZ, setClipPlaneZ] = useState<number>(1.0);

  // Cinematic Shading Settings
  const [specularPower, setSpecularPower] = useState<number>(64);
  const [specularIntensity, setSpecularIntensity] = useState<number>(0.75);
  const [enableAmbientOcclusion, setEnableAmbientOcclusion] = useState<boolean>(true);
  const [ultraQuality, setUltraQuality] = useState<boolean>(true);
  const [isWebglActive, setIsWebglActive] = useState<boolean>(true);

  // Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const dragBtnRef = useRef<number>(0);
  const lastPointerPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compassCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const webglRendererRef = useRef<WebglVolumeRenderer | null>(null);

  // Cleanup WebGL resources on unmount or when modal closes
  useEffect(() => {
    if (!isOpen) {
      if (webglRendererRef.current) {
        webglRendererRef.current.destroy();
        webglRendererRef.current = null;
      }
      setVolume(null);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (webglRendererRef.current) {
        webglRendererRef.current.destroy();
        webglRendererRef.current = null;
      }
    };
  }, []);

  // Build 3D Voxel Volume when opened or active series changes
  useEffect(() => {
    if (!isOpen || !active3dSeries || active3dSeries.instances.length < 2) {
      setVolume(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      try {
        const vol = MprEngine.buildVolume(active3dSeries);
        setVolume(vol);
      } catch (err) {
        console.error('Failed to build 3D volume:', err);
        setVolume(null);
      } finally {
        setLoading(false);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [isOpen, active3dSeries]);

  // Dynamic threshold & preset adaptation for Brain Soft Tissue, MR, or non-CT dynamic ranges
  useEffect(() => {
    if (!volume) return;

    const range = volume.maxHu - volume.minHu;
    const isMr = active3dSeries?.modality === 'MR' || (volume.minHu >= 0 && volume.maxHu < 1500);
    const desc = (active3dSeries?.seriesDescription || '').toLowerCase();
    const isSoftTissueBrain = (desc.includes('brain') || desc.includes('neuro') || desc.includes('head')) && !desc.includes('bone') && volume.maxHu < 450;

    if (isSoftTissueBrain) {
      // Soft tissue brain scan where max HU < 450 (brain parenchyma 25..120 HU)
      const brainPreset = VOLUME_3D_PRESETS.find(p => p.id === 'brain') || VOLUME_3D_PRESETS[0];
      setSelectedPreset(brainPreset);
      setThresholdMin(25);
      setThresholdMax(Math.min(140, Math.round(volume.maxHu * 0.85)));
    } else if (isMr || volume.maxHu < 300) {
      // MR or narrow dynamic range scan (e.g. 0..500 or 0..255)
      const adaptiveMin = Math.round(volume.minHu + range * 0.18);
      const adaptiveMax = Math.round(volume.minHu + range * 0.85);
      setThresholdMin(adaptiveMin);
      setThresholdMax(adaptiveMax);
    }
  }, [volume, active3dSeries]);

  // Sync preset threshold
  const handleSelectPreset = (preset: Volume3dPreset) => {
    setSelectedPreset(preset);
    setThresholdMin(preset.minThreshold);
    setThresholdMax(preset.maxThreshold);
    if (preset.specularPower) {
      setSpecularPower(preset.specularPower);
    }
  };

  // Render 3D Canvas
  const render3D = useCallback((quality: 'fast' | 'high' | 'ultra' = 'high') => {
    if (!canvasRef.current || !containerRef.current || !volume) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    // Initialize WebGL2 renderer if not already created or if canvas element changed
    if (!webglRendererRef.current || webglRendererRef.current.canvas !== canvas) {
      if (webglRendererRef.current) {
        webglRendererRef.current.destroy();
        webglRendererRef.current = null;
      }
      try {
        const renderer = new WebglVolumeRenderer(canvas);
        if (renderer.isSupported()) {
          webglRendererRef.current = renderer;
          setIsWebglActive(true);
        } else {
          setIsWebglActive(false);
        }
      } catch (e) {
        console.warn('WebGL2 init failed, falling back to CPU raycaster:', e);
        setIsWebglActive(false);
      }
    }

    const dpr = Math.min(window.devicePixelRatio || 1, quality === 'fast' ? 1.25 : 2);
    const displayWidth = Math.round(rect.width * dpr);
    const displayHeight = Math.round(rect.height * dpr);

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
    }

    if (webglRendererRef.current && isWebglActive) {
      // 1. Hardware Accelerated GPU WebGL2 Raymarcher (60 FPS Native Resolution)
      webglRendererRef.current.render(volume, displayWidth, displayHeight, {
        yawDeg: yaw,
        pitchDeg: pitch,
        zoom,
        panX: pan.x * dpr,
        panY: pan.y * dpr,
        preset: selectedPreset,
        thresholdMin,
        thresholdMax,
        clipPlaneZ,
        enableAmbientOcclusion,
        specularPower,
        specularIntensity,
        quality
      });
    } else {
      // 2. Automated Safe Fallback: Multi-Threaded CPU Raycaster
      const isFast = quality === 'fast';
      const isUltra = quality === 'ultra' || (ultraQuality && !isFast);
      const renderWidth = isFast ? 240 : (isUltra ? 500 : 380);
      const renderHeight = isFast ? 240 : (isUltra ? 500 : 380);

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
        const ctx2d = canvas.getContext('2d');
        if (ctx2d) {
          ctx2d.clearRect(0, 0, displayWidth, displayHeight);
          ctx2d.drawImage(offscreen, 0, 0, displayWidth, displayHeight);
        }
      }
    }

    // 3. Render 3D Orientation Compass on Overlay Canvas
    if (compassCanvasRef.current) {
      const cCanvas = compassCanvasRef.current;
      if (cCanvas.width !== displayWidth || cCanvas.height !== displayHeight) {
        cCanvas.width = displayWidth;
        cCanvas.height = displayHeight;
      }
      const cCtx = cCanvas.getContext('2d');
      if (cCtx) {
        cCtx.save();
        cCtx.scale(dpr, dpr);
        cCtx.clearRect(0, 0, rect.width, rect.height);
        drawOrientationCompass(cCtx, rect.width - 50, 50, yaw, pitch);
        cCtx.restore();
      }
    }
  }, [volume, yaw, pitch, zoom, pan, selectedPreset, thresholdMin, thresholdMax, clipPlaneZ, enableAmbientOcclusion, specularPower, specularIntensity, isWebglActive, ultraQuality]);

  // Trigger high quality render when idle
  useEffect(() => {
    if (volume && !isDragging) {
      render3D(ultraQuality ? 'ultra' : 'high');
    }
  }, [volume, isDragging, render3D, ultraQuality]);

  // Auto-render when container dimensions become valid or on layout resize
  useEffect(() => {
    if (!isOpen || !containerRef.current || !volume) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          render3D(ultraQuality ? 'ultra' : 'high');
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isOpen, volume, render3D, ultraQuality]);

  // Real-time render while dragging
  useEffect(() => {
    if (volume && isDragging) {
      render3D('fast');
    }
  }, [volume, isDragging, render3D]);

  // Mouse & Pointer Interactions with hardware pointer capture for uninterrupted 360° rotation
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragBtnRef.current = e.button;
    lastPointerPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastPointerPos.current.x;
    const dy = e.clientY - lastPointerPos.current.y;
    lastPointerPos.current = { x: e.clientX, y: e.clientY };

    if (dragBtnRef.current === 0) {
      // Primary Left Drag: Natural Trackball Turntable Yaw & Pitch
      setYaw(prev => {
        let next = prev - dx * 0.65;
        while (next > 180) next -= 360;
        while (next < -180) next += 360;
        return next;
      });
      setPitch(prev => Math.max(-89, Math.min(89, prev + dy * 0.65)));
    } else if (dragBtnRef.current === 1) {
      // Middle Drag: Pan
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    } else if (dragBtnRef.current === 2) {
      // Right Drag: Zoom
      const factor = Math.exp(-dy * 0.008);
      setZoom(prev => Math.max(0.3, Math.min(8.0, prev * factor)));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom(prev => Math.max(0.3, Math.min(8.0, prev * factor)));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setYaw(prev => {
        let next = prev + 8;
        return next > 180 ? next - 360 : next;
      });
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setYaw(prev => {
        let next = prev - 8;
        return next < -180 ? next + 360 : next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPitch(prev => Math.max(-89, prev - 8));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPitch(prev => Math.min(89, prev + 8));
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      setZoom(prev => Math.min(8.0, prev * 1.15));
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      setZoom(prev => Math.max(0.3, prev * 0.85));
    }
  };

  // Anatomical Camera View Presets
  const setAnatomicalView = (view: 'A' | 'P' | 'R' | 'L' | 'S' | 'I') => {
    switch (view) {
      case 'A': setYaw(0); setPitch(0); break;     // Anterior (Front Face)
      case 'P': setYaw(180); setPitch(0); break;   // Posterior (Back of Head)
      case 'R': setYaw(90); setPitch(0); break;    // Right Lateral Profile
      case 'L': setYaw(-90); setPitch(0); break;   // Left Lateral Profile
      case 'S': setYaw(0); setPitch(-85); break;   // Superior (Top-down)
      case 'I': setYaw(0); setPitch(85); break;    // Inferior (Bottom-up Chin)
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
              <span>3D Cinematic Volume Rendering (3D VRT)</span>
            </div>

            {/* GPU Active Badge */}
            {isWebglActive ? (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/80 text-emerald-300 font-mono text-[10.5px] font-bold flex items-center gap-1.5 shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                <Zap className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>WebGL2 GPU Accelerated (60 FPS)</span>
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-950/80 border border-amber-500/80 text-amber-300 font-mono text-[10px] font-bold">
                <span>CPU Safe Mode</span>
              </span>
            )}

            {/* Series Switcher Dropdown */}
            {study && study.series.length > 1 && (
              <div className="flex items-center gap-1.5 bg-radiant-dark border border-radiant-border rounded-lg px-2.5 py-1 text-xs">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-slate-400 text-[11px] font-medium hidden lg:inline">Series:</span>
                <select
                  value={active3dSeries?.seriesInstanceUid || ''}
                  onChange={(e) => setSelectedSeriesUid(e.target.value)}
                  className="bg-transparent text-xs text-amber-300 font-semibold outline-none cursor-pointer max-w-[210px] truncate"
                  title="Switch 3D Series"
                >
                  {study.series.map((s, idx) => (
                    <option key={s.seriesInstanceUid} value={s.seriesInstanceUid} className="bg-slate-900 text-slate-100">
                      {s.seriesDescription || s.modality || `Series ${idx + 1}`} ({s.instances.length} slices)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="hidden md:flex items-center gap-2 text-xs text-slate-300">
              <span className="text-cyan-400 font-semibold">{study?.patientName.replace(/\^/g, ' ')}</span>
              <span className="text-slate-500">•</span>
              <span className="font-mono text-slate-400">{volume ? `${volume.dimX}×${volume.dimY}×${volume.dimZ} voxels` : ''}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportSnapshot}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-radiant-dark hover:bg-radiant-hover text-cyan-300 rounded border border-radiant-border text-xs transition-colors cursor-pointer"
              title="Save High-Res 3D Image (PNG)"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Snapshot</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
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
            tabIndex={0}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
            onKeyDown={handleKeyDown}
            onContextMenu={(e) => e.preventDefault()}
            className="flex-1 relative bg-black flex items-center justify-center cursor-grab active:cursor-grabbing overflow-hidden group touch-none outline-none"
          >
            {loading ? (
              <div className="flex flex-col items-center gap-3 text-cyan-400">
                <div className="w-10 h-10 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs font-semibold">Constructing 3D Voxel Grid & GPU Textures...</span>
              </div>
            ) : !volume ? (
              <div className="flex flex-col items-center justify-center p-6 text-center max-w-lg bg-radiant-panel/90 border border-radiant-border rounded-xl shadow-2xl backdrop-blur-md">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mb-3">
                  <Layers className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1.5">No 3D Volume Available For This Series</h3>
                <p className="text-xs text-slate-300 mb-4">
                  {active3dSeries && active3dSeries.instances.length < 2
                    ? `The selected series "${active3dSeries.seriesDescription || active3dSeries.modality}" has only ${active3dSeries.instances.length} slice (Scout / Localizer / 2D). 3D Volume Rendering requires at least 2 volumetric slices.`
                    : 'Unable to reconstruct 3D voxel grid from this series. Please select an alternative multi-slice series from this study below:'}
                </p>
                {study && study.series.filter(s => s.instances.length >= 2).length > 0 ? (
                  <div className="w-full flex flex-col gap-2 text-left">
                    <span className="text-[11px] text-cyan-300 font-semibold">Available Volumetric Series in this Study:</span>
                    <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
                      {study.series.filter(s => s.instances.length >= 2).map((s, idx) => (
                        <button
                          key={s.seriesInstanceUid}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSeriesUid(s.seriesInstanceUid);
                          }}
                          className="flex items-center justify-between px-3 py-2 bg-radiant-dark hover:bg-cyan-950/60 border border-slate-700 hover:border-cyan-500/60 rounded-lg text-xs transition-colors cursor-pointer text-left"
                        >
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-200">
                              {s.seriesDescription || `${s.modality} Series ${idx + 1}`}
                            </span>
                            <span className="text-[10px] text-slate-400">{s.modality} • {s.instances[0]?.rows || 512}×{s.instances[0]?.columns || 512}</span>
                          </div>
                          <span className="px-2.5 py-1 rounded bg-cyan-950 text-cyan-300 font-mono text-[11px] border border-cyan-800 font-bold">
                            {s.instances.length} slices
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    This study does not contain multi-slice volumetric CT or MRI series suitable for 3D reconstruction.
                  </p>
                )}
              </div>
            ) : (
              <>
                {/* Main 3D Hardware Accelerated Canvas */}
                <canvas ref={canvasRef} className="w-full h-full block" />
                {/* 2D Compass Overlay Canvas */}
                <canvas ref={compassCanvasRef} className="absolute inset-0 pointer-events-none w-full h-full" />
              </>
            )}

            {/* Quick Controls Bar (Top Left) */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/70 backdrop-blur-md p-1.5 rounded-lg border border-radiant-border shadow-xl">
              {/* Anatomical Camera Views */}
              {(['A', 'P', 'R', 'L', 'S', 'I'] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => setAnatomicalView(view)}
                  className={`w-7 h-7 rounded text-xs font-bold font-mono transition-colors cursor-pointer ${
                    (view === 'A' && Math.abs(yaw) < 4 && Math.abs(pitch) < 4)
                      ? 'bg-cyan-600 text-white shadow-[0_0_8px_#06b6d4]'
                      : 'bg-radiant-panel/90 hover:bg-cyan-700/80 text-slate-200'
                  }`}
                  title={`View: ${view === 'A' ? 'Anterior (Front)' : view === 'P' ? 'Posterior (Back)' : view === 'R' ? 'Right Lateral' : view === 'L' ? 'Left Lateral' : view === 'S' ? 'Superior (Top)' : 'Inferior (Bottom)'}`}
                >
                  {view}
                </button>
              ))}

              <div className="w-px h-5 bg-slate-700 mx-0.5" />

              {/* Turn Left 15° */}
              <button
                onClick={() => setYaw(y => {
                  let n = y + 15;
                  return n > 180 ? n - 360 : n;
                })}
                className="w-7 h-7 bg-radiant-panel/90 hover:bg-cyan-700/80 text-cyan-300 rounded flex items-center justify-center transition-colors cursor-pointer"
                title="Turn Left"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              {/* Turn Right 15° */}
              <button
                onClick={() => setYaw(y => {
                  let n = y - 15;
                  return n < -180 ? n + 360 : n;
                })}
                className="w-7 h-7 bg-radiant-panel/90 hover:bg-cyan-700/80 text-cyan-300 rounded flex items-center justify-center transition-colors cursor-pointer"
                title="Turn Right"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>

              <div className="w-px h-5 bg-slate-700 mx-0.5" />

              {/* Zoom In */}
              <button
                onClick={() => setZoom(z => Math.min(8.0, z * 1.2))}
                className="w-7 h-7 bg-radiant-panel/90 hover:bg-cyan-700/80 text-emerald-300 rounded flex items-center justify-center transition-colors cursor-pointer"
                title="Zoom In (+20%)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>

              {/* Zoom Out */}
              <button
                onClick={() => setZoom(z => Math.max(0.3, z * 0.83))}
                className="w-7 h-7 bg-radiant-panel/90 hover:bg-cyan-700/80 text-emerald-300 rounded flex items-center justify-center transition-colors cursor-pointer"
                title="Zoom Out (-20%)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              {/* Reset Center */}
              <button
                onClick={() => {
                  setYaw(0);
                  setPitch(0);
                  setZoom(1.0);
                  setPan({ x: 0, y: 0 });
                }}
                className="px-2 h-7 bg-radiant-panel/90 hover:bg-cyan-700/80 text-slate-300 rounded flex items-center gap-1 text-[11px] font-semibold transition-colors cursor-pointer"
                title="Reset Camera Center & Zoom"
              >
                <Move className="w-3 h-3" />
                <span>Fit</span>
              </button>
            </div>

            {/* Navigation Badge (Bottom Left) */}
            <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg border border-radiant-border text-[11px] font-mono text-slate-300">
              <span>Rotate: Left Drag / Arrows</span> • <span>Zoom: Right Drag / Wheel</span> • <span>Pan: Mid Drag</span>
            </div>

            {/* Rotation Stats (Bottom Right) */}
            <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg border border-radiant-border text-[11px] font-mono text-cyan-300">
              Yaw: {Math.round(yaw)}° • Pitch: {Math.round(pitch)}° • Zoom: {Math.round(zoom * 100)}%
            </div>
          </div>

          {/* Right: Controls & Presets Panel */}
          <div className="w-80 bg-radiant-panel border-l border-radiant-border flex flex-col p-4 gap-4 overflow-y-auto">
            {/* 3D Camera & Orientation Sliders */}
            <div className="space-y-3">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
                  <span>3D Camera & Rotation</span>
                </div>
                <button
                  onClick={() => {
                    setYaw(0);
                    setPitch(0);
                    setZoom(1.0);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="text-[10px] text-cyan-400 hover:text-cyan-200 underline cursor-pointer"
                >
                  Reset
                </button>
              </div>

              {/* Horizontal Yaw Rotation */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Horizontal (Yaw):</span>
                  <span className="font-mono text-cyan-300 font-bold">{Math.round(yaw)}°</span>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="2"
                  value={Math.round(yaw)}
                  onChange={(e) => setYaw(parseInt(e.target.value, 10))}
                  className="w-full accent-cyan-500 bg-slate-800 rounded h-1.5 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <button onClick={() => setYaw(-90)} className="hover:text-cyan-300 cursor-pointer">-90° (Left)</button>
                  <button onClick={() => setYaw(0)} className="hover:text-cyan-300 cursor-pointer">0° (Front)</button>
                  <button onClick={() => setYaw(90)} className="hover:text-cyan-300 cursor-pointer">+90° (Right)</button>
                  <button onClick={() => setYaw(180)} className="hover:text-cyan-300 cursor-pointer">180° (Back)</button>
                </div>
              </div>

              {/* Vertical Pitch Tilt */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Vertical Tilt (Pitch):</span>
                  <span className="font-mono text-cyan-300 font-bold">{Math.round(pitch)}°</span>
                </div>
                <input
                  type="range"
                  min="-89"
                  max="89"
                  step="2"
                  value={Math.round(pitch)}
                  onChange={(e) => setPitch(parseInt(e.target.value, 10))}
                  className="w-full accent-cyan-500 bg-slate-800 rounded h-1.5 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <button onClick={() => setPitch(-85)} className="hover:text-cyan-300 cursor-pointer">-85° (Top)</button>
                  <button onClick={() => setPitch(0)} className="hover:text-cyan-300 cursor-pointer">0° (Level)</button>
                  <button onClick={() => setPitch(85)} className="hover:text-cyan-300 cursor-pointer">+85° (Bottom)</button>
                </div>
              </div>

              {/* Zoom Scale */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Scale / Zoom:</span>
                  <span className="font-mono text-cyan-300 font-bold">{Math.round(zoom * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="3.5"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-full accent-cyan-500 bg-slate-800 rounded h-1.5 cursor-pointer"
                />
              </div>
            </div>

            <div className="h-px bg-radiant-border" />
            {/* Presets */}
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Cinematic Medical Presets</span>
              </div>
              <div className="space-y-1.5">
                {VOLUME_3D_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPreset(p)}
                    className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all cursor-pointer ${
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
                  <span className="text-slate-400">Min Bone Threshold:</span>
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
                  <span className="text-slate-400">Max Density Window:</span>
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

            <div className="h-px bg-radiant-border" />

            {/* Cinematic Lighting & Shading Controls */}
            <div className="space-y-3">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <SunMedium className="w-3.5 h-3.5 text-amber-400" />
                <span>Cinematic Shading & Specular Gloss</span>
              </div>

              {/* Specular Power (Glossiness) */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Porcelain Specular Gloss:</span>
                  <span className="font-mono text-amber-300 font-bold">{specularPower}x</span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="128"
                  step="4"
                  value={specularPower}
                  onChange={(e) => setSpecularPower(parseInt(e.target.value, 10))}
                  className="w-full accent-amber-500 bg-slate-800 rounded h-1.5 cursor-pointer"
                />
              </div>

              {/* Specular Intensity (Highlight Brightness) */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Highlight Brightness:</span>
                  <span className="font-mono text-amber-300 font-bold">{Math.round(specularIntensity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.5"
                  step="0.05"
                  value={specularIntensity}
                  onChange={(e) => setSpecularIntensity(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 bg-slate-800 rounded h-1.5 cursor-pointer"
                />
              </div>

              {/* Ambient Occlusion Toggle */}
              <button
                onClick={() => setEnableAmbientOcclusion(!enableAmbientOcclusion)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                  enableAmbientOcclusion
                    ? 'bg-cyan-950/40 text-cyan-300 border-cyan-500/60 font-semibold'
                    : 'bg-radiant-darkest text-slate-400 border-radiant-border'
                }`}
              >
                <span>Deep Cavity Shadows (AO)</span>
                <span className={`w-3 h-3 rounded-full ${enableAmbientOcclusion ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]' : 'bg-slate-700'}`} />
              </button>

              {/* Ultra-HD Quality Toggle */}
              <button
                onClick={() => setUltraQuality(!ultraQuality)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                  ultraQuality
                    ? 'bg-amber-950/40 text-amber-300 border-amber-500/60 font-semibold'
                    : 'bg-radiant-darkest text-slate-400 border-radiant-border'
                }`}
              >
                <span>Ultra-HD Raymarching (450 Steps)</span>
                <span className={`w-3 h-3 rounded-full ${ultraQuality ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]' : 'bg-slate-700'}`} />
              </button>
            </div>

            <div className="h-px bg-radiant-border" />

            {/* Reset View Button */}
            <button
              onClick={() => {
                setYaw(0);
                setPitch(0);
                setZoom(1.0);
                setPan({ x: 0, y: 0 });
                setClipPlaneZ(1.0);
                setSpecularPower(64);
                setSpecularIntensity(0.75);
                handleSelectPreset(VOLUME_3D_PRESETS[0]);
              }}
              className="w-full flex items-center justify-center gap-2 py-2 bg-radiant-dark hover:bg-radiant-hover text-slate-300 rounded-lg border border-radiant-border text-xs transition-colors font-medium mt-auto cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset 3D Camera & Shaders</span>
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
  const cosY = Math.cos(radY), sinY = Math.sin(radY);
  const cosP = Math.cos(radP), sinP = Math.sin(radP);

  const size = 28;

  // Anatomical axes in volume space (LPS):
  // R: Right (-x_vol), A: Anterior (-y_vol), S: Superior / Head (-z_vol)
  const axes = [
    { label: 'R', vx: -1, vy: 0, vz: 0, color: '#f59e0b' },
    { label: 'A', vx: 0, vy: -1, vz: 0, color: '#38bdf8' },
    { label: 'S', vx: 0, vy: 0, vz: -1, color: '#10b981' }
  ];

  ctx.lineWidth = 2.5;

  for (const axis of axes) {
    // Project into camera screen via M^T:
    const camX = cosY * axis.vx - sinY * axis.vy;
    const camY = (sinY * sinP) * axis.vx + (cosY * sinP) * axis.vy - cosP * axis.vz;
    const camZ = (sinY * cosP) * axis.vx + (cosY * cosP) * axis.vy + sinP * axis.vz;

    const sx = cx + camX * size;
    const sy = cy - camY * size;

    ctx.strokeStyle = axis.color;
    ctx.globalAlpha = camZ >= -0.2 ? 1.0 : 0.45;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(sx, sy);
    ctx.stroke();

    ctx.fillStyle = axis.color;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(axis.label, sx + (camX >= 0 ? 5 : -14), sy + (camY >= 0 ? -4 : 14));
  }
  ctx.globalAlpha = 1.0;
}
