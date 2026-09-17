import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Sparkles,
  Move,
  ZoomIn,
  ChevronUp,
  ChevronDown,
  Target,
  Compass,
  Square,
  Circle,
  ArrowUpRight,
  Trash2,
  Palette,
  Check
} from 'lucide-react';
import { DicomSeries, DicomStudy, MprPlane, Point2D, ToolType, ColorLutType, RoiStatistics } from '../types/dicom';
import { MprEngine, Volume3D, ProjectionMode, MprSliceResult, detectAnatomicalPlane, findMainVolumetricSeries, isTopogramOrSingleSlice, isEligibleForMpr } from '../services/mprEngine';
import { VolumeRaycaster, VOLUME_3D_PRESETS, Volume3dPreset } from '../services/volumeRaycaster';
import { DEFAULT_WINDOW_PRESETS } from '../services/windowPresets';
import { getLutTable, classifyTissueFromHu, LUT_PRESETS } from '../services/lutService';

export interface MprMeasurement {
  id: string;
  plane: MprPlane;
  sliceIndex: number;
  type: ToolType;
  points: Point2D[]; 
  distanceMm?: number;
  angleDeg?: number;
  cobbDeg?: number;
  roiValues?: RoiStatistics;
  probeHu?: number;
  tissueName?: string;
  arrowText?: string;
  color?: string;
}

export interface MprViewportViewProps {
  series: DicomSeries | null;
  study: DicomStudy | null;
  onClose: () => void;
  activeTool?: ToolType;
  onSelectTool?: (tool: ToolType) => void;
  windowCenter?: number;
  windowWidth?: number;
  onUpdateWindowing?: (wc: number, ww: number) => void;
  lut?: ColorLutType;
  onSetLut?: (lut: ColorLutType) => void;
  invert?: boolean;
  onToggleInvert?: () => void;
  showOverlays?: boolean;
  onToggleOverlays?: () => void;
  initialLayout?: MprLayout;
  onSelectSeries?: (series: DicomSeries) => void;
}

type MprLayout = '3-view' | '2x2' | 'axial-only' | 'coronal-only' | 'sagittal-only' | '3d-only';

