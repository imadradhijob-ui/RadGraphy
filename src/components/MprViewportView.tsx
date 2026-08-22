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

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.putImageData(imgData, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
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
 * 3D Raymarched Volume Render & Orientation Scout Viewport
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
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initYaw, setInitYaw] = useState(yaw);
  const [initPitch, setInitPitch] = useState(pitch);

  const render3d = useCallback(() => {
    if (!canvasRef.current || !volume || !containerRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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

    // Fast 3D Raymarch Render
    const imgData = MprEngine.render3dVolumeMIP(volume, yaw, pitch, 180, 180);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 180;
    tempCanvas.height = 180;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.putImageData(imgData, 0, 0);
      const scale = Math.min(displayWidth, displayHeight) / 180 * 0.9;
      ctx.drawImage(
        tempCanvas,
        displayWidth / 2 - (180 * scale) / 2,
        displayHeight / 2 - (180 * scale) / 2,
        180 * scale,
        180 * scale
      );
    }

    // 3D Anatomical Orientation Compass Cube in corner
    draw3dOrientationCube(ctx, displayWidth - 45, 45, yaw, pitch);

    ctx.restore();
  }, [volume, yaw, pitch, crosshair]);

  useEffect(() => {
    render3d();
  }, [render3d]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitYaw(yaw);
    setInitPitch(pitch);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    onUpdateRotation((initYaw + dx * 0.8) % 360, Math.max(-85, Math.min(85, initPitch + dy * 0.8)));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="relative w-full h-full bg-radiant-darkest border border-radiant-border overflow-hidden select-none cursor-grab active:cursor-grabbing group"
    >
      <canvas ref={canvasRef} className="w-full h-full" />

      {/* Header */}
      <div className="absolute top-2.5 left-3 radiant-overlay-text flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
        <span className="font-bold text-xs text-cyan-300">3D Volume Scout / Raymarching</span>
      </div>

      <div className="absolute top-2.5 right-3 radiant-overlay-text">
        <button
          onClick={onToggleMaximize}
          className="p-1 bg-radiant-panel/80 hover:bg-radiant-hover text-slate-300 rounded border border-radiant-border opacity-0 group-hover:opacity-100 transition-opacity"
          title={isMaximized ? 'Restore 2x2' : 'Maximize'}
        >
          {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className="absolute bottom-2.5 left-3 radiant-overlay-text text-[10px] text-slate-400">
        Drag to rotate 3D Volume (Yaw: {Math.round(yaw)}°, Pitch: {Math.round(pitch)}°)
      </div>
    </div>
  );
};

function draw3dOrientationCube(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  yawDeg: number,
  pitchDeg: number
) {
  const radY = (yawDeg * Math.PI) / 180;
  const radP = (pitchDeg * Math.PI) / 180;

  const size = 20;

  const axes = [
    { label: 'R', x: size, y: 0, z: 0, color: '#f59e0b' },
    { label: 'A', x: 0, y: size, z: 0, color: '#38bdf8' },
    { label: 'S', x: 0, y: 0, z: size, color: '#10b981' }
  ];

  ctx.lineWidth = 2;

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
    ctx.font = 'bold 9.5px sans-serif';
    ctx.fillText(axis.label, cx + rx1 * 1.25 - 3, cy + ry * 1.25 + 3);
  }
}
