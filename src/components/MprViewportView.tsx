import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Layers,
  X,
  Sliders,
  Grid,
  Maximize2,
  Minimize2,
  RefreshCw,
  Eye,
  EyeOff,
  SunMedium,
  Ruler,
  Activity,
  RotateCcw,
  Sparkles,
  Move,
  ZoomIn
} from 'lucide-react';
import { DicomSeries, DicomStudy, MprPlane, Point2D } from '../types/dicom';
import { MprEngine, Volume3D, ProjectionMode } from '../services/mprEngine';
import { VolumeRaycaster, VOLUME_3D_PRESETS, Volume3dPreset } from '../services/volumeRaycaster';
import { DEFAULT_WINDOW_PRESETS } from '../services/windowPresets';

interface MprViewportViewProps {
  series: DicomSeries | null;
  study: DicomStudy | null;
  onClose: () => void;
}

type MprLayout = '3-view' | '2x2' | 'axial-only' | 'coronal-only' | 'sagittal-only' | '3d-only';

export const MprViewportView: React.FC<MprViewportViewProps> = ({
  series,
  study,
  onClose
}) => {
  const [volume, setVolume] = useState<Volume3D | null>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; z: number }>({ x: 128, y: 128, z: 12 });
  const [windowCenter, setWindowCenter] = useState<number>(40);
  const [windowWidth, setWindowWidth] = useState<number>(400);
  
  // Projection settings
  const [projectionMode, setProjectionMode] = useState<ProjectionMode>('none');
  const [slabThicknessMm, setSlabThicknessMm] = useState<number>(5.0);
  
  // UI Layout and tool settings
  const [layout, setLayout] = useState<MprLayout>('2x2');
  const [showCrosshairs, setShowCrosshairs] = useState<boolean>(true);
  const [activeTool, setActiveTool] = useState<'crosshair' | 'ww_wl' | 'pan' | 'zoom' | 'ruler' | 'hu_probe'>('crosshair');
  const [showPresetsMenu, setShowPresetsMenu] = useState<boolean>(false);

  // 3D Volume Rotation Angles
  const [yaw3D, setYaw3D] = useState<number>(25);
  const [pitch3D, setPitch3D] = useState<number>(-15);

  useEffect(() => {
    if (!series || series.instances.length < 2) return;
    const vol = MprEngine.buildVolume(series);
    if (vol) {
      setVolume(vol);
      setCrosshair({
        x: Math.floor(vol.dimX / 2),
        y: Math.floor(vol.dimY / 2),
        z: Math.floor(vol.dimZ / 2)
      });
      setWindowCenter(vol.windowCenter || 40);
      setWindowWidth(vol.windowWidth || 400);
      setSlabThicknessMm(Math.max(2.5, vol.spacingZ * 2));
    }
  }, [series]);

  const handleResetCrosshairs = () => {
    if (!volume) return;
    setCrosshair({
      x: Math.floor(volume.dimX / 2),
      y: Math.floor(volume.dimY / 2),
      z: Math.floor(volume.dimZ / 2)
    });
  };

  return (
    <div className="flex-1 flex flex-col w-full h-full bg-radiant-darkest select-none text-slate-100">
      {/* 1. MPR Top Header & Comprehensive Toolbar */}
      <div className="h-12 bg-radiant-panel border-b border-radiant-border flex items-center justify-between px-3 text-xs gap-2 overflow-x-auto">
        {/* Left: Branding & Patient Study */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-gradient-to-r from-cyan-600 to-blue-600 rounded font-bold text-white shadow-sm">
            <Layers className="w-4 h-4 text-cyan-200" />
            <span>3D / MPR Workstation</span>
          </div>

          <div className="hidden lg:flex items-center gap-2 text-slate-300 font-medium">
            <span className="text-cyan-400 font-semibold">{study?.patientName.replace(/\^/g, ' ')}</span>
            <span className="text-slate-500">•</span>
            <span className="text-amber-300">{series?.seriesDescription || series?.modality}</span>
            <span className="text-slate-500">•</span>
            <span className="font-mono text-slate-400 text-[11px]">{volume ? `${volume.dimX}x${volume.dimY}x${volume.dimZ} voxels` : ''}</span>
          </div>
        </div>

        {/* Center: Projection & View Tools */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Projection Selector */}
          <div className="flex items-center bg-radiant-darkest rounded-lg border border-radiant-border p-0.5">
            {(['none', 'mip', 'minip', 'avg'] as ProjectionMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setProjectionMode(mode)}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                  projectionMode === mode
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode === 'none' && 'Normal (MPR)'}
                {mode === 'mip' && 'MIP (Vessels/Bone)'}
                {mode === 'minip' && 'MinIP (Airways)'}
                {mode === 'avg' && 'Average (Thick)'}
              </button>
            ))}
          </div>

          {/* Slab Thickness (when projection active) */}
          {projectionMode !== 'none' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-radiant-darkest rounded border border-radiant-border text-[11px]">
              <span className="text-slate-400">Slab:</span>
              <input
                type="range"
                min="2.5"
                max="40"
                step="2.5"
                value={slabThicknessMm}
                onChange={(e) => setSlabThicknessMm(parseFloat(e.target.value))}
                className="w-16 accent-cyan-500 cursor-pointer"
              />
              <span className="font-mono text-cyan-300 font-bold">{slabThicknessMm.toFixed(1)} mm</span>
            </div>
          )}

          {/* Crosshair Visibility Toggle */}
          <button
            onClick={() => setShowCrosshairs(!showCrosshairs)}
            title={showCrosshairs ? 'Hide 3D Reference Crosshairs' : 'Show 3D Reference Crosshairs'}
            className={`p-1.5 rounded border text-xs flex items-center gap-1 ${
              showCrosshairs
                ? 'bg-cyan-950/60 text-cyan-300 border-cyan-500/60'
                : 'bg-radiant-darkest text-slate-400 border-radiant-border'
            }`}
          >
            {showCrosshairs ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Crosshairs</span>
          </button>

          {/* Center Crosshair */}
          <button
            onClick={handleResetCrosshairs}
            title="Reset Crosshair to Center"
            className="p-1.5 bg-radiant-darkest hover:bg-radiant-hover text-slate-300 rounded border border-radiant-border text-xs flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Center</span>
          </button>

          {/* Tool Selector */}
          <div className="flex items-center bg-radiant-darkest rounded-lg border border-radiant-border p-0.5">
            <button
              onClick={() => setActiveTool('crosshair')}
              title="3D Crosshair Navigation"
              className={`p-1 rounded ${activeTool === 'crosshair' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Move className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setActiveTool('ww_wl')}
              title="Window Center / Width Adjustment"
              className={`p-1 rounded ${activeTool === 'ww_wl' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <SunMedium className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setActiveTool('ruler')}
              title="Distance Ruler (mm)"
              className={`p-1 rounded ${activeTool === 'ruler' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Ruler className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setActiveTool('hu_probe')}
              title="Live HU Probe"
              className={`p-1 rounded ${activeTool === 'hu_probe' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Window Presets Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowPresetsMenu(!showPresetsMenu)}
              className="flex items-center gap-1 px-2.5 py-1 bg-radiant-darkest hover:bg-radiant-hover text-slate-300 rounded border border-radiant-border text-[11px]"
            >
              <SunMedium className="w-3.5 h-3.5 text-amber-400" />
              <span>WL: {windowCenter} WW: {windowWidth}</span>
            </button>

            {showPresetsMenu && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-radiant-panel border border-radiant-border rounded-lg shadow-2xl py-1 z-50 text-xs">
                {DEFAULT_WINDOW_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setWindowCenter(p.windowCenter);
                      setWindowWidth(p.windowWidth);
                      setShowPresetsMenu(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center justify-between text-slate-200"
                  >
                    <span>{p.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">[{p.shortcut}]</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Layout Switcher */}
          <div className="flex items-center bg-radiant-darkest rounded-lg border border-radiant-border p-0.5">
            <button
              onClick={() => setLayout('2x2')}
              title="2x2 Quad View (Axial + Coronal + Sagittal + 3D Volume)"
              className={`px-2 py-1 rounded text-[11px] font-semibold ${layout === '2x2' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              2x2 Quad
            </button>
            <button
              onClick={() => setLayout('3-view')}
              title="3-View Horizontal Layout"
              className={`px-2 py-1 rounded text-[11px] font-semibold ${layout === '3-view' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              1x3 Tri
            </button>
          </div>
        </div>

        {/* Right: Close Button */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={onClose}
            title="Exit MPR View"
            className="flex items-center gap-1 px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/40 rounded transition-colors font-bold text-xs"
          >
            <X className="w-4 h-4" />
            <span>Close MPR</span>
          </button>
        </div>
      </div>

      {/* 2. Central Multi-Planar Viewport Grid */}
      <div
        className={`flex-1 grid gap-1 p-1 bg-black overflow-hidden ${
          layout === '2x2'
            ? 'grid-cols-2 grid-rows-2'
            : layout === '3-view'
            ? 'grid-cols-3 grid-rows-1'
            : 'grid-cols-1 grid-rows-1'
        }`}
      >
        {/* Viewport 1: Axial (Transverse) */}
        {(layout === '2x2' || layout === '3-view' || layout === 'axial-only') && (
          <MprSingleViewport
            plane="axial"
            title="Axial (Transverse)"
            labelColor="text-cyan-400"
            lineColor="#38bdf8"
            volume={volume}
            crosshair={crosshair}
            showCrosshairs={showCrosshairs}
            windowCenter={windowCenter}
            windowWidth={windowWidth}
            projectionMode={projectionMode}
            slabThicknessMm={slabThicknessMm}
            activeTool={activeTool}
            onUpdateCrosshair={setCrosshair}
            onUpdateWindowing={(wc, ww) => {
              setWindowCenter(wc);
              setWindowWidth(ww);
            }}
            onToggleMaximize={() => setLayout(layout === 'axial-only' ? '2x2' : 'axial-only')}
            isMaximized={layout === 'axial-only'}
          />
        )}

        {/* Viewport 2: Coronal (Frontal) */}
        {(layout === '2x2' || layout === '3-view' || layout === 'coronal-only') && (
          <MprSingleViewport
            plane="coronal"
            title="Coronal (Frontal)"
            labelColor="text-amber-400"
            lineColor="#f59e0b"
            volume={volume}
            crosshair={crosshair}
            showCrosshairs={showCrosshairs}
            windowCenter={windowCenter}
            windowWidth={windowWidth}
            projectionMode={projectionMode}
            slabThicknessMm={slabThicknessMm}
            activeTool={activeTool}
            onUpdateCrosshair={setCrosshair}
            onUpdateWindowing={(wc, ww) => {
              setWindowCenter(wc);
              setWindowWidth(ww);
            }}
            onToggleMaximize={() => setLayout(layout === 'coronal-only' ? '2x2' : 'coronal-only')}
            isMaximized={layout === 'coronal-only'}
          />
        )}

        {/* Viewport 3: Sagittal (Lateral) */}
        {(layout === '2x2' || layout === '3-view' || layout === 'sagittal-only') && (
          <MprSingleViewport
            plane="sagittal"
            title="Sagittal (Lateral)"
            labelColor="text-emerald-400"
            lineColor="#10b981"
            volume={volume}
            crosshair={crosshair}
            showCrosshairs={showCrosshairs}
            windowCenter={windowCenter}
            windowWidth={windowWidth}
            projectionMode={projectionMode}
            slabThicknessMm={slabThicknessMm}
            activeTool={activeTool}
            onUpdateCrosshair={setCrosshair}
            onUpdateWindowing={(wc, ww) => {
              setWindowCenter(wc);
              setWindowWidth(ww);
            }}
            onToggleMaximize={() => setLayout(layout === 'sagittal-only' ? '2x2' : 'sagittal-only')}
            isMaximized={layout === 'sagittal-only'}
          />
        )}

        {/* Viewport 4: 3D Volume Raymarching & Cut Plane Preview */}
        {(layout === '2x2' || layout === '3d-only') && (
          <Mpr3dVolumeViewport
            volume={volume}
            crosshair={crosshair}
            yaw={yaw3D}
            pitch={pitch3D}
            onUpdateRotation={(yaw, pitch) => {
              setYaw3D(yaw);
              setPitch3D(pitch);
            }}
            onToggleMaximize={() => setLayout(layout === '3d-only' ? '2x2' : '3d-only')}
            isMaximized={layout === '3d-only'}
          />
        )}
      </div>
    </div>
  );
};

interface MprSingleViewportProps {
  plane: MprPlane;
  title: string;
  labelColor: string;
  lineColor: string;
  volume: Volume3D | null;
  crosshair: { x: number; y: number; z: number };
  showCrosshairs: boolean;
  windowCenter: number;
  windowWidth: number;
  projectionMode: ProjectionMode;
  slabThicknessMm: number;
  activeTool: 'crosshair' | 'ww_wl' | 'pan' | 'zoom' | 'ruler' | 'hu_probe';
  onUpdateCrosshair: React.Dispatch<React.SetStateAction<{ x: number; y: number; z: number }>>;
  onUpdateWindowing: (wc: number, ww: number) => void;
  onToggleMaximize: () => void;
  isMaximized: boolean;
}

const MprSingleViewport: React.FC<MprSingleViewportProps> = ({
  plane,
  title,
  labelColor,
  lineColor,
  volume,
  crosshair,
  showCrosshairs,
  windowCenter,
  windowWidth,
  projectionMode,
  slabThicknessMm,
  activeTool,
  onUpdateCrosshair,
  onUpdateWindowing,
  onToggleMaximize,
  isMaximized
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragBtn, setDragBtn] = useState<number>(0);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initWc, setInitWc] = useState(windowCenter);
  const [initWw, setInitWw] = useState(windowWidth);

  // Pan & Zoom per MPR viewport
  const [pan, setPan] = useState<Point2D>({ x: 0, y: 0 });
  const [initPan, setInitPan] = useState<Point2D>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1.0);
  const [initZoom, setInitZoom] = useState<number>(1.0);

  // Distance Measurement ruler points
  const [rulerPoints, setRulerPoints] = useState<Point2D[]>([]);
  const [mouseCoord, setMouseCoord] = useState<{ x: number; y: number; hu: number | null }>({ x: 0, y: 0, hu: null });

  // Render high-precision slice with aspect ratio correction
  const renderMpr = useCallback(() => {
    if (!canvasRef.current || !volume || !containerRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const slice = MprEngine.getSlice(volume, plane, crosshair, projectionMode, slabThicknessMm);
    const { width, height, huData, scaleY } = slice;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;
    const numPixels = width * height;

    const wc = windowCenter;
    const ww = Math.max(1, windowWidth);
    const low = wc - 0.5 - (ww - 1) / 2;
    const high = wc - 0.5 + (ww - 1) / 2;

    for (let i = 0; i < numPixels; i++) {
      const val = huData[i];
      let gray: number;

      if (val <= low) gray = 0;
      else if (val > high) gray = 255;
      else gray = Math.round(((val - low) / ww) * 255);

      const pIdx = i * 4;
      data[pIdx] = gray;
      data[pIdx + 1] = gray;
      data[pIdx + 2] = gray;
      data[pIdx + 3] = 255;
    }

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = containerRef.current.clientWidth;
    const displayHeight = containerRef.current.clientHeight;

    if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    // Compute aspect-corrected fit scale
    const visualHeight = height * scaleY;
    const fitScale = Math.min(displayWidth / width, displayHeight / visualHeight) * zoom;
    const cx = displayWidth / 2 + pan.x;
    const cy = displayHeight / 2 + pan.y;

    ctx.translate(cx, cy);
    ctx.scale(fitScale, fitScale * scaleY);

    if (!tempCanvasRef.current) {
      tempCanvasRef.current = document.createElement('canvas');
    }
    const tempCanvas = tempCanvasRef.current;
    if (tempCanvas.width !== width || tempCanvas.height !== height) {
      tempCanvas.width = width;
      tempCanvas.height = height;
    }
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.putImageData(imgData, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
      ctx.drawImage(tempCanvas, -width / 2, -height / 2);
    }

    // Unscale for crosshair line drawing
    ctx.scale(1, 1 / scaleY);

    // Draw 3D Crosshairs
    if (showCrosshairs) {
      let chX = 0;
      let chY = 0;

      if (plane === 'axial') {
        chX = crosshair.x - width / 2;
        chY = (crosshair.y - height / 2) * scaleY;
      } else if (plane === 'coronal') {
        chX = crosshair.x - width / 2;
        chY = ((volume.dimZ - 1 - crosshair.z) - height / 2) * scaleY;
      } else {
        chX = crosshair.y - width / 2;
        chY = ((volume.dimZ - 1 - crosshair.z) - height / 2) * scaleY;
      }

      ctx.lineWidth = 1.2 / fitScale;
      ctx.strokeStyle = lineColor;
      ctx.setLineDash([4 / fitScale, 4 / fitScale]);

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(chX, (-height / 2) * scaleY);
      ctx.lineTo(chX, (height / 2) * scaleY);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(-width / 2, chY);
      ctx.lineTo(width / 2, chY);
      ctx.stroke();

      // Central Hub
      ctx.setLineDash([]);
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(chX, chY, 3.5 / fitScale, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Draw active ruler measurements
    if (rulerPoints.length >= 2) {
      ctx.lineWidth = 1.5 / fitScale;
      ctx.strokeStyle = '#38bdf8';
      ctx.fillStyle = '#38bdf8';

      const p1 = rulerPoints[0];
      const p2 = rulerPoints[1];

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y * scaleY);
      ctx.lineTo(p2.x, p2.y * scaleY);
      ctx.stroke();

      const dx = (p2.x - p1.x) * slice.pixelSpacing[1];
      const dy = (p2.y - p1.y) * slice.pixelSpacing[0];
      const distMm = Math.sqrt(dx * dx + dy * dy);

      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillText(`${distMm.toFixed(1)} mm`, (p1.x + p2.x) / 2 + 6, ((p1.y + p2.y) / 2) * scaleY - 6);
    }

    ctx.restore();
  }, [volume, plane, crosshair, projectionMode, slabThicknessMm, windowCenter, windowWidth, showCrosshairs, lineColor, pan, zoom, rulerPoints]);

  useEffect(() => {
    renderMpr();
  }, [renderMpr]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragBtn(e.button);
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitWc(windowCenter);
    setInitWw(windowWidth);
    setInitPan({ ...pan });
    setInitZoom(zoom);

    if (e.button === 0) {
      if (activeTool === 'crosshair' || e.shiftKey) {
        updateCrosshairFromMouse(e.clientX, e.clientY);
      } else if (activeTool === 'ruler') {
        const pt = screenToVolumeCoord(e.clientX, e.clientY);
        if (pt) setRulerPoints([pt, pt]);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pt = screenToVolumeCoord(e.clientX, e.clientY);
    if (pt && volume) {
      const slice = MprEngine.getSlice(volume, plane, crosshair, projectionMode, slabThicknessMm);
      const ix = Math.floor(pt.x + slice.width / 2);
      const iy = Math.floor(pt.y + slice.height / 2);
      let huVal: number | null = null;
      if (ix >= 0 && ix < slice.width && iy >= 0 && iy < slice.height) {
        huVal = slice.huData[iy * slice.width + ix];
      }
      setMouseCoord({ x: Math.round(pt.x), y: Math.round(pt.y), hu: huVal });
    }

    if (!isDragging) return;

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    if (dragBtn === 2 || (dragBtn === 0 && activeTool === 'ww_wl')) {
      // Right drag: Window Center / Width
      onUpdateWindowing(
        Math.round(initWc - dy * 2),
        Math.max(1, Math.round(initWw + dx * 2))
      );
    } else if (dragBtn === 1 || (dragBtn === 0 && activeTool === 'pan')) {
      // Middle drag: Pan
      setPan({ x: initPan.x + dx, y: initPan.y + dy });
    } else if (dragBtn === 0 && activeTool === 'zoom') {
      // Zoom
      const factor = Math.exp(-dy * 0.01);
      setZoom(Math.max(0.3, Math.min(10, initZoom * factor)));
    } else if (dragBtn === 0 && activeTool === 'crosshair') {
      updateCrosshairFromMouse(e.clientX, e.clientY);
    } else if (dragBtn === 0 && activeTool === 'ruler' && rulerPoints.length > 0) {
      if (pt) setRulerPoints([rulerPoints[0], pt]);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!volume) return;
    const delta = e.deltaY > 0 ? 1 : -1;

    onUpdateCrosshair(prev => {
      if (plane === 'axial') {
        return { ...prev, z: Math.max(0, Math.min(volume.dimZ - 1, prev.z + delta)) };
      } else if (plane === 'coronal') {
        return { ...prev, y: Math.max(0, Math.min(volume.dimY - 1, prev.y + delta)) };
      } else {
        return { ...prev, x: Math.max(0, Math.min(volume.dimX - 1, prev.x + delta)) };
      }
    });
  };

  const screenToVolumeCoord = (clientX: number, clientY: number): Point2D | null => {
    if (!canvasRef.current || !volume || !containerRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const slice = MprEngine.getSlice(volume, plane, crosshair, projectionMode, slabThicknessMm);

    const visualHeight = slice.height * slice.scaleY;
    const fitScale = Math.min(rect.width / slice.width, rect.height / visualHeight) * zoom;

    const relX = (clientX - rect.left - rect.width / 2 - pan.x) / fitScale;
    const relY = (clientY - rect.top - rect.height / 2 - pan.y) / (fitScale * slice.scaleY);

    return { x: relX, y: relY };
  };

  const updateCrosshairFromMouse = (clientX: number, clientY: number) => {
    if (!canvasRef.current || !volume) return;
    const slice = MprEngine.getSlice(volume, plane, crosshair, projectionMode, slabThicknessMm);
    const pt = screenToVolumeCoord(clientX, clientY);
    if (!pt) return;

    const clampedX = Math.max(0, Math.min(slice.width - 1, Math.round(pt.x + slice.width / 2)));
    const clampedY = Math.max(0, Math.min(slice.height - 1, Math.round(pt.y + slice.height / 2)));

    onUpdateCrosshair(prev => {
      if (plane === 'axial') {
        return { ...prev, x: clampedX, y: clampedY };
      } else if (plane === 'coronal') {
        return { ...prev, x: clampedX, z: volume.dimZ - 1 - clampedY };
      } else {
        return { ...prev, y: clampedX, z: volume.dimZ - 1 - clampedY };
      }
    });
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
      className="relative w-full h-full bg-black border border-radiant-border overflow-hidden select-none cursor-crosshair group"
    >
      <canvas ref={canvasRef} className="w-full h-full" />

      {/* Top-Left: Plane Badge & Anatomical Directions */}
      <div className="absolute top-2.5 left-3 radiant-overlay-text flex items-center gap-2">
        <span className={`font-bold text-xs ${labelColor} flex items-center gap-1.5`}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: lineColor }}></span>
          <span>{title}</span>
        </span>
        {projectionMode !== 'none' && (
          <span className="px-1.5 py-0.2 bg-purple-900/70 text-purple-300 rounded text-[10px] font-bold uppercase border border-purple-500/40">
            {projectionMode} ({slabThicknessMm.toFixed(1)}mm)
          </span>
        )}
      </div>

      {/* Top-Right: Maximize Button & HU Probe */}
      <div className="absolute top-2.5 right-3 radiant-overlay-text flex items-center gap-2">
        {mouseCoord.hu !== null && (
          <span className="text-rose-400 font-mono font-bold text-[11px] bg-black/60 px-1.5 py-0.5 rounded">
            {mouseCoord.hu} HU
          </span>
        )}
        <button
          onClick={onToggleMaximize}
          className="p-1 bg-radiant-panel/80 hover:bg-radiant-hover text-slate-300 rounded border border-radiant-border opacity-0 group-hover:opacity-100 transition-opacity"
          title={isMaximized ? 'Restore 2x2' : 'Maximize'}
        >
          {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Bottom-Left: Anatomical Navigation Guide */}
      <div className="absolute bottom-2.5 left-3 radiant-overlay-text text-[10.5px] text-slate-400 font-mono">
        <div>Zoom: {Math.round(zoom * 100)}%</div>
      </div>

      {/* Bottom-Right: Slice Location & Index */}
      <div className="absolute bottom-2.5 right-3 radiant-overlay-text text-[11px] text-cyan-300 font-mono font-bold">
        {plane === 'axial' && `Z: ${crosshair.z + 1} / ${volume?.dimZ || 1}`}
        {plane === 'coronal' && `Y: ${crosshair.y + 1} / ${volume?.dimY || 1}`}
        {plane === 'sagittal' && `X: ${crosshair.x + 1} / ${volume?.dimX || 1}`}
      </div>
    </div>
  );
};

/**
 * Enhanced Photorealistic 3D Raymarched Volume Render & Orientation Scout Viewport
 * Features Studio Specular Lighting, Trilinear Interpolation, 3D MPR Slice Cut Planes, and Presets.
 */
interface Mpr3dVolumeViewportProps {
  volume: Volume3D | null;
  crosshair: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  onUpdateRotation: (yaw: number, pitch: number) => void;
  onToggleMaximize: () => void;
  isMaximized: boolean;
}

const Mpr3dVolumeViewport: React.FC<Mpr3dVolumeViewportProps> = ({
  volume,
  crosshair,
  yaw,
  pitch,
  onUpdateRotation,
  onToggleMaximize,
  isMaximized
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedPreset, setSelectedPreset] = useState<Volume3dPreset>(VOLUME_3D_PRESETS[0]); // Bone default
  const [showPresetsMenu, setShowPresetsMenu] = useState(false);
  const [showCutPlanes, setShowCutPlanes] = useState(true);

  // 3D Pan & Zoom
  const [zoom3D, setZoom3D] = useState(1.0);
  const [pan3D, setPan3D] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [isDragging, setIsDragging] = useState(false);
  const [dragBtn, setDragBtn] = useState<number>(0);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initYaw, setInitYaw] = useState(yaw);
  const [initPitch, setInitPitch] = useState(pitch);
  const [initPan, setInitPan] = useState({ x: 0, y: 0 });

  // Debounced High Quality Render Timer
  const [renderQuality, setRenderQuality] = useState<'fast' | 'high'>('high');

  // Cached Offscreen Raymarch Canvas
  const cachedRaymarchCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // 1. Raymarch rendering (runs ONLY when 3D orientation, zoom, pan, preset, or quality changes)
  const updateRaymarchBuffer = useCallback(() => {
    if (!volume || !containerRef.current) return;
    const displayWidth = containerRef.current.clientWidth;
    const displayHeight = containerRef.current.clientHeight;
    if (displayWidth <= 0 || displayHeight <= 0) return;

    const renderRes = renderQuality === 'fast' ? 140 : Math.min(260, Math.floor(Math.min(displayWidth, displayHeight)));

    const imgData = VolumeRaycaster.render(volume, renderRes, renderRes, {
      yawDeg: yaw,
      pitchDeg: pitch,
      zoom: zoom3D,
      panX: (pan3D.x / displayWidth) * renderRes,
      panY: (pan3D.y / displayHeight) * renderRes,
      preset: selectedPreset,
      quality: renderQuality === 'fast' ? 'fast' : 'high',
      enableAmbientOcclusion: false
    });

    if (!cachedRaymarchCanvasRef.current) {
      cachedRaymarchCanvasRef.current = document.createElement('canvas');
    }
    const cCanvas = cachedRaymarchCanvasRef.current;
    if (cCanvas.width !== renderRes || cCanvas.height !== renderRes) {
      cCanvas.width = renderRes;
      cCanvas.height = renderRes;
    }
    const cCtx = cCanvas.getContext('2d');
    if (cCtx) {
      cCtx.putImageData(imgData, 0, 0);
    }
  }, [volume, yaw, pitch, zoom3D, pan3D, selectedPreset, renderQuality]);

  // 2. Fast Compositor (draws cached 3D volume + vector 3D cut planes in < 0.02ms)
  const render3d = useCallback(() => {
    if (!canvasRef.current || !volume || !containerRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const displayWidth = containerRef.current.clientWidth;
    const displayHeight = containerRef.current.clientHeight;
    if (displayWidth <= 0 || displayHeight <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    if (cachedRaymarchCanvasRef.current) {
      const minDim = Math.min(displayWidth, displayHeight);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
      ctx.drawImage(
        cachedRaymarchCanvasRef.current,
        displayWidth / 2 + pan3D.x - minDim / 2,
        displayHeight / 2 + pan3D.y - minDim / 2,
        minDim,
        minDim
      );
    }

    // Draw 3D Crosshair Cut Planes in perspective space (< 0.01ms)
    if (showCutPlanes) {
      draw3dCutPlanes(ctx, displayWidth, displayHeight, volume, crosshair, yaw, pitch, zoom3D, pan3D);
    }

    // 3D Orientation Cube
    draw3dOrientationCube(ctx, displayWidth - 42, 42, yaw, pitch);

    ctx.restore();
  }, [volume, crosshair, zoom3D, pan3D, showCutPlanes, yaw, pitch]);

  useEffect(() => {
    updateRaymarchBuffer();
    render3d();
  }, [updateRaymarchBuffer]);

  useEffect(() => {
    render3d();
  }, [render3d]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragBtn(e.button);
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitYaw(yaw);
    setInitPitch(pitch);
    setInitPan({ ...pan3D });
    setRenderQuality('fast');
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    if (dragBtn === 0 && !e.ctrlKey) {
      // Left Drag: Rotate Yaw & Pitch
      onUpdateRotation((initYaw + dx * 0.7) % 360, Math.max(-85, Math.min(85, initPitch + dy * 0.7)));
    } else if (dragBtn === 2 || (dragBtn === 0 && e.ctrlKey)) {
      // Right Drag or Ctrl+Left Drag: Pan in 3D
      setPan3D({
        x: initPan.x + dx,
        y: initPan.y + dy
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    // Switch to High Quality on release
    setRenderQuality('high');
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom3D((prev) => Math.max(0.4, Math.min(4.0, prev * factor)));
  };

  const handleResetView = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateRotation(25, -15);
    setZoom3D(1.0);
    setPan3D({ x: 0, y: 0 });
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
      className="relative w-full h-full bg-radiant-darkest border border-radiant-border overflow-hidden select-none cursor-grab active:cursor-grabbing group"
    >
      <canvas ref={canvasRef} className="w-full h-full" />

      {/* Top-Left Header: 3D Scout Title + Preset Selector */}
      <div className="absolute top-2.5 left-3 radiant-overlay-text flex items-center gap-2">
        <div className="flex items-center gap-1.5 font-bold text-xs text-cyan-300">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span>3D Volume Scout</span>
        </div>

        {/* 3D Shading Preset Dropdown */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowPresetsMenu(!showPresetsMenu);
            }}
            className="px-2 py-0.5 bg-black/60 hover:bg-slate-800 text-amber-300 rounded border border-amber-500/40 text-[10.5px] font-semibold flex items-center gap-1"
          >
            <span>{selectedPreset.name.split(' ')[1] || 'Preset'}</span>
            <span className="text-[8px] text-slate-400">▾</span>
          </button>

          {showPresetsMenu && (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute left-0 top-full mt-1 w-48 bg-radiant-panel border border-radiant-border rounded-xl shadow-2xl p-1 z-50 text-xs space-y-0.5"
            >
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 border-b border-radiant-border">
                3D Rendering Preset
              </div>
              {VOLUME_3D_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setSelectedPreset(p);
                    setShowPresetsMenu(false);
                  }}
                  className={`w-full px-2 py-1.5 text-left rounded hover:bg-radiant-hover flex items-center justify-between text-[11px] ${
                    selectedPreset.id === p.id ? 'text-amber-300 font-bold bg-amber-950/40' : 'text-slate-200'
                  }`}
                >
                  <span>{p.name}</span>
                  {selectedPreset.id === p.id && <span className="text-amber-400">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Toggle 3D Cut Planes Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowCutPlanes(!showCutPlanes);
          }}
          className={`px-1.5 py-0.5 rounded border text-[10px] font-medium transition-colors ${
            showCutPlanes
              ? 'bg-cyan-900/40 border-cyan-400/80 text-cyan-300'
              : 'bg-black/40 border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle 3D MPR Crosshair Intersection Planes"
        >
          {showCutPlanes ? 'Planes: ON' : 'Planes: OFF'}
        </button>
      </div>

      {/* Top-Right: Reset View & Maximize Buttons */}
      <div className="absolute top-2.5 right-3 radiant-overlay-text flex items-center gap-1.5">
        <button
          onClick={handleResetView}
          className="p-1 bg-radiant-panel/80 hover:bg-radiant-hover text-slate-300 rounded border border-radiant-border opacity-0 group-hover:opacity-100 transition-opacity"
          title="Reset 3D Rotation & Zoom"
        >
          <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
        </button>

        <button
          onClick={onToggleMaximize}
          className="p-1 bg-radiant-panel/80 hover:bg-radiant-hover text-slate-300 rounded border border-radiant-border opacity-0 group-hover:opacity-100 transition-opacity"
          title={isMaximized ? 'Restore 2x2' : 'Maximize'}
        >
          {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Bottom Overlay Info */}
      <div className="absolute bottom-2.5 left-3 radiant-overlay-text text-[10px] text-slate-400 flex items-center gap-3 font-mono">
        <span>Yaw: {Math.round(yaw)}° • Pitch: {Math.round(pitch)}°</span>
        <span>Zoom: {Math.round(zoom3D * 100)}%</span>
      </div>

      <div className="absolute bottom-2.5 right-3 radiant-overlay-text text-[9.5px] text-slate-500 font-mono hidden sm:block">
        Left-drag: Rotate • Right-drag: Pan • Wheel: Zoom
      </div>
    </div>
  );
};

/**
 * Superimpose 3D Orthogonal Cut Planes (Axial, Coronal, Sagittal) in perspective 3D space
 */
function draw3dCutPlanes(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  volume: Volume3D,
  crosshair: { x: number; y: number; z: number },
  yawDeg: number,
  pitchDeg: number,
  zoom: number,
  pan: { x: number; y: number }
) {
  const { dimX, dimY, dimZ, spacingX, spacingY, spacingZ } = volume;
  const physX = dimX * spacingX;
  const physY = dimY * spacingY;
  const physZ = dimZ * spacingZ;
  const maxPhys = Math.max(physX, physY, physZ);
  const minDim = Math.min(width, height);

  const radY = (yawDeg * Math.PI) / 180;
  const radP = (pitchDeg * Math.PI) / 180;
  const cosY = Math.cos(radY), sinY = Math.sin(radY);
  const cosP = Math.cos(radP), sinP = Math.sin(radP);

  const projectPoint = (vx: number, vy: number, vz: number) => {
    const px = vx * spacingX - physX / 2;
    const py = vy * spacingY - physY / 2;
    const pz = vz * spacingZ - physZ / 2;

    const rx1 = px * cosY - pz * sinY;
    const rz1 = px * sinY + pz * cosY;
    const ry = py * cosP - rz1 * sinP;

    const sx = width / 2 + pan.x + (rx1 / maxPhys) * minDim * zoom;
    const sy = height / 2 + pan.y + (ry / maxPhys) * minDim * zoom;
    return { x: sx, y: sy };
  };

  const drawQuad = (p0: any, p1: any, p2: any, p3: any, strokeColor: string, fillColor: string) => {
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  };

  // 1. Axial Cut Plane (Cyan Z-Plane)
  const cz = Math.max(0, Math.min(dimZ - 1, crosshair.z));
  const a0 = projectPoint(0, 0, cz);
  const a1 = projectPoint(dimX - 1, 0, cz);
  const a2 = projectPoint(dimX - 1, dimY - 1, cz);
  const a3 = projectPoint(0, dimY - 1, cz);
  drawQuad(a0, a1, a2, a3, '#38bdf8', 'rgba(56, 189, 248, 0.12)');

  // 2. Coronal Cut Plane (Emerald Y-Plane)
  const cy = Math.max(0, Math.min(dimY - 1, crosshair.y));
  const c0 = projectPoint(0, cy, 0);
  const c1 = projectPoint(dimX - 1, cy, 0);
  const c2 = projectPoint(dimX - 1, cy, dimZ - 1);
  const c3 = projectPoint(0, cy, dimZ - 1);
  drawQuad(c0, c1, c2, c3, '#10b981', 'rgba(16, 185, 129, 0.12)');

  // 3. Sagittal Cut Plane (Amber X-Plane)
  const cx = Math.max(0, Math.min(dimX - 1, crosshair.x));
  const s0 = projectPoint(cx, 0, 0);
  const s1 = projectPoint(cx, dimY - 1, 0);
  const s2 = projectPoint(cx, dimY - 1, dimZ - 1);
  const s3 = projectPoint(cx, 0, dimZ - 1);
  drawQuad(s0, s1, s2, s3, '#f59e0b', 'rgba(245, 158, 11, 0.12)');
}

/**
 * 3D Anatomical Orientation Compass Cube
 */
function draw3dOrientationCube(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  yawDeg: number,
  pitchDeg: number
) {
  const radY = (yawDeg * Math.PI) / 180;
  const radP = (pitchDeg * Math.PI) / 180;

  const size = 18;

  const axes = [
    { label: 'R', x: size, y: 0, z: 0, color: '#f59e0b' },
    { label: 'A', x: 0, y: size, z: 0, color: '#38bdf8' },
    { label: 'S', x: 0, y: 0, z: size, color: '#10b981' }
  ];

  ctx.lineWidth = 1.8;

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
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText(axis.label, cx + rx1 * 1.3 - 3, cy + ry * 1.3 + 3);
  }
}