export const MprViewportView: React.FC<MprViewportViewProps> = ({
  series,
  study,
  onClose,
  activeTool: propsActiveTool,
  onSelectTool,
  windowCenter: propsWc,
  windowWidth: propsWw,
  onUpdateWindowing: propsOnUpdateWindowing,
  lut: propsLut,
  onSetLut,
  invert: propsInvert,
  onToggleInvert,
  showOverlays: propsShowOverlays = true,
  onToggleOverlays,
  initialLayout,
  onSelectSeries
}) => {
  const [volume, setVolume] = useState<Volume3D | null>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; z: number }>({ x: 128, y: 128, z: 12 });
  
  const [localWc, setLocalWc] = useState<number>(40);
  const [localWw, setLocalWw] = useState<number>(400);
  const effectiveWc = propsWc !== undefined ? propsWc : localWc;
  const effectiveWw = propsWw !== undefined ? propsWw : localWw;

  const [localLut, setLocalLut] = useState<ColorLutType>('grayscale');
  const effectiveLut = propsLut || localLut;

  const [localInvert, setLocalInvert] = useState<boolean>(false);
  const effectiveInvert = propsInvert !== undefined ? propsInvert : localInvert;

  // MPR starts in 3D Crosshair navigation mode by default so clicking and dragging moves the crosshairs!
  const [activeTool, setActiveTool] = useState<ToolType | 'crosshair'>('crosshair');

  const prevPropsToolRef = useRef(propsActiveTool);
  useEffect(() => {
    if (propsActiveTool && propsActiveTool !== prevPropsToolRef.current) {
      prevPropsToolRef.current = propsActiveTool;
      setActiveTool(propsActiveTool);
    }
  }, [propsActiveTool]);

  const [measurements, setMeasurements] = useState<MprMeasurement[]>([]);

  const [projectionMode, setProjectionMode] = useState<ProjectionMode>('none');
  const [slabThicknessMm, setSlabThicknessMm] = useState<number>(5.0);
  
  // Default layout (2x2 with 3D scout, or initialLayout)
  const [layout, setLayout] = useState<MprLayout>(initialLayout || '2x2');
  const [lastMultiLayout, setLastMultiLayout] = useState<'2x2' | '3-view'>(
    initialLayout === '3-view' ? '3-view' : '2x2'
  );

  useEffect(() => {
    if (initialLayout) {
      setLayout(initialLayout);
      if (initialLayout === '2x2' || initialLayout === '3-view') {
        setLastMultiLayout(initialLayout);
      }
    }
  }, [initialLayout]);

  const [showCrosshairs, setShowCrosshairs] = useState<boolean>(true);
  const [showPresetsMenu, setShowPresetsMenu] = useState<boolean>(false);
  const [showLutMenu, setShowLutMenu] = useState<boolean>(false);
  const [showLayoutMenu, setShowLayoutMenu] = useState<boolean>(false);
  const [showSeriesMenu, setShowSeriesMenu] = useState<boolean>(false);
  const [showToolsMenu, setShowToolsMenu] = useState<boolean>(false);
  const [showProjectionMenu, setShowProjectionMenu] = useState<boolean>(false);

  const [yaw3D, setYaw3D] = useState<number>(20);
  const [pitch3D, setPitch3D] = useState<number>(-15);

  useEffect(() => {
    // If current series is invalid, topogram, SR (Structured Report), or single-slice, automatically switch to the main volumetric series
    if (study && onSelectSeries && (!series || !isEligibleForMpr(series))) {
      const mainVol = findMainVolumetricSeries(study);
      if (mainVol && mainVol.seriesInstanceUid !== series?.seriesInstanceUid) {
        onSelectSeries(mainVol);
        return;
      }
    }
    if (!series || !isEligibleForMpr(series)) return;
    const vol = MprEngine.buildVolume(series);
    if (vol) {
      setVolume(vol);
      setCrosshair({
        x: Math.floor(vol.dimX / 2),
        y: Math.floor(vol.dimY / 2),
        z: Math.floor(vol.dimZ / 2)
      });
      setLocalWc(vol.windowCenter || 40);
      setLocalWw(vol.windowWidth || 400);
      setSlabThicknessMm(Math.max(2.5, vol.spacingZ * 2));
    }
  }, [series, study, onSelectSeries]);

  const handleResetCrosshairs = () => {
    if (!volume) return;
    setCrosshair({
      x: Math.floor(volume.dimX / 2),
      y: Math.floor(volume.dimY / 2),
      z: Math.floor(volume.dimZ / 2)
    });
  };

  const handleToolSelect = (tool: ToolType | 'crosshair') => {
    setActiveTool(tool);
    if (tool !== 'crosshair' && onSelectTool) {
      onSelectTool(tool as ToolType);
    }
  };

  const handleWindowingChange = (wc: number, ww: number) => {
    setLocalWc(wc);
    setLocalWw(ww);
    if (propsOnUpdateWindowing) {
      propsOnUpdateWindowing(wc, ww);
    }
  };

  const handleLutChange = (lut: ColorLutType) => {
    setLocalLut(lut);
    if (onSetLut) onSetLut(lut);
    setShowLutMenu(false);
  };

  const handleInvertToggle = () => {
    setLocalInvert(!effectiveInvert);
    if (onToggleInvert) onToggleInvert();
  };

  const handleAddMeasurement = (m: MprMeasurement) => {
    setMeasurements(prev => [...prev, m]);
  };

  const handleClearMeasurements = () => {
    setMeasurements([]);
  };

  const sourcePlane = useMemo(() => {
    if (volume?.acquisitionPlane) return volume.acquisitionPlane;
    if (!series || !series.instances || series.instances.length === 0) return 'AXIAL';
    const rep = series.instances[Math.floor(series.instances.length / 2)] || series.instances[0];
    return detectAnatomicalPlane(series.seriesDescription, rep?.imageOrientationPatient) || 'AXIAL';
  }, [series, volume]);

  const ordered3ViewPlanes: ('axial' | 'coronal' | 'sagittal')[] = useMemo(() => {
    if (sourcePlane === 'SAGITTAL') {
      return ['sagittal', 'coronal', 'axial'];
    } else if (sourcePlane === 'CORONAL') {
      return ['coronal', 'axial', 'sagittal'];
    } else {
      return ['axial', 'coronal', 'sagittal'];
    }
  }, [sourcePlane]);

  const renderPlaneViewport = (plane: 'axial' | 'coronal' | 'sagittal') => {
    if (plane === 'axial') {
      return (
        <MprSingleViewport
          key="axial"
          plane="axial"
          title="Axial"
          labelColor="text-cyan-400"
          lineColor="#06b6d4"
          volume={volume}
          crosshair={crosshair}
          showCrosshairs={showCrosshairs}
          windowCenter={effectiveWc}
          windowWidth={effectiveWw}
          lut={effectiveLut}
          invert={effectiveInvert}
          projectionMode={projectionMode}
          slabThicknessMm={slabThicknessMm}
          activeTool={activeTool}
          measurements={measurements.filter(m => m.plane === 'axial')}
          onAddMeasurement={handleAddMeasurement}
          onUpdateCrosshair={setCrosshair}
          onUpdateWindowing={handleWindowingChange}
          onToggleMaximize={() => setLayout(layout === 'axial-only' ? lastMultiLayout : 'axial-only')}
          isMaximized={layout === 'axial-only'}
        />
      );
    }
    if (plane === 'coronal') {
      return (
        <MprSingleViewport
          key="coronal"
          plane="coronal"
          title="Coronal"
          labelColor="text-emerald-400"
          lineColor="#10b981"
          volume={volume}
          crosshair={crosshair}
          showCrosshairs={showCrosshairs}
          windowCenter={effectiveWc}
          windowWidth={effectiveWw}
          lut={effectiveLut}
          invert={effectiveInvert}
          projectionMode={projectionMode}
          slabThicknessMm={slabThicknessMm}
          activeTool={activeTool}
          measurements={measurements.filter(m => m.plane === 'coronal')}
          onAddMeasurement={handleAddMeasurement}
          onUpdateCrosshair={setCrosshair}
          onUpdateWindowing={handleWindowingChange}
          onToggleMaximize={() => setLayout(layout === 'coronal-only' ? lastMultiLayout : 'coronal-only')}
          isMaximized={layout === 'coronal-only'}
        />
      );
    }
    return (
      <MprSingleViewport
        key="sagittal"
        plane="sagittal"
        title="Sagittal"
        labelColor="text-amber-400"
        lineColor="#f59e0b"
        volume={volume}
        crosshair={crosshair}
        showCrosshairs={showCrosshairs}
        windowCenter={effectiveWc}
        windowWidth={effectiveWw}
        lut={effectiveLut}
        invert={effectiveInvert}
        projectionMode={projectionMode}
        slabThicknessMm={slabThicknessMm}
        activeTool={activeTool}
        measurements={measurements.filter(m => m.plane === 'sagittal')}
        onAddMeasurement={handleAddMeasurement}
        onUpdateCrosshair={setCrosshair}
        onUpdateWindowing={handleWindowingChange}
        onToggleMaximize={() => setLayout(layout === 'sagittal-only' ? lastMultiLayout : 'sagittal-only')}
        isMaximized={layout === 'sagittal-only'}
      />
    );
  };

  return (
    <div className="flex-1 flex flex-col w-full h-full bg-radiant-darkest select-none text-slate-100">
      <div className="h-12 bg-radiant-panel border-b border-radiant-border flex items-center justify-between px-3 text-xs gap-2 relative z-50 overflow-visible">
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-cyan-600 to-blue-600 rounded font-bold text-white shadow-sm">
            <Layers className="w-4 h-4 text-cyan-200" />
            <span>3D / MPR</span>
          </div>

          <div className="flex items-center gap-2 text-slate-300 font-medium">
            {/* Interactive Series Selector Dropdown (Filters out SR and Scouts) */}
            {study && study.series.filter(s => isEligibleForMpr(s)).length > 1 && onSelectSeries ? (
              <div className="relative">
                <button
                  onClick={() => {
                    setShowSeriesMenu(!showSeriesMenu);
                    setShowLayoutMenu(false);
                    setShowPresetsMenu(false);
                    setShowLutMenu(false);
                    setShowToolsMenu(false);
                    setShowProjectionMenu(false);
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 bg-radiant-darkest hover:bg-radiant-hover text-amber-300 rounded border border-radiant-border text-[11px] font-semibold transition-colors"
                >
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span className="max-w-[180px] truncate">{series?.seriesDescription || `Series ${series?.seriesNumber}`}</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
                {showSeriesMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowSeriesMenu(false)} />
                    <div className="absolute left-0 top-full mt-1 w-72 bg-radiant-panel border border-radiant-border rounded-lg shadow-2xl py-1 z-50 text-xs max-h-80 overflow-y-auto">
                      {study.series.filter(s => isEligibleForMpr(s)).map((s) => {
                        const rep = s.instances[Math.floor(s.instances.length / 2)] || s.instances[0];
                        const plane = detectAnatomicalPlane(s.seriesDescription, rep?.imageOrientationPatient);
                        const isSelected = s.seriesInstanceUid === series?.seriesInstanceUid;
                        return (
                          <button
                            key={s.seriesInstanceUid}
                            onClick={() => {
                              onSelectSeries(s);
                              setShowSeriesMenu(false);
                            }}
                            className={`w-full text-left px-3 py-2 hover:bg-radiant-hover flex items-center justify-between transition-colors ${
                              isSelected ? 'bg-cyan-950/60 text-cyan-300 font-bold' : 'text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {plane ? (
                                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                                  plane === 'CORONAL'
                                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600/50'
                                    : plane === 'SAGITTAL'
                                    ? 'bg-amber-950/80 text-amber-300 border-amber-600/50'
                                    : 'bg-indigo-950/80 text-indigo-300 border-indigo-600/50'
                                }`}>
                                  {plane === 'CORONAL' ? 'COR' : plane === 'SAGITTAL' ? 'SAG' : 'AX'}
                                </span>
                              ) : null}
                              <div className="flex flex-col min-w-0">
                                <span className="truncate font-semibold">{s.seriesDescription || `Series ${s.seriesNumber}`}</span>
                                <span className="text-[10px] text-slate-400">{s.numberOfInstances} images</span>
                              </div>
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <span className="text-amber-300 font-semibold text-[11px]">{series?.seriesDescription || series?.modality}</span>
            )}

            <span className="text-slate-500">•</span>
            <span className="font-mono text-slate-400 text-[11px] hidden sm:inline">{volume ? `${volume.dimX}x${volume.dimY}x${volume.dimZ} voxels` : ''}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* 1. Core 4 Navigation Tools */}
          <div className="flex items-center bg-radiant-darkest rounded-lg border border-radiant-border p-0.5 shadow-inner">
            <button
              onClick={() => handleToolSelect('crosshair')}
              title="3D Crosshair Navigation"
              className={`p-1.5 rounded transition-colors ${activeTool === 'crosshair' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Target className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleToolSelect('ww_wl')}
              title="Window Level / Window Width"
              className={`p-1.5 rounded transition-colors ${activeTool === 'ww_wl' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <SunMedium className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleToolSelect('pan')}
              title="Pan"
              className={`p-1.5 rounded transition-colors ${activeTool === 'pan' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Move className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleToolSelect('zoom')}
              title="Zoom"
              className={`p-1.5 rounded transition-colors ${activeTool === 'zoom' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 2. Measurements & Annotations Compact Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowToolsMenu(!showToolsMenu);
                setShowPresetsMenu(false);
                setShowLutMenu(false);
                setShowLayoutMenu(false);
                setShowSeriesMenu(false);
                setShowProjectionMenu(false);
              }}
              title="Tools & Measurements"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-semibold transition-colors ${
                ['distance', 'angle', 'cobb_angle', 'rectangle_roi', 'ellipse_roi', 'arrow', 'hu_probe'].includes(activeTool)
                  ? 'bg-cyan-600 text-white border-cyan-400 shadow-sm'
                  : 'bg-radiant-darkest hover:bg-radiant-hover text-slate-200 border-radiant-border'
              }`}
            >
              {activeTool === 'distance' && <Ruler className="w-3.5 h-3.5 text-cyan-200" />}
              {activeTool === 'angle' && <Compass className="w-3.5 h-3.5 text-cyan-200" />}
              {activeTool === 'cobb_angle' && <Activity className="w-3.5 h-3.5 text-pink-300" />}
              {activeTool === 'rectangle_roi' && <Square className="w-3.5 h-3.5 text-cyan-200" />}
              {activeTool === 'ellipse_roi' && <Circle className="w-3.5 h-3.5 text-cyan-200" />}
              {activeTool === 'arrow' && <ArrowUpRight className="w-3.5 h-3.5 text-cyan-200" />}
              {activeTool === 'hu_probe' && <Activity className="w-3.5 h-3.5 text-emerald-300" />}
              {!['distance', 'angle', 'cobb_angle', 'rectangle_roi', 'ellipse_roi', 'arrow', 'hu_probe'].includes(activeTool) && (
                <Ruler className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>
                {activeTool === 'distance'
                  ? 'Distance'
                  : activeTool === 'angle'
                  ? 'Angle'
                  : activeTool === 'cobb_angle'
                  ? 'Cobb'
                  : activeTool === 'rectangle_roi'
                  ? 'Rect ROI'
                  : activeTool === 'ellipse_roi'
                  ? 'Ellipse ROI'
                  : activeTool === 'arrow'
                  ? 'Arrow'
                  : activeTool === 'hu_probe'
                  ? 'HU Probe'
                  : 'Tools'}
              </span>
              {measurements.length > 0 && (
                <span className="bg-cyan-900/90 text-cyan-200 text-[10px] px-1 rounded-full font-mono">
                  {measurements.length}
                </span>
              )}
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showToolsMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowToolsMenu(false)} />
                <div className="absolute left-0 top-full mt-1 w-52 bg-radiant-panel border border-radiant-border rounded-lg shadow-2xl py-1 z-50 text-xs">
                  <button
                    onClick={() => { handleToolSelect('distance'); setShowToolsMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2 transition-colors ${activeTool === 'distance' ? 'bg-cyan-950/60 text-cyan-300 font-bold' : 'text-slate-200'}`}
                  >
                    <Ruler className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Distance (Length)</span>
                  </button>
                  <button
                    onClick={() => { handleToolSelect('angle'); setShowToolsMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2 transition-colors ${activeTool === 'angle' ? 'bg-cyan-950/60 text-cyan-300 font-bold' : 'text-slate-200'}`}
                  >
                    <Compass className="w-3.5 h-3.5 text-amber-400" />
                    <span>Angle</span>
                  </button>
                  <button
                    onClick={() => { handleToolSelect('cobb_angle'); setShowToolsMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2 transition-colors ${activeTool === 'cobb_angle' ? 'bg-cyan-950/60 text-cyan-300 font-bold' : 'text-slate-200'}`}
                  >
                    <Activity className="w-3.5 h-3.5 text-pink-400" />
                    <span>Cobb Angle</span>
                  </button>
                  <button
                    onClick={() => { handleToolSelect('rectangle_roi'); setShowToolsMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2 transition-colors ${activeTool === 'rectangle_roi' ? 'bg-cyan-950/60 text-cyan-300 font-bold' : 'text-slate-200'}`}
                  >
                    <Square className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Rectangle ROI</span>
                  </button>
                  <button
                    onClick={() => { handleToolSelect('ellipse_roi'); setShowToolsMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2 transition-colors ${activeTool === 'ellipse_roi' ? 'bg-cyan-950/60 text-cyan-300 font-bold' : 'text-slate-200'}`}
                  >
                    <Circle className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Ellipse ROI</span>
                  </button>
                  <button
                    onClick={() => { handleToolSelect('arrow'); setShowToolsMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2 transition-colors ${activeTool === 'arrow' ? 'bg-cyan-950/60 text-cyan-300 font-bold' : 'text-slate-200'}`}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5 text-blue-400" />
                    <span>Arrow Annotation</span>
                  </button>
                  <button
                    onClick={() => { handleToolSelect('hu_probe'); setShowToolsMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2 transition-colors ${activeTool === 'hu_probe' ? 'bg-cyan-950/60 text-cyan-300 font-bold' : 'text-slate-200'}`}
                  >
                    <Activity className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Live HU Probe</span>
                  </button>

                  {measurements.length > 0 && (
                    <>
                      <div className="my-1 border-t border-slate-700/60" />
                      <button
                        onClick={() => { handleClearMeasurements(); setShowToolsMenu(false); }}
                        className="w-full text-left px-3 py-1.5 text-rose-400 hover:bg-rose-950/50 flex items-center gap-2 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Clear All ({measurements.length})</span>
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 3. Projection & Slab Compact Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowProjectionMenu(!showProjectionMenu);
                setShowPresetsMenu(false);
                setShowLutMenu(false);
                setShowLayoutMenu(false);
                setShowSeriesMenu(false);
                setShowToolsMenu(false);
              }}
              title="Projection Mode & Slab Thickness"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-semibold transition-colors ${
                projectionMode !== 'none'
                  ? 'bg-cyan-600 text-white border-cyan-400 shadow-sm'
                  : 'bg-radiant-darkest hover:bg-radiant-hover text-slate-200 border-radiant-border'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
              <span>
                {projectionMode === 'none'
                  ? 'Normal'
                  : `${projectionMode.toUpperCase()} (${slabThicknessMm.toFixed(1)}mm)`}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showProjectionMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowProjectionMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-60 bg-radiant-panel border border-radiant-border rounded-lg shadow-2xl p-2.5 z-50 text-xs space-y-2.5">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider px-1">
                    Projection Mode
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      { id: 'none' as const, label: 'Normal (1 Slice)' },
                      { id: 'mip' as const, label: 'MIP (Max)' },
                      { id: 'minip' as const, label: 'MinIP (Min)' },
                      { id: 'avg' as const, label: 'Average (Avg)' }
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setProjectionMode(opt.id)}
                        className={`px-2 py-1.5 rounded text-[11px] font-medium text-left transition-colors ${
                          projectionMode === opt.id
                            ? 'bg-cyan-600 text-white font-bold shadow-sm'
                            : 'bg-radiant-darkest text-slate-300 hover:bg-radiant-hover border border-radiant-border'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {projectionMode !== 'none' && (
                    <div className="pt-2 border-t border-slate-700/60 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-300 font-semibold">Slab Thickness</span>
                        <span className="font-mono text-cyan-300 font-bold bg-black/50 px-1.5 py-0.5 rounded border border-slate-700">
                          {slabThicknessMm.toFixed(1)} mm
                        </span>
                      </div>
                      <input
                        type="range"
                        min="2.5"
                        max="50"
                        step="2.5"
                        value={slabThicknessMm}
                        onChange={(e) => setSlabThicknessMm(parseFloat(e.target.value))}
                        className="w-full accent-cyan-500 cursor-pointer"
                      />
                      <div className="flex items-center justify-between gap-1 text-[10px]">
                        {[5, 10, 20, 30, 40].map((mm) => (
                          <button
                            key={mm}
                            onClick={() => setSlabThicknessMm(mm)}
                            className={`flex-1 py-0.5 rounded font-mono border transition-colors ${
                              slabThicknessMm === mm
                                ? 'bg-cyan-950 border-cyan-500 text-cyan-300 font-bold'
                                : 'bg-radiant-darkest border-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {mm}mm
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 4. Windowing Presets Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowPresetsMenu(!showPresetsMenu);
                setShowLutMenu(false);
                setShowLayoutMenu(false);
                setShowSeriesMenu(false);
                setShowToolsMenu(false);
                setShowProjectionMenu(false);
              }}
              className="flex items-center gap-1 px-2.5 py-1 bg-radiant-darkest hover:bg-radiant-hover text-slate-300 rounded border border-radiant-border text-[11px]"
            >
              <SunMedium className="w-3.5 h-3.5 text-amber-400" />
              <span>WL: {effectiveWc} WW: {effectiveWw}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            {showPresetsMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowPresetsMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-52 bg-radiant-panel border border-radiant-border rounded-lg shadow-2xl py-1 z-50 text-xs">
                  {DEFAULT_WINDOW_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { handleWindowingChange(p.windowCenter, p.windowWidth); setShowPresetsMenu(false); }}
                      className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center justify-between text-slate-200 transition-colors"
                    >
                      <span>{p.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">[{p.shortcut}]</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 5. Color LUT Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowLutMenu(!showLutMenu);
                setShowPresetsMenu(false);
                setShowLayoutMenu(false);
                setShowSeriesMenu(false);
                setShowToolsMenu(false);
                setShowProjectionMenu(false);
              }}
              className="flex items-center gap-1 px-2.5 py-1 bg-radiant-darkest hover:bg-radiant-hover text-slate-300 rounded border border-radiant-border text-[11px]"
            >
              <Palette className="w-3.5 h-3.5 text-cyan-400" />
              <span className="capitalize">{effectiveLut.replace('_', ' ')}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            {showLutMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowLutMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 bg-radiant-panel border border-radiant-border rounded-lg shadow-2xl py-1 z-50 text-xs">
                  {LUT_PRESETS.map((lutPreset) => (
                    <button
                      key={lutPreset.id}
                      onClick={() => handleLutChange(lutPreset.id)}
                      className={`w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center justify-between transition-colors ${effectiveLut === lutPreset.id ? 'bg-cyan-950/60 text-cyan-300 font-bold' : 'text-slate-200'}`}
                    >
                      <span>{lutPreset.name}</span>
                      <span className={`w-3.5 h-3.5 rounded-full bg-gradient-to-r ${lutPreset.previewColor}`}></span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 6. Invert Button */}
          <button
            onClick={handleInvertToggle}
            className={`p-1.5 rounded border text-[11px] flex items-center gap-1 transition-colors ${effectiveInvert ? 'bg-cyan-950/60 text-cyan-300 border-cyan-500/60 font-bold' : 'bg-radiant-darkest text-slate-400 border-radiant-border hover:text-slate-200'}`}
          >
            <span>Invert</span>
          </button>

          {/* 7. Crosshair Toggle & Reset */}
          <button
            onClick={() => setShowCrosshairs(!showCrosshairs)}
            title={showCrosshairs ? 'Hide Crosshairs' : 'Show Crosshairs'}
            className={`p-1.5 rounded border text-xs flex items-center gap-1 transition-colors ${showCrosshairs ? 'bg-cyan-950/60 text-cyan-300 border-cyan-500/60' : 'bg-radiant-darkest text-slate-400 border-radiant-border hover:text-slate-200'}`}
          >
            {showCrosshairs ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={handleResetCrosshairs}
            title="Reset Crosshair to Center"
            className="p-1.5 bg-radiant-darkest hover:bg-radiant-hover text-slate-300 rounded border border-radiant-border text-xs flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
          </button>

          <div className="relative">
            <button
              onClick={() => {
                setShowLayoutMenu(!showLayoutMenu);
                setShowPresetsMenu(false);
                setShowLutMenu(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-radiant-darkest hover:bg-radiant-hover text-slate-200 rounded border border-radiant-border text-[11px] font-semibold transition-colors"
            >
              <Grid className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                {layout === '2x2'
                  ? '3D MPR (2×2)'
                  : layout === '3-view'
                  ? '3D MPR (1×3)'
                  : layout === 'coronal-only'
                  ? 'Coronal'
                  : layout === 'axial-only'
                  ? 'Axial'
                  : layout === 'sagittal-only'
                  ? 'Sagittal'
                  : layout === '3d-only'
                  ? '3D Scout'
                  : 'MPR'}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            {showLayoutMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowLayoutMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-56 bg-radiant-panel border border-radiant-border rounded-lg shadow-2xl py-1 z-50 text-xs">
                  {[
                    { id: '2x2' as const, label: '3D MPR (2×2)', description: 'Axial, Coronal, Sagittal & 3D Volume' },
                    { id: '3-view' as const, label: '3D MPR (1×3)', description: '3 Series: Axial, Coronal, Sagittal' },
                    { id: 'coronal-only' as const, label: 'Coronal', description: 'Coronal full viewport' },
                    { id: 'axial-only' as const, label: 'Axial', description: 'Axial full viewport' },
                    { id: 'sagittal-only' as const, label: 'Sagittal', description: 'Sagittal full viewport' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        const optId = opt.id;
                        setLayout(optId);
                        if (optId === '2x2' || optId === '3-view') {
                          setLastMultiLayout(optId);
                        }
                        // Ensure we have the main 3D volumetric series loaded for MPR reconstruction
                        if (study && onSelectSeries && (!series || isTopogramOrSingleSlice(series) || series.instances.length < 2)) {
                          const mainVol = findMainVolumetricSeries(study);
                          if (mainVol && mainVol.seriesInstanceUid !== series?.seriesInstanceUid) {
                            onSelectSeries(mainVol);
                          }
                        }
                        setShowLayoutMenu(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center justify-between transition-colors ${
                        layout === opt.id ? 'bg-cyan-950/60 text-cyan-300 font-bold' : 'text-slate-200'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-semibold">{opt.label}</span>
                        <span className="text-[10px] text-slate-400 font-normal">{opt.description}</span>
                      </div>
                      {layout === opt.id && <Check className="w-4 h-4 text-cyan-400" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 3D MPR 2x2 (with 3D) vs 1x3 (3 Series only) quick switcher */}
          {(layout === '2x2' || layout === '3-view') && (
            <div className="flex items-center bg-radiant-darkest rounded-lg border border-radiant-border p-0.5">
              <button
                onClick={() => {
                  setLayout('2x2');
                  setLastMultiLayout('2x2');
                  if (study && onSelectSeries && (!series || isTopogramOrSingleSlice(series) || series.instances.length < 2)) {
                    const mainVol = findMainVolumetricSeries(study);
                    if (mainVol && mainVol.seriesInstanceUid !== series?.seriesInstanceUid) {
                      onSelectSeries(mainVol);
                    }
                  }
                }}
                title="2x2: 3D Volume display with 3 Orthogonal Views (Axial, Coronal, Sagittal)"
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 ${
                  layout === '2x2' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>2×2 (3D)</span>
              </button>
              <button
                onClick={() => {
                  setLayout('3-view');
                  setLastMultiLayout('3-view');
                  if (study && onSelectSeries && (!series || isTopogramOrSingleSlice(series) || series.instances.length < 2)) {
                    const mainVol = findMainVolumetricSeries(study);
                    if (mainVol && mainVol.seriesInstanceUid !== series?.seriesInstanceUid) {
                      onSelectSeries(mainVol);
                    }
                  }
                }}
                title="1x3: Tri-View display with 3 Orthogonal Views (Sagittal, Coronal, Axial)"
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 ${
                  layout === '3-view' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>1×3 (3 Series)</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex items-center gap-1 px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/40 rounded transition-colors font-bold text-xs"
          >
            <X className="w-4 h-4" />
            <span>Close</span>
          </button>
        </div>
      </div>

      <div
        className={`flex-1 grid gap-1 p-1 bg-black overflow-hidden ${
          layout === '2x2'
            ? 'grid-cols-2 grid-rows-2'
            : layout === '3-view'
            ? 'grid-cols-3 grid-rows-1'
            : 'grid-cols-1 grid-rows-1'
        }`}
      >
        {layout === '3-view' ? (
          ordered3ViewPlanes.map(p => renderPlaneViewport(p))
        ) : (
          <>
            {(layout === '2x2' || layout === 'axial-only') && renderPlaneViewport('axial')}
            {(layout === '2x2' || layout === 'coronal-only') && renderPlaneViewport('coronal')}
            {(layout === '2x2' || layout === 'sagittal-only') && renderPlaneViewport('sagittal')}
            {(layout === '2x2' || layout === '3d-only') && (
              <Mpr3dVolumeViewport
                volume={volume}
                crosshair={crosshair}
                showCrosshairs={showCrosshairs}
                yaw={yaw3D}
                pitch={pitch3D}
                onUpdateRotation={(newYaw, newPitch) => {
                  setYaw3D(newYaw);
                  setPitch3D(newPitch);
                }}
                onToggleMaximize={() => setLayout(layout === '3d-only' ? '2x2' : '3d-only')}
                isMaximized={layout === '3d-only'}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

function calculateSliceRectangleRoi(p1: Point2D, p2: Point2D, slice: MprSliceResult): RoiStatistics | null {
  const { width, height, huData, pixelSpacing } = slice;
  const ix1 = Math.max(0, Math.min(width - 1, Math.round(p1.x + width / 2)));
  const ix2 = Math.max(0, Math.min(width - 1, Math.round(p2.x + width / 2)));
  const iy1 = Math.max(0, Math.min(height - 1, Math.round(p1.y + height / 2)));
  const iy2 = Math.max(0, Math.min(height - 1, Math.round(p2.y + height / 2)));

  const minX = Math.min(ix1, ix2);
  const maxX = Math.max(ix1, ix2);
  const minY = Math.min(iy1, iy2);
  const maxY = Math.max(iy1, iy2);

  let sum = 0;
  let count = 0;
  let min = Infinity;
  let max = -Infinity;
  const values: number[] = [];

  for (let y = minY; y <= maxY; y++) {
    const rowOffset = y * width;
    for (let x = minX; x <= maxX; x++) {
      const hu = huData[rowOffset + x];
      sum += hu;
      count++;
      values.push(hu);
      if (hu < min) min = hu;
      if (hu > max) max = hu;
    }
  }

  if (count === 0) return null;

  const mean = sum / count;
  let varSum = 0;
  for (const hu of values) {
    varSum += Math.pow(hu - mean, 2);
  }
  const stdDev = Math.sqrt(varSum / count);

  const numBins = 16;
  const bins = new Array(numBins).fill(0);
  const range = Math.max(1, max - min);
  for (const hu of values) {
    const binIdx = Math.min(numBins - 1, Math.floor(((hu - min) / range) * numBins));
    bins[binIdx]++;
  }

  const rowSpacing = pixelSpacing[0] || 1;
  const colSpacing = pixelSpacing[1] || 1;
  const areaMm2 = count * rowSpacing * colSpacing;
  const areaCm2 = areaMm2 / 100;

  return {
    areaMm2,
    areaCm2,
    meanHu: mean,
    minHu: min === Infinity ? 0 : min,
    maxHu: max === -Infinity ? 0 : max,
    stdDevHu: stdDev,
    histogram: { bins, minHu: min, maxHu: max, count }
  };
}

function calculateSliceEllipseRoi(p1: Point2D, p2: Point2D, slice: MprSliceResult): RoiStatistics | null {
  const { width, height, huData, pixelSpacing } = slice;
  const ix1 = Math.max(0, Math.min(width - 1, Math.round(p1.x + width / 2)));
  const ix2 = Math.max(0, Math.min(width - 1, Math.round(p2.x + width / 2)));
  const iy1 = Math.max(0, Math.min(height - 1, Math.round(p1.y + height / 2)));
  const iy2 = Math.max(0, Math.min(height - 1, Math.round(p2.y + height / 2)));

  const cx = (ix1 + ix2) / 2;
  const cy = (iy1 + iy2) / 2;
  const rx = Math.max(0.5, Math.abs(ix1 - ix2) / 2);
  const ry = Math.max(0.5, Math.abs(iy1 - iy2) / 2);

  const minX = Math.max(0, Math.min(width - 1, Math.floor(cx - rx)));
  const maxX = Math.max(0, Math.min(width - 1, Math.ceil(cx + rx)));
  const minY = Math.max(0, Math.min(height - 1, Math.floor(cy - ry)));
  const maxY = Math.max(0, Math.min(height - 1, Math.ceil(cy + ry)));

  let sum = 0;
  let count = 0;
  let min = Infinity;
  let max = -Infinity;
  const values: number[] = [];

  for (let y = minY; y <= maxY; y++) {
    const dy = (y - cy) / ry;
    const dySq = dy * dy;
    const rowOffset = y * width;
    for (let x = minX; x <= maxX; x++) {
      const dx = (x - cx) / rx;
      if (dx * dx + dySq <= 1.0) {
        const hu = huData[rowOffset + x];
        sum += hu;
        count++;
        values.push(hu);
        if (hu < min) min = hu;
        if (hu > max) max = hu;
      }
    }
  }

  if (count === 0) return null;

  const mean = sum / count;
  let varSum = 0;
  for (const hu of values) {
    varSum += Math.pow(hu - mean, 2);
  }
  const stdDev = Math.sqrt(varSum / count);

  const numBins = 16;
  const bins = new Array(numBins).fill(0);
  const range = Math.max(1, max - min);
  for (const hu of values) {
    const binIdx = Math.min(numBins - 1, Math.floor(((hu - min) / range) * numBins));
    bins[binIdx]++;
  }

  const rowSpacing = pixelSpacing[0] || 1;
  const colSpacing = pixelSpacing[1] || 1;
  const areaMm2 = count * rowSpacing * colSpacing;
  const areaCm2 = areaMm2 / 100;

  return {
    areaMm2,
    areaCm2,
    meanHu: mean,
    minHu: min === Infinity ? 0 : min,
    maxHu: max === -Infinity ? 0 : max,
    stdDevHu: stdDev,
    histogram: { bins, minHu: min, maxHu: max, count }
  };
}

function drawMprBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fitScale: number,
  bgColor = 'rgba(15, 23, 42, 0.88)',
  borderColor = 'rgba(56, 189, 248, 0.7)'
) {
  ctx.save();
  const lines = text.split('\n');
  const fontSize = Math.max(10, Math.round(11 / fitScale));
  ctx.font = `600 ${fontSize}px "JetBrains Mono", monospace`;

  let maxW = 0;
  for (const l of lines) {
    const w = ctx.measureText(l).width;
    if (w > maxW) maxW = w;
  }
  const lineHeight = fontSize * 1.35;
  const totalH = lines.length * lineHeight;
  const pad = 5 / fitScale;

  ctx.fillStyle = bgColor;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1 / fitScale;
  ctx.beginPath();
  if (typeof (ctx as any).roundRect === 'function') {
    (ctx as any).roundRect(x - pad, y - pad, maxW + pad * 2, totalH + pad * 2, 4 / fitScale);
  } else {
    ctx.rect(x - pad, y - pad, maxW + pad * 2, totalH + pad * 2);
  }
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y + (i + 0.85) * lineHeight);
  }
  ctx.restore();
}

function drawMprCaliper(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath();
  ctx.arc(x, y, size, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
}

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
  lut: ColorLutType;
  invert: boolean;
  projectionMode: ProjectionMode;
  slabThicknessMm: number;
  activeTool: ToolType | 'crosshair';
  measurements: MprMeasurement[];
  onAddMeasurement: (m: MprMeasurement) => void;
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
  lut,
  invert,
  projectionMode,
  slabThicknessMm,
  activeTool,
  measurements,
  onAddMeasurement,
  onUpdateCrosshair,
  onUpdateWindowing,
  onToggleMaximize,
  isMaximized
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isCrosshairDragging, setIsCrosshairDragging] = useState(false);
  const [crosshairDragPart, setCrosshairDragPart] = useState<'hub' | 'horizontal' | 'vertical'>('hub');
  const [isHoveringCrosshair, setIsHoveringCrosshair] = useState(false);
  const [dragBtn, setDragBtn] = useState<number>(0);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initWc, setInitWc] = useState(windowCenter);
  const [initWw, setInitWw] = useState(windowWidth);

  const [pan, setPan] = useState<Point2D>({ x: 0, y: 0 });
  const [initPan, setInitPan] = useState<Point2D>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1.0);
  const [initZoom, setInitZoom] = useState<number>(1.0);

  const [drawingPoints, setDrawingPoints] = useState<Point2D[]>([]);
  const [mouseCoord, setMouseCoord] = useState<{ x: number; y: number; hu: number | null; tissue?: string }>({
    x: 0,
    y: 0,
    hu: null
  });

  const totalSlices = plane === 'axial' ? (volume?.dimZ || 1) : plane === 'coronal' ? (volume?.dimY || 1) : (volume?.dimX || 1);
  const currentSliceIdx = plane === 'axial' ? crosshair.z : plane === 'coronal' ? crosshair.y : crosshair.x;

  // Viewport 2D Rotation and Inversion State (0, 90, 180, 270)
  const [rotationDeg, setRotationDeg] = useState<number>(0);
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);

  const handleRotateCw = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRotationDeg(prev => (prev + 90) % 360);
  };
  const handleRotateCcw = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRotationDeg(prev => (prev + 270) % 360);
  };
  const handleToggleFlipH = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFlipH(prev => !prev);
  };
  const handleToggleFlipV = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFlipV(prev => !prev);
  };
  const handleResetOrientation = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRotationDeg(0);
    setFlipH(false);
    setFlipV(false);
    setPan({ x: 0, y: 0 });
    setZoom(1.0);
  };

  const getCompassLabels = () => {
    let base: [string, string, string, string]; // [Top, Right, Bottom, Left]
    if (plane === 'axial') {
      base = ['A', 'L', 'P', 'R'];
    } else if (plane === 'coronal') {
      base = ['S', 'L', 'I', 'R'];
    } else {
      base = ['S', 'A', 'I', 'P'];
    }

    const steps = ((rotationDeg / 90) % 4 + 4) % 4;
    let rotated: [string, string, string, string] = [
      base[(0 - steps + 4) % 4],
      base[(1 - steps + 4) % 4],
      base[(2 - steps + 4) % 4],
      base[(3 - steps + 4) % 4]
    ];

    if (flipH) {
      const tmp = rotated[1];
      rotated[1] = rotated[3];
      rotated[3] = tmp;
    }
    if (flipV) {
      const tmp = rotated[0];
      rotated[0] = rotated[2];
      rotated[2] = tmp;
    }

    return {
      top: rotated[0],
      right: rotated[1],
      bottom: rotated[2],
      left: rotated[3]
    };
  };

  const compass = getCompassLabels();

  const renderMpr = useCallback(() => {
    if (!canvasRef.current || !volume || !containerRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const slice = MprEngine.getSlice(volume, plane, crosshair, projectionMode, slabThicknessMm);
    const { width, height, huData } = slice;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;
    const numPixels = width * height;

    const wc = windowCenter;
    const ww = Math.max(1, windowWidth);
    const low = wc - 0.5 - (ww - 1) / 2;
    const high = wc - 0.5 + (ww - 1) / 2;

    const lutTable = getLutTable(lut);

    for (let i = 0; i < numPixels; i++) {
      const val = huData[i];
      let gray: number;

      if (val <= low) gray = 0;
      else if (val >= high) gray = 255;
      else gray = Math.round(((val - low) / ww) * 255);

      if (invert) {
        gray = 255 - gray;
      }

      const pIdx = i * 4;
      const lIdx = gray * 3;
      data[pIdx] = lutTable[lIdx];
      data[pIdx + 1] = lutTable[lIdx + 1];
      data[pIdx + 2] = lutTable[lIdx + 2];
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

    // Isotropic square-pixel geometry (RadiAnt standard)
    const isRotated90or270 = rotationDeg === 90 || rotationDeg === 270;
    const effWidth = isRotated90or270 ? height : width;
    const effHeight = isRotated90or270 ? width : height;
    const fitScale = Math.min(displayWidth / effWidth, displayHeight / effHeight) * zoom;
    const cx = displayWidth / 2 + pan.x;
    const cy = displayHeight / 2 + pan.y;

    ctx.translate(cx, cy);
    if (rotationDeg !== 0) {
      ctx.rotate((rotationDeg * Math.PI) / 180);
    }
    if (flipH || flipV) {
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    }
    ctx.scale(fitScale, fitScale);

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
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(tempCanvas, -width / 2, -height / 2);
    }

    if (showCrosshairs) {
      const isAxial = plane === 'axial';
      const isCoronal = plane === 'coronal';

      // RadiAnt standard colors: Axial = Cyan (#06b6d4), Coronal = Green (#10b981), Sagittal = Amber (#f59e0b)
      const hColor = isAxial ? '#10b981' : '#06b6d4'; // In Axial: horizontal is Coronal (Green). In Coronal & Sagittal: horizontal is Axial (Cyan).
      const vColor = isAxial ? '#f59e0b' : isCoronal ? '#f59e0b' : '#10b981'; // In Axial & Coronal: vertical is Sagittal (Amber). In Sagittal: vertical is Coronal (Green).

      const leftLabel = isAxial ? 'R' : isCoronal ? 'R' : 'P';
      const rightLabel = isAxial ? 'L' : isCoronal ? 'L' : 'A';
      const topLabel = isAxial ? 'A' : 'S';
      const bottomLabel = isAxial ? 'P' : 'I';

      let chX = 0;
      let chY = 0;

      if (plane === 'axial') {
        chX = (crosshair.x / Math.max(1, volume.dimX - 1)) * (width - 1) - width / 2;
        chY = (crosshair.y / Math.max(1, volume.dimY - 1)) * (height - 1) - height / 2;
      } else if (plane === 'coronal') {
        chX = (crosshair.x / Math.max(1, volume.dimX - 1)) * (width - 1) - width / 2;
        chY = (crosshair.z / Math.max(1, volume.dimZ - 1)) * (height - 1) - height / 2;
      } else {
        chX = (crosshair.y / Math.max(1, volume.dimY - 1)) * (width - 1) - width / 2;
        chY = (crosshair.z / Math.max(1, volume.dimZ - 1)) * (height - 1) - height / 2;
      }

      const extW = Math.max(width / 2 + 100 / fitScale, displayWidth / fitScale);
      const extH = Math.max(height / 2 + 100 / fitScale, displayHeight / fitScale);

      // Horizontal reference line (Full width spanning across the view like RadiAnt)
      ctx.lineWidth = 1.3 / fitScale;
      ctx.strokeStyle = hColor;
      ctx.beginPath();
      ctx.moveTo(-extW, chY);
      ctx.lineTo(extW, chY);
      ctx.stroke();

      // Horizontal line end handles
      ctx.fillStyle = hColor;
      ctx.beginPath();
      ctx.arc(-width / 2, chY, 3.5 / fitScale, 0, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(width / 2, chY, 3.5 / fitScale, 0, 2 * Math.PI);
      ctx.fill();

      // Left & Right anatomical labels directly on the reference line
      ctx.font = `bold ${Math.max(10, Math.round(12 / fitScale))}px sans-serif`;
      ctx.fillStyle = hColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(leftLabel, -width / 2 + 7 / fitScale, chY);

      ctx.textAlign = 'right';
      ctx.fillText(rightLabel, width / 2 - 7 / fitScale, chY);

      // Vertical reference line (Full height spanning across the view like RadiAnt)
      ctx.lineWidth = 1.3 / fitScale;
      ctx.strokeStyle = vColor;
      ctx.beginPath();
      ctx.moveTo(chX, -extH);
      ctx.lineTo(chX, extH);
      ctx.stroke();

      // Top & bottom handles on vertical line
      ctx.fillStyle = vColor;
      ctx.beginPath();
      ctx.arc(chX, -height / 2 + 8 / fitScale, 3.5 / fitScale, 0, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(chX, height / 2 - 8 / fitScale, 3.5 / fitScale, 0, 2 * Math.PI);
      ctx.fill();

      // Top & Bottom labels on vertical line
      ctx.font = `bold ${Math.max(10, Math.round(11 / fitScale))}px sans-serif`;
      ctx.fillStyle = vColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(topLabel, chX, -height / 2 + 14 / fitScale);
      ctx.textBaseline = 'bottom';
      ctx.fillText(bottomLabel, chX, height / 2 - 14 / fitScale);

      // Center crosshair intersection indicator
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(chX, chY, 2.5 / fitScale, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.lineWidth = 1 / fitScale;
      ctx.stroke();
    }

    measurements.forEach((m) => {
      const isCurrentSlice = Math.abs(m.sliceIndex - currentSliceIdx) <= 1;
      const alpha = isCurrentSlice ? 1.0 : 0.35;
      const color = m.color || '#38bdf8';

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.8 / fitScale;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;

      if (m.type === 'distance' && m.points.length >= 2) {
        const p1 = m.points[0];
        const p2 = m.points[1];
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        drawMprCaliper(ctx, p1.x, p1.y, 3 / fitScale);
        drawMprCaliper(ctx, p2.x, p2.y, 3 / fitScale);

        if (m.distanceMm !== undefined) {
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          drawMprBadge(ctx, `${m.distanceMm.toFixed(1)} mm`, midX + 8 / fitScale, midY - 6 / fitScale, fitScale);
        }
      } else if (m.type === 'angle' && m.points.length >= 3) {
        const p1 = m.points[0];
        const p2 = m.points[1];
        const p3 = m.points[2];
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.stroke();

        drawMprCaliper(ctx, p1.x, p1.y, 2.5 / fitScale);
        drawMprCaliper(ctx, p2.x, p2.y, 3.5 / fitScale);
        drawMprCaliper(ctx, p3.x, p3.y, 2.5 / fitScale);

        if (m.angleDeg !== undefined) {
          drawMprBadge(ctx, `${m.angleDeg.toFixed(1)}°`, p2.x + 8 / fitScale, p2.y - 6 / fitScale, fitScale);
        }
      } else if (m.type === 'cobb_angle' && m.points.length >= 4) {
        const p1 = m.points[0];
        const p2 = m.points[1];
        const p3 = m.points[2];
        const p4 = m.points[3];

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.moveTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.stroke();

        drawMprCaliper(ctx, p1.x, p1.y, 2.5 / fitScale);
        drawMprCaliper(ctx, p2.x, p2.y, 2.5 / fitScale);
        drawMprCaliper(ctx, p3.x, p3.y, 2.5 / fitScale);
        drawMprCaliper(ctx, p4.x, p4.y, 2.5 / fitScale);

        if (m.cobbDeg !== undefined) {
          const midX = (p2.x + p4.x) / 2;
          const midY = (p2.y + p4.y) / 2;
          drawMprBadge(ctx, `Cobb: ${m.cobbDeg.toFixed(1)}°`, midX + 8 / fitScale, midY, fitScale, 'rgba(15, 23, 42, 0.88)', '#ec4899');
        }
      } else if (m.type === 'rectangle_roi' && m.points.length >= 2) {
        const p1 = m.points[0];
        const p2 = m.points[1];
        const left = Math.min(p1.x, p2.x);
        const top = Math.min(p1.y, p2.y);
        const w = Math.abs(p1.x - p2.x);
        const h = Math.abs(p1.y - p2.y);

        ctx.strokeRect(left, top, w, h);

        if (m.roiValues) {
          const text = `Area: ${m.roiValues.areaCm2.toFixed(2)} cm²\nMean: ${m.roiValues.meanHu.toFixed(1)} HU (±${m.roiValues.stdDevHu.toFixed(1)})\n[Min: ${m.roiValues.minHu} | Max: ${m.roiValues.maxHu}]`;
          drawMprBadge(ctx, text, left + w + 6 / fitScale, top, fitScale);
        }
      } else if (m.type === 'ellipse_roi' && m.points.length >= 2) {
        const p1 = m.points[0];
        const p2 = m.points[1];
        const cxE = (p1.x + p2.x) / 2;
        const cyE = (p1.y + p2.y) / 2;
        const rx = Math.abs(p1.x - p2.x) / 2;
        const ry = Math.abs(p1.y - p2.y) / 2;

        ctx.beginPath();
        ctx.ellipse(cxE, cyE, Math.max(1 / fitScale, rx), Math.max(1 / fitScale, ry), 0, 0, 2 * Math.PI);
        ctx.stroke();

        if (m.roiValues) {
          const text = `Area: ${m.roiValues.areaCm2.toFixed(2)} cm²\nMean: ${m.roiValues.meanHu.toFixed(1)} HU (±${m.roiValues.stdDevHu.toFixed(1)})\n[Min: ${m.roiValues.minHu} | Max: ${m.roiValues.maxHu}]`;
          drawMprBadge(ctx, text, cxE + rx + 6 / fitScale, cyE - ry, fitScale);
        }
      } else if (m.type === 'arrow' && m.points.length >= 2) {
        const p1 = m.points[0];
        const p2 = m.points[1];

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        const headLen = 12 / fitScale;
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p2.x - headLen * Math.cos(angle - Math.PI / 6), p2.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(p2.x - headLen * Math.cos(angle + Math.PI / 6), p2.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();

        if (m.arrowText) {
          drawMprBadge(ctx, m.arrowText, p2.x + 8 / fitScale, p2.y - 6 / fitScale, fitScale, 'rgba(15, 23, 42, 0.88)', '#f59e0b');
        }
      } else if (m.type === 'hu_probe' && m.points.length >= 1) {
        const p = m.points[0];
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 / fitScale, 0, 2 * Math.PI);
        ctx.fill();

        const label = `${m.probeHu !== undefined ? m.probeHu : 0} HU\n${m.tissueName || 'Tissue'}`;
        drawMprBadge(ctx, label, p.x + 8 / fitScale, p.y - 6 / fitScale, fitScale, 'rgba(15, 23, 42, 0.88)', '#10b981');
      }

      ctx.restore();
    });

    if (drawingPoints.length > 0) {
      ctx.save();
      ctx.lineWidth = 1.8 / fitScale;
      ctx.strokeStyle = '#38bdf8';
      ctx.fillStyle = '#38bdf8';
      ctx.setLineDash([4 / fitScale, 3 / fitScale]);

      if (activeTool === 'distance' && drawingPoints.length >= 2) {
        const p1 = drawingPoints[0];
        const p2 = drawingPoints[1];
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        const dx = (p2.x - p1.x) * slice.pixelSpacing[1];
        const dy = (p2.y - p1.y) * slice.pixelSpacing[0];
        const distMm = Math.sqrt(dx * dx + dy * dy);
        drawMprBadge(ctx, `${distMm.toFixed(1)} mm`, (p1.x + p2.x) / 2 + 8 / fitScale, (p1.y + p2.y) / 2 - 6 / fitScale, fitScale);
      } else if (activeTool === 'angle') {
        ctx.beginPath();
        ctx.moveTo(drawingPoints[0].x, drawingPoints[0].y);
        for (let i = 1; i < drawingPoints.length; i++) {
          ctx.lineTo(drawingPoints[i].x, drawingPoints[i].y);
        }
        ctx.stroke();
      } else if (activeTool === 'cobb_angle') {
        if (drawingPoints.length === 2) {
          ctx.beginPath();
          ctx.moveTo(drawingPoints[0].x, drawingPoints[0].y);
          ctx.lineTo(drawingPoints[1].x, drawingPoints[1].y);
          ctx.stroke();
        } else if (drawingPoints.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(drawingPoints[0].x, drawingPoints[0].y);
          ctx.lineTo(drawingPoints[1].x, drawingPoints[1].y);
          ctx.moveTo(drawingPoints[2].x, drawingPoints[2].y);
          if (drawingPoints[3]) ctx.lineTo(drawingPoints[3].x, drawingPoints[3].y);
          ctx.stroke();
        }
      } else if (activeTool === 'rectangle_roi' && drawingPoints.length >= 2) {
        const p1 = drawingPoints[0];
        const p2 = drawingPoints[1];
        const left = Math.min(p1.x, p2.x);
        const top = Math.min(p1.y, p2.y);
        const w = Math.abs(p1.x - p2.x);
        const h = Math.abs(p1.y - p2.y);
        ctx.strokeRect(left, top, w, h);
      } else if (activeTool === 'ellipse_roi' && drawingPoints.length >= 2) {
        const p1 = drawingPoints[0];
        const p2 = drawingPoints[1];
        const cxE = (p1.x + p2.x) / 2;
        const cyE = (p1.y + p2.y) / 2;
        const rx = Math.abs(p1.x - p2.x) / 2;
        const ry = Math.abs(p1.y - p2.y) / 2;

        ctx.beginPath();
        ctx.ellipse(cxE, cyE, Math.max(1 / fitScale, rx), Math.max(1 / fitScale, ry), 0, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (activeTool === 'arrow' && drawingPoints.length >= 2) {
        const p1 = drawingPoints[0];
        const p2 = drawingPoints[1];
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }

      ctx.restore();
    }

    ctx.restore();
  }, [volume, plane, crosshair, projectionMode, slabThicknessMm, windowCenter, windowWidth, lut, invert, showCrosshairs, lineColor, pan, zoom, measurements, drawingPoints, currentSliceIdx, rotationDeg, flipH, flipV]);

  useEffect(() => {
    renderMpr();
  }, [renderMpr]);

  // Real-time ResizeObserver guarantees the canvas internal buffer matches viewport dimensions exactly
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      renderMpr();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [renderMpr]);

  const getPlaneGeometry = useCallback(() => {
    if (!volume) return { width: 1, height: 1, scaleY: 1.0 };
    const dims = MprEngine.getSliceDimensions(volume, plane);
    return { width: dims.width, height: dims.height, scaleY: 1.0 };
  }, [volume, plane]);

  const screenToVolumeCoord = useCallback((clientX: number, clientY: number): Point2D | null => {
    if (!canvasRef.current || !volume || !containerRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const { width, height } = getPlaneGeometry();

    const isRotated90or270 = rotationDeg === 90 || rotationDeg === 270;
    const effWidth = isRotated90or270 ? height : width;
    const effHeight = isRotated90or270 ? width : height;
    const fitScale = Math.min(rect.width / effWidth, rect.height / effHeight) * zoom;
    if (fitScale <= 0) return null;

    let screenDx = clientX - rect.left - rect.width / 2 - pan.x;
    let screenDy = clientY - rect.top - rect.height / 2 - pan.y;

    if (rotationDeg !== 0) {
      const rad = (-rotationDeg * Math.PI) / 180;
      const cosR = Math.cos(rad);
      const sinR = Math.sin(rad);
      const rx = screenDx * cosR - screenDy * sinR;
      const ry = screenDx * sinR + screenDy * cosR;
      screenDx = rx;
      screenDy = ry;
    }

    if (flipH) screenDx = -screenDx;
    if (flipV) screenDy = -screenDy;

    const relX = screenDx / fitScale;
    const relY = screenDy / fitScale;

    return { x: relX, y: relY };
  }, [volume, getPlaneGeometry, zoom, pan, rotationDeg, flipH, flipV]);

  const checkNearCrosshair = useCallback((clientX: number, clientY: number): { near: boolean; part: 'hub' | 'horizontal' | 'vertical' } => {
    if (!canvasRef.current || !volume || !containerRef.current || !showCrosshairs) return { near: false, part: 'hub' };
    const rect = canvasRef.current.getBoundingClientRect();
    const { width, height } = getPlaneGeometry();

    const isRotated90or270 = rotationDeg === 90 || rotationDeg === 270;
    const effWidth = isRotated90or270 ? height : width;
    const effHeight = isRotated90or270 ? width : height;
    const fitScale = Math.min(rect.width / effWidth, rect.height / effHeight) * zoom;
    if (fitScale <= 0) return { near: false, part: 'hub' };

    let chX = 0;
    let chY = 0;
    if (plane === 'axial') {
      chX = (crosshair.x / Math.max(1, volume.dimX - 1)) * (width - 1) - width / 2;
      chY = (crosshair.y / Math.max(1, volume.dimY - 1)) * (height - 1) - height / 2;
    } else if (plane === 'coronal') {
      chX = (crosshair.x / Math.max(1, volume.dimX - 1)) * (width - 1) - width / 2;
      chY = (crosshair.z / Math.max(1, volume.dimZ - 1)) * (height - 1) - height / 2;
    } else {
      chX = (crosshair.y / Math.max(1, volume.dimY - 1)) * (width - 1) - width / 2;
      chY = (crosshair.z / Math.max(1, volume.dimZ - 1)) * (height - 1) - height / 2;
    }

    let rotChX = chX * fitScale;
    let rotChY = chY * fitScale;

    if (flipH) rotChX = -rotChX;
    if (flipV) rotChY = -rotChY;

    if (rotationDeg !== 0) {
      const rad = (rotationDeg * Math.PI) / 180;
      const cosR = Math.cos(rad);
      const sinR = Math.sin(rad);
      const rx = rotChX * cosR - rotChY * sinR;
      const ry = rotChX * sinR + rotChY * cosR;
      rotChX = rx;
      rotChY = ry;
    }

    const screenChX = rect.left + rect.width / 2 + pan.x + rotChX;
    const screenChY = rect.top + rect.height / 2 + pan.y + rotChY;

    // Check distance to center intersection hub (22px grab zone)
    const distToHub = Math.hypot(clientX - screenChX, clientY - screenChY);
    if (distToHub <= 22) return { near: true, part: 'hub' };

    // Distance to individual horizontal / vertical lines
    let localX = clientX - screenChX;
    let localY = clientY - screenChY;
    if (rotationDeg !== 0) {
      const rad = (-rotationDeg * Math.PI) / 180;
      const cosR = Math.cos(rad);
      const sinR = Math.sin(rad);
      const rx = localX * cosR - localY * sinR;
      const ry = localX * sinR + localY * cosR;
      localX = rx;
      localY = ry;
    }

    if (Math.abs(localY) <= 12) return { near: true, part: 'horizontal' };
    if (Math.abs(localX) <= 12) return { near: true, part: 'vertical' };

    return { near: false, part: 'hub' };
  }, [volume, plane, crosshair, showCrosshairs, getPlaneGeometry, zoom, pan, rotationDeg, flipH, flipV]);

  const updateCrosshairFromMouse = useCallback((clientX: number, clientY: number, part: 'hub' | 'horizontal' | 'vertical' = 'hub') => {
    if (!canvasRef.current || !volume || !containerRef.current) return;
    const pt = screenToVolumeCoord(clientX, clientY);
    if (!pt) return;

    const { width, height } = getPlaneGeometry();
    const clampedX = Math.max(0, Math.min(width - 1, Math.round(pt.x + width / 2)));
    const clampedY = Math.max(0, Math.min(height - 1, Math.round(pt.y + height / 2)));

    onUpdateCrosshair(prev => {
      if (plane === 'axial') {
        const u = clampedX / Math.max(1, width - 1);
        const v = clampedY / Math.max(1, height - 1);
        const newX = Math.round(u * (volume.dimX - 1));
        const newY = Math.round(v * (volume.dimY - 1));
        const nextX = part === 'horizontal' ? prev.x : newX;
        const nextY = part === 'vertical' ? prev.y : newY;
        if (prev.x === nextX && prev.y === nextY) return prev;
        return { ...prev, x: nextX, y: nextY };
      } else if (plane === 'coronal') {
        const u = clampedX / Math.max(1, width - 1);
        const v = clampedY / Math.max(1, height - 1);
        const newX = Math.round(u * (volume.dimX - 1));
        const newZ = Math.round(v * (volume.dimZ - 1));
        const nextX = part === 'horizontal' ? prev.x : newX;
        const nextZ = part === 'vertical' ? prev.z : newZ;
        if (prev.x === nextX && prev.z === nextZ) return prev;
        return { ...prev, x: nextX, z: nextZ };
      } else {
        // Sagittal: X in slice is Y in volume, Y in slice is Z in volume
        const u = clampedX / Math.max(1, width - 1);
        const v = clampedY / Math.max(1, height - 1);
        const newY = Math.round(u * (volume.dimY - 1));
        const newZ = Math.round(v * (volume.dimZ - 1));
        const nextY = part === 'horizontal' ? prev.y : newY;
        const nextZ = part === 'vertical' ? prev.z : newZ;
        if (prev.y === nextY && prev.z === nextZ) return prev;
        return { ...prev, y: nextY, z: nextZ };
      }
    });
  }, [volume, plane, screenToVolumeCoord, getPlaneGeometry, onUpdateCrosshair]);

  // Window-level mouse listener ensures uninterrupted, buttery-smooth crosshair drag
  useEffect(() => {
    if (!isCrosshairDragging) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      updateCrosshairFromMouse(e.clientX, e.clientY, crosshairDragPart);
    };

    const handleWindowMouseUp = () => {
      setIsCrosshairDragging(false);
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [isCrosshairDragging, crosshairDragPart, updateCrosshairFromMouse]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragBtn(e.button);
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitWc(windowCenter);
    setInitWw(windowWidth);
    setInitPan({ ...pan });
    setInitZoom(zoom);

    const pt = screenToVolumeCoord(e.clientX, e.clientY);

    if (e.button === 0) {
      const nearCh = checkNearCrosshair(e.clientX, e.clientY);
      // Immediately initiate crosshair dragging if clicked on/near crosshairs, or in crosshair tool mode, or with Shift
      if (activeTool === 'crosshair' || nearCh.near || e.shiftKey) {
        const part = nearCh.near ? nearCh.part : 'hub';
        setCrosshairDragPart(part);
        setIsCrosshairDragging(true);
        updateCrosshairFromMouse(e.clientX, e.clientY, part);
        return;
      }

      if (activeTool === 'distance' || activeTool === 'rectangle_roi' || activeTool === 'ellipse_roi' || activeTool === 'arrow') {
        if (pt) setDrawingPoints([pt, pt]);
      } else if (activeTool === 'angle') {
        if (!pt) return;
        if (drawingPoints.length === 0) {
          setDrawingPoints([pt]);
        } else if (drawingPoints.length === 1) {
          setDrawingPoints([drawingPoints[0], pt]);
        } else if (drawingPoints.length === 2) {
          const p1 = drawingPoints[0];
          const p2 = drawingPoints[1];
          const p3 = pt;
          const v1x = p1.x - p2.x;
          const v1y = p1.y - p2.y;
          const v2x = p3.x - p2.x;
          const v2y = p3.y - p2.y;
          const dot = v1x * v2x + v1y * v2y;
          const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
          const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
          const angleRad = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2 || 1))));
          const angleDeg = (angleRad * 180) / Math.PI;

          onAddMeasurement({
            id: `mpr_angle_${Date.now()}`,
            plane,
            sliceIndex: currentSliceIdx,
            type: 'angle',
            points: [p1, p2, p3],
            angleDeg,
            color: '#f59e0b'
          });
          setDrawingPoints([]);
        }
      } else if (activeTool === 'cobb_angle') {
        if (!pt) return;
        if (drawingPoints.length < 3) {
          setDrawingPoints(prev => [...prev, pt]);
        } else if (drawingPoints.length === 3) {
          const p1 = drawingPoints[0];
          const p2 = drawingPoints[1];
          const p3 = drawingPoints[2];
          const p4 = pt;

          const theta1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const theta2 = Math.atan2(p4.y - p3.y, p4.x - p3.x);
          let diffRad = Math.abs(theta1 - theta2);
          if (diffRad > Math.PI) diffRad = 2 * Math.PI - diffRad;
          let cobbDeg = (diffRad * 180) / Math.PI;
          if (cobbDeg > 90) cobbDeg = 180 - cobbDeg;

          onAddMeasurement({
            id: `mpr_cobb_${Date.now()}`,
            plane,
            sliceIndex: currentSliceIdx,
            type: 'cobb_angle',
            points: [p1, p2, p3, p4],
            cobbDeg,
            color: '#ec4899'
          });
          setDrawingPoints([]);
        }
      } else if (activeTool === 'hu_probe') {
        if (!pt || !volume) return;
        const slice = MprEngine.getSlice(volume, plane, crosshair, projectionMode, slabThicknessMm);
        const ix = Math.floor(pt.x + slice.width / 2);
        const iy = Math.floor(pt.y + slice.height / 2);
        if (ix >= 0 && ix < slice.width && iy >= 0 && iy < slice.height) {
          const huVal = slice.huData[iy * slice.width + ix];
          const tissue = classifyTissueFromHu(huVal);
          onAddMeasurement({
            id: `mpr_probe_${Date.now()}`,
            plane,
            sliceIndex: currentSliceIdx,
            type: 'hu_probe',
            points: [pt],
            probeHu: huVal,
            tissueName: tissue.name,
            color: '#10b981'
          });
        }
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isCrosshairDragging) {
      setIsHoveringCrosshair(checkNearCrosshair(e.clientX, e.clientY).near);
    }

    const pt = screenToVolumeCoord(e.clientX, e.clientY);
    if (pt && volume && !isCrosshairDragging) {
      const { width, height } = getPlaneGeometry();
      const ix = Math.floor(pt.x + width / 2);
      const iy = Math.floor(pt.y + height / 2);
      let huVal: number | null = null;
      let tissueName: string | undefined;
      if (ix >= 0 && ix < width && iy >= 0 && iy < height) {
        let voxelVal: number | null = null;
        if (plane === 'axial') {
          const z = Math.max(0, Math.min(volume.dimZ - 1, Math.round(crosshair.z)));
          voxelVal = volume.data[z * volume.dimX * volume.dimY + iy * volume.dimX + ix];
        } else if (plane === 'coronal') {
          const y = Math.max(0, Math.min(volume.dimY - 1, Math.round(crosshair.y)));
          const z = Math.max(0, Math.min(volume.dimZ - 1, Math.round((iy / Math.max(1, height - 1)) * (volume.dimZ - 1))));
          voxelVal = volume.data[z * volume.dimX * volume.dimY + y * volume.dimX + ix];
        } else {
          const x = Math.max(0, Math.min(volume.dimX - 1, Math.round(crosshair.x)));
          const z = Math.max(0, Math.min(volume.dimZ - 1, Math.round((iy / Math.max(1, height - 1)) * (volume.dimZ - 1))));
          voxelVal = volume.data[z * volume.dimX * volume.dimY + ix * volume.dimX + x];
        }
        if (voxelVal !== null) {
          huVal = voxelVal;
          tissueName = classifyTissueFromHu(voxelVal).name;
        }
      }
      setMouseCoord({ x: Math.round(pt.x), y: Math.round(pt.y), hu: huVal, tissue: tissueName });
    }

    if (isCrosshairDragging) {
      updateCrosshairFromMouse(e.clientX, e.clientY, crosshairDragPart);
      return;
    }

    if (!isDragging) return;

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    if (dragBtn === 2 || (dragBtn === 0 && activeTool === 'ww_wl')) {
      onUpdateWindowing(
        Math.round(initWc - dy * 2),
        Math.max(1, Math.round(initWw + dx * 2))
      );
    } else if (dragBtn === 1 || (dragBtn === 0 && activeTool === 'pan')) {
      setPan({ x: initPan.x + dx, y: initPan.y + dy });
    } else if (dragBtn === 0 && activeTool === 'zoom') {
      const factor = Math.exp(-dy * 0.01);
      setZoom(Math.max(0.3, Math.min(10, initZoom * factor)));
    } else if (dragBtn === 0 && (activeTool === 'crosshair' || e.shiftKey)) {
      updateCrosshairFromMouse(e.clientX, e.clientY);
    } else if (dragBtn === 0 && (activeTool === 'distance' || activeTool === 'rectangle_roi' || activeTool === 'ellipse_roi' || activeTool === 'arrow') && drawingPoints.length > 0) {
      if (pt) setDrawingPoints([drawingPoints[0], pt]);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    setIsCrosshairDragging(false);
    if (!isDragging) return;
    setIsDragging(false);

    if (dragBtn === 0 && volume) {
      const slice = MprEngine.getSlice(volume, plane, crosshair, projectionMode, slabThicknessMm);

      if (activeTool === 'distance' && drawingPoints.length >= 2) {
        const p1 = drawingPoints[0];
        const p2 = drawingPoints[1];
        const dx = (p2.x - p1.x) * slice.pixelSpacing[1];
        const dy = (p2.y - p1.y) * slice.pixelSpacing[0];
        const distanceMm = Math.sqrt(dx * dx + dy * dy);

        if (distanceMm > 0.5) {
          onAddMeasurement({
            id: `mpr_dist_${Date.now()}`,
            plane,
            sliceIndex: currentSliceIdx,
            type: 'distance',
            points: [p1, p2],
            distanceMm,
            color: '#38bdf8'
          });
        }
        setDrawingPoints([]);
      } else if (activeTool === 'rectangle_roi' && drawingPoints.length >= 2) {
        const p1 = drawingPoints[0];
        const p2 = drawingPoints[1];
        if (Math.abs(p1.x - p2.x) > 2 || Math.abs(p1.y - p2.y) > 2) {
          const roi = calculateSliceRectangleRoi(p1, p2, slice);
          if (roi) {
            onAddMeasurement({
              id: `mpr_rect_${Date.now()}`,
              plane,
              sliceIndex: currentSliceIdx,
              type: 'rectangle_roi',
              points: [p1, p2],
              roiValues: roi,
              color: '#38bdf8'
            });
          }
        }
        setDrawingPoints([]);
      } else if (activeTool === 'ellipse_roi' && drawingPoints.length >= 2) {
        const p1 = drawingPoints[0];
        const p2 = drawingPoints[1];
        if (Math.abs(p1.x - p2.x) > 2 || Math.abs(p1.y - p2.y) > 2) {
          const roi = calculateSliceEllipseRoi(p1, p2, slice);
          if (roi) {
            onAddMeasurement({
              id: `mpr_ellipse_${Date.now()}`,
              plane,
              sliceIndex: currentSliceIdx,
              type: 'ellipse_roi',
              points: [p1, p2],
              roiValues: roi,
              color: '#38bdf8'
            });
          }
        }
        setDrawingPoints([]);
      } else if (activeTool === 'arrow' && drawingPoints.length >= 2) {
        const p1 = drawingPoints[0];
        const p2 = drawingPoints[1];
        if (Math.abs(p1.x - p2.x) > 2 || Math.abs(p1.y - p2.y) > 2) {
          const note = window.prompt('Enter lesion label or finding note (e.g. Lesion, Nodule, Fracture):', 'Lesion');
          onAddMeasurement({
            id: `mpr_arrow_${Date.now()}`,
            plane,
            sliceIndex: currentSliceIdx,
            type: 'arrow',
            points: [p1, p2],
            arrowText: note && note.trim() ? note.trim() : 'Lesion',
            color: '#f59e0b'
          });
        }
        setDrawingPoints([]);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!volume) return;

    if (e.ctrlKey) {
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(prev => Math.max(0.3, Math.min(10, prev * factor)));
      return;
    }

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

  const mprScrollTrackRef = useRef<HTMLDivElement>(null);
  const [isMprScrollDragging, setIsMprScrollDragging] = useState(false);
  const [isMprScrollHovered, setIsMprScrollHovered] = useState(false);
  const [mprScrollTooltipY, setMprScrollTooltipY] = useState<number | null>(null);
  const [mprScrollTooltipIdx, setMprScrollTooltipIdx] = useState<number | null>(null);
  const mprStepIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mprStepTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setPlaneSlice = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(totalSlices - 1, idx));
    onUpdateCrosshair(prev => {
      if (plane === 'axial') return { ...prev, z: clamped };
      if (plane === 'coronal') return { ...prev, y: clamped };
      return { ...prev, x: clamped };
    });
  }, [plane, totalSlices, onUpdateCrosshair]);

  const handleMprScrollToY = useCallback((clientY: number) => {
    if (!mprScrollTrackRef.current || totalSlices <= 1) return;
    const rect = mprScrollTrackRef.current.getBoundingClientRect();
    const relativeY = Math.max(0, Math.min(rect.height, clientY - rect.top));
    const ratio = rect.height > 0 ? relativeY / rect.height : 0;
    const targetIdx = Math.max(0, Math.min(totalSlices - 1, Math.round(ratio * (totalSlices - 1))));
    setPlaneSlice(targetIdx);
    setMprScrollTooltipY(relativeY);
    setMprScrollTooltipIdx(targetIdx);
  }, [totalSlices, setPlaneSlice]);

  const handleMprTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setIsMprScrollDragging(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    handleMprScrollToY(e.clientY);
  };

  const handleMprTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isMprScrollDragging) {
      e.stopPropagation();
      e.preventDefault();
      handleMprScrollToY(e.clientY);
    } else if (mprScrollTrackRef.current) {
      const rect = mprScrollTrackRef.current.getBoundingClientRect();
      const relativeY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      const ratio = rect.height > 0 ? relativeY / rect.height : 0;
      const hoverIdx = Math.max(0, Math.min(totalSlices - 1, Math.round(ratio * (totalSlices - 1))));
      setMprScrollTooltipY(relativeY);
      setMprScrollTooltipIdx(hoverIdx);
    }
  };

  const handleMprTrackPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isMprScrollDragging) {
      e.stopPropagation();
      setIsMprScrollDragging(false);
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    }
  };

  const stopMprStepScroll = useCallback(() => {
    if (mprStepTimeoutRef.current) { clearTimeout(mprStepTimeoutRef.current); mprStepTimeoutRef.current = null; }
    if (mprStepIntervalRef.current) { clearInterval(mprStepIntervalRef.current); mprStepIntervalRef.current = null; }
  }, []);

  const startMprStepScroll = useCallback((delta: number) => {
    if (totalSlices <= 1) return;
    const nextIdx = Math.max(0, Math.min(totalSlices - 1, currentSliceIdx + delta));
    setPlaneSlice(nextIdx);
    stopMprStepScroll();
    let current = nextIdx;
    mprStepTimeoutRef.current = setTimeout(() => {
      mprStepIntervalRef.current = setInterval(() => {
        current = Math.max(0, Math.min(totalSlices - 1, current + delta));
        setPlaneSlice(current);
      }, 70);
    }, 250);
  }, [totalSlices, currentSliceIdx, setPlaneSlice, stopMprStepScroll]);

  useEffect(() => { return () => { stopMprStepScroll(); }; }, [stopMprStepScroll]);

  const getCursorClass = () => {
    if (isCrosshairDragging || isHoveringCrosshair) return 'cursor-move';
    if (activeTool === 'pan') return 'cursor-grab active:cursor-grabbing';
    if (activeTool === 'zoom') return 'cursor-zoom-in';
    if (activeTool === 'ww_wl') return 'cursor-ew-resize';
    if (activeTool === 'hu_probe') return 'cursor-crosshair';
    if (activeTool === 'crosshair') return 'cursor-crosshair';
    return 'cursor-crosshair';
  };

  const thumbPercent = Math.max(6, Math.min(30, (1 / totalSlices) * 100));
  const thumbTopPercent = totalSlices > 1 ? (currentSliceIdx / (totalSlices - 1)) * (100 - thumbPercent) : 0;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative w-full h-full bg-black border border-radiant-border overflow-hidden select-none group ${getCursorClass()}`}
    >
      <canvas ref={canvasRef} className="w-full h-full" />

      <div className="absolute top-2.5 left-3 radiant-overlay-text flex items-center gap-2 z-20">
        <span className={`font-bold text-xs ${labelColor} flex items-center gap-1.5`}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: lineColor }}></span>
          <span>{title}</span>
        </span>
        {projectionMode !== 'none' && (
          <span className="px-1.5 py-0.2 bg-purple-900/70 text-purple-300 rounded text-[10px] font-bold uppercase border border-purple-500/40">
            {projectionMode} ({slabThicknessMm.toFixed(1)}mm)
          </span>
        )}

        {/* Viewport 90° Rotation & Flip Quick Actions */}
        <div className="flex items-center gap-0.5 bg-black/60 px-1 py-0.5 rounded border border-slate-700/60 shadow opacity-80 hover:opacity-100 transition-opacity">
          <button
            onClick={handleRotateCcw}
            title="Rotate 90° Counter-Clockwise"
            className="p-1 hover:bg-slate-800 text-slate-300 hover:text-cyan-400 rounded transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
          <button
            onClick={handleRotateCw}
            title="Rotate 90° Clockwise"
            className="p-1 hover:bg-slate-800 text-slate-300 hover:text-cyan-400 rounded transition-colors"
          >
            <RotateCw className="w-3 h-3" />
          </button>
          <button
            onClick={handleToggleFlipH}
            title="Flip Horizontally"
            className={`p-1 hover:bg-slate-800 rounded transition-colors ${flipH ? 'text-cyan-400 bg-cyan-950/50' : 'text-slate-300'}`}
          >
            <FlipHorizontal className="w-3 h-3" />
          </button>
          <button
            onClick={handleToggleFlipV}
            title="Flip Vertically"
            className={`p-1 hover:bg-slate-800 rounded transition-colors ${flipV ? 'text-cyan-400 bg-cyan-950/50' : 'text-slate-300'}`}
          >
            <FlipVertical className="w-3 h-3" />
          </button>
          {(rotationDeg !== 0 || flipH || flipV) && (
            <button
              onClick={handleResetOrientation}
              title="Reset Rotation & Flip"
              className="px-1 text-[10px] text-amber-400 font-bold hover:underline"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Anatomical Compass Orientation Markers */}
      <div className="pointer-events-none absolute top-1.5 left-1/2 -translate-x-1/2 z-20">
        <span className="px-1.5 py-0.2 bg-black/80 rounded text-[10.5px] font-bold font-mono text-cyan-300 border border-slate-700/60 shadow">
          {compass.top}
        </span>
      </div>
      <div className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 z-20">
        <span className="px-1.5 py-0.2 bg-black/80 rounded text-[10.5px] font-bold font-mono text-cyan-300 border border-slate-700/60 shadow">
          {compass.bottom}
        </span>
      </div>
      <div className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 z-20">
        <span className="px-1.5 py-0.2 bg-black/80 rounded text-[10.5px] font-bold font-mono text-cyan-300 border border-slate-700/60 shadow">
          {compass.left}
        </span>
      </div>
      <div className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 z-20">
        <span className="px-1.5 py-0.2 bg-black/80 rounded text-[10.5px] font-bold font-mono text-cyan-300 border border-slate-700/60 shadow">
          {compass.right}
        </span>
      </div>

      <div className="absolute top-2.5 right-3 radiant-overlay-text flex items-center gap-2">
        {mouseCoord.hu !== null && (
          <span className="text-rose-300 font-mono font-bold text-[11px] bg-slate-950/80 px-2 py-0.5 rounded border border-rose-500/40 shadow">
            {mouseCoord.hu} HU {mouseCoord.tissue ? `• ${mouseCoord.tissue}` : ''}
          </span>
        )}
        <button
          onClick={onToggleMaximize}
          className="p-1 bg-radiant-panel/80 hover:bg-radiant-hover text-slate-300 rounded border border-radiant-border opacity-0 group-hover:opacity-100 transition-opacity"
          title={isMaximized ? 'Restore View' : 'Maximize'}
        >
          {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className="absolute bottom-2.5 left-3 radiant-overlay-text text-[10.5px] text-slate-400 font-mono flex items-center gap-2">
        <div>Zoom: {Math.round(zoom * 100)}%</div>
        <span>•</span>
        <div className="text-cyan-400 font-bold uppercase">{activeTool.replace('_', ' ')}</div>
      </div>

      <div className="absolute bottom-2.5 right-3 radiant-overlay-text text-[11px] text-cyan-300 font-mono font-bold">
        {plane === 'axial' && `Z: ${crosshair.z + 1} / ${volume?.dimZ || 1}`}
        {plane === 'coronal' && `Y: ${crosshair.y + 1} / ${volume?.dimY || 1}`}
        {plane === 'sagittal' && `X: ${crosshair.x + 1} / ${volume?.dimX || 1}`}
      </div>

      {volume && totalSlices > 1 && (
        <div
          className="absolute right-1.5 top-12 bottom-12 w-6 flex flex-col items-center z-30 select-none pointer-events-auto rounded-full bg-slate-950/70 border border-slate-700/60 backdrop-blur-md shadow-2xl p-0.5"
          onMouseEnter={() => setIsMprScrollHovered(true)}
          onMouseLeave={() => { setIsMprScrollHovered(false); setMprScrollTooltipIdx(null); setMprScrollTooltipY(null); }}
        >
          <button
            onClick={() => setPlaneSlice(currentSliceIdx - 1)}
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); startMprStepScroll(-1); }}
            onMouseUp={stopMprStepScroll}
            onMouseLeave={stopMprStepScroll}
            className={`w-full h-5 flex items-center justify-center rounded-t-full bg-slate-800/80 hover:bg-cyan-600 text-slate-300 hover:text-white transition-colors ${currentSliceIdx <= 0 ? 'opacity-25 cursor-not-allowed' : 'cursor-pointer active:scale-90'}`}
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>

          <div
            ref={mprScrollTrackRef}
            onPointerDown={handleMprTrackPointerDown}
            onPointerMove={handleMprTrackPointerMove}
            onPointerUp={handleMprTrackPointerUp}
            className="relative flex-1 w-full my-1 rounded cursor-pointer group/track"
          >
            <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-0.5 bg-slate-700/50 group-hover/track:bg-cyan-500/40 transition-colors" />

            <div
              className="absolute left-0 right-0 rounded-full transition-colors bg-cyan-500/80 hover:bg-cyan-400 shadow-lg cursor-grab active:cursor-grabbing"
              style={{ top: `${thumbTopPercent}%`, height: `${thumbPercent}%` }}
            />

            {/* Live Tooltip Floating next to scrollbar */}
            {(isMprScrollHovered || isMprScrollDragging) && (
              <div
                style={{
                  top: mprScrollTooltipY !== null ? `${mprScrollTooltipY}px` : `${thumbTopPercent + thumbPercent / 2}%`,
                  transform: 'translateY(-50%)'
                }}
                className="absolute right-7 pointer-events-none z-40 bg-slate-950/95 border border-cyan-500 text-cyan-300 px-2 py-1 rounded-md shadow-2xl backdrop-blur-md whitespace-nowrap text-left text-[11px] font-mono flex flex-col gap-0.5"
              >
                <div className="font-bold text-white flex items-center gap-1.5">
                  <span className="text-cyan-400 font-semibold">{plane.toUpperCase()}:</span>
                  <span className="text-amber-300">{(mprScrollTooltipIdx !== null ? mprScrollTooltipIdx : currentSliceIdx) + 1}</span>
                  <span className="text-slate-400">/ {totalSlices}</span>
                </div>
              </div>
            )}
          </div>

            {/* Step Down */}
            <button
              type="button"
              title="Next Slice (Step Down)"
              disabled={currentSliceIdx >= totalSlices - 1}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                startMprStepScroll(1);
              }}
              onMouseUp={stopMprStepScroll}
              onMouseLeave={stopMprStepScroll}
              className={`w-full h-5 flex items-center justify-center rounded-b-full bg-slate-800/80 hover:bg-cyan-600 text-slate-300 hover:text-white transition-colors ${
                currentSliceIdx >= totalSlices - 1 ? 'opacity-25 cursor-not-allowed' : 'cursor-pointer active:scale-90'
              }`}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
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
  showCrosshairs?: boolean;
  yaw: number;
  pitch: number;
  onUpdateRotation: (yaw: number, pitch: number) => void;
  onToggleMaximize: () => void;
  isMaximized: boolean;
}

const Mpr3dVolumeViewport: React.FC<Mpr3dVolumeViewportProps> = ({
  volume,
  crosshair,
  showCrosshairs = true,
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

    // Draw 3D Crosshair Cut Planes and Cursor in perspective space (< 0.02ms)
    if (showCrosshairs && showCutPlanes) {
      draw3dCutPlanes(ctx, displayWidth, displayHeight, volume, crosshair, yaw, pitch, zoom3D, pan3D);
    }

    // 3D Orientation Cube
    draw3dOrientationCube(ctx, displayWidth - 42, 42, yaw, pitch);

    ctx.restore();
  }, [volume, crosshair, zoom3D, pan3D, yaw, pitch, showCrosshairs, showCutPlanes]);

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
    onUpdateRotation(20, -15);
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

      {/* Top-Left Header: 3D Scout Title + Preset Selector + Cut Planes Toggle */}
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

        {/* Toggle 3D Cut Planes & Cursor Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowCutPlanes(!showCutPlanes);
          }}
          className={`px-2 py-0.5 rounded border text-[10.5px] font-semibold transition-colors flex items-center gap-1 ${
            showCutPlanes && showCrosshairs
              ? 'bg-cyan-900/50 border-cyan-400/80 text-cyan-300'
              : 'bg-black/50 border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle 3D Cursor & Crosshair Reference Cut Planes"
        >
          {showCutPlanes && showCrosshairs ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          <span>3D Planes</span>
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
 * Superimpose 3D Orthogonal Cut Planes (Axial, Coronal, Sagittal) and 3D Crosshair Cursor in perspective 3D space
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
  const physDimX = dimX * spacingX;
  const physDimY = dimY * spacingY;
  const physDimZ = dimZ * spacingZ;
  const maxPhysDim = Math.max(physDimX, physDimY, physDimZ);
  const minDim = Math.min(width, height);

  const radYaw = (yawDeg * Math.PI) / 180;
  const radPitch = (pitchDeg * Math.PI) / 180;
  const cosY = Math.cos(radYaw);
  const sinY = Math.sin(radYaw);
  const cosP = Math.cos(radPitch);
  const sinP = Math.sin(radPitch);

  const projectPoint = (vx: number, vy: number, vz: number) => {
    const rx = (vx - dimX / 2) * spacingX;
    const ry = (vy - dimY / 2) * spacingY;
    const rz = (vz - dimZ / 2) * spacingZ;

    const sy = ry * cosP + rz * sinP;
    const rz1 = -ry * sinP + rz * cosP;
    const sx = rx * cosY + rz1 * sinY;

    return {
      x: width / 2 + pan.x + (sx / maxPhysDim) * minDim * zoom,
      y: height / 2 + pan.y + (sy / maxPhysDim) * minDim * zoom
    };
  };

  const drawQuad = (
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    strokeColor: string,
    fillColor: string
  ) => {
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.3;
    ctx.stroke();
  };

  const cz = Math.max(0, Math.min(dimZ - 1, crosshair.z));
  const cy = Math.max(0, Math.min(dimY - 1, crosshair.y));
  const cx = Math.max(0, Math.min(dimX - 1, crosshair.x));

  // 1. Axial Cut Plane (Cyan Z-Plane - matches Axial label #38bdf8)
  const a0 = projectPoint(0, 0, cz);
  const a1 = projectPoint(dimX - 1, 0, cz);
  const a2 = projectPoint(dimX - 1, dimY - 1, cz);
  const a3 = projectPoint(0, dimY - 1, cz);
  drawQuad(a0, a1, a2, a3, '#38bdf8', 'rgba(56, 189, 248, 0.16)');

  // 2. Coronal Cut Plane (Amber Y-Plane - matches Coronal label #f59e0b)
  const c0 = projectPoint(0, cy, 0);
  const c1 = projectPoint(dimX - 1, cy, 0);
  const c2 = projectPoint(dimX - 1, cy, dimZ - 1);
  const c3 = projectPoint(0, cy, dimZ - 1);
  drawQuad(c0, c1, c2, c3, '#f59e0b', 'rgba(245, 158, 11, 0.16)');

  // 3. Sagittal Cut Plane (Emerald X-Plane - matches Sagittal label #10b981)
  const s0 = projectPoint(cx, 0, 0);
  const s1 = projectPoint(cx, dimY - 1, 0);
  const s2 = projectPoint(cx, dimY - 1, dimZ - 1);
  const s3 = projectPoint(cx, 0, dimZ - 1);
  drawQuad(s0, s1, s2, s3, '#10b981', 'rgba(16, 185, 129, 0.16)');

  // 4. Dashed intersection lines through the crosshair
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);

  // X-axis intersection line (Axial & Coronal)
  const lineX0 = projectPoint(0, cy, cz);
  const lineX1 = projectPoint(dimX - 1, cy, cz);
  ctx.strokeStyle = '#38bdf8';
  ctx.beginPath();
  ctx.moveTo(lineX0.x, lineX0.y);
  ctx.lineTo(lineX1.x, lineX1.y);
  ctx.stroke();

  // Y-axis intersection line (Axial & Sagittal)
  const lineY0 = projectPoint(cx, 0, cz);
  const lineY1 = projectPoint(cx, dimY - 1, cz);
  ctx.strokeStyle = '#f59e0b';
  ctx.beginPath();
  ctx.moveTo(lineY0.x, lineY0.y);
  ctx.lineTo(lineY1.x, lineY1.y);
  ctx.stroke();

  // Z-axis intersection line (Coronal & Sagittal)
  const lineZ0 = projectPoint(cx, cy, 0);
  const lineZ1 = projectPoint(cx, cy, dimZ - 1);
  ctx.strokeStyle = '#10b981';
  ctx.beginPath();
  ctx.moveTo(lineZ0.x, lineZ0.y);
  ctx.lineTo(lineZ1.x, lineZ1.y);
  ctx.stroke();

  ctx.restore();

  // 5. 3D Crosshair Reticle / Cursor Marker at Center of Planes
  const centerPt = projectPoint(cx, cy, cz);

  ctx.save();
  // Outer subtle glow halo
  ctx.beginPath();
  ctx.arc(centerPt.x, centerPt.y, 11, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(6, 182, 212, 0.25)';
  ctx.fill();

  // Outer ring
  ctx.beginPath();
  ctx.arc(centerPt.x, centerPt.y, 7, 0, 2 * Math.PI);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Crosshair arms / ticks (white)
  const tickLen = 14;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  // Top
  ctx.moveTo(centerPt.x, centerPt.y - 8);
  ctx.lineTo(centerPt.x, centerPt.y - tickLen);
  // Bottom
  ctx.moveTo(centerPt.x, centerPt.y + 8);
  ctx.lineTo(centerPt.x, centerPt.y + tickLen);
  // Left
  ctx.moveTo(centerPt.x - 8, centerPt.y);
  ctx.lineTo(centerPt.x - tickLen, centerPt.y);
  // Right
  ctx.moveTo(centerPt.x + 8, centerPt.y);
  ctx.lineTo(centerPt.x + tickLen, centerPt.y);
  ctx.stroke();

  // Inner bright bullseye dot
  ctx.beginPath();
  ctx.arc(centerPt.x, centerPt.y, 3, 0, 2 * Math.PI);
  ctx.fillStyle = '#38bdf8';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
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
