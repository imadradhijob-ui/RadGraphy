import React, { useState } from 'react';
import {
  SunMedium,
  Move,
  ZoomIn,
  Search,
  Ruler,
  Compass,
  Heart,
  Activity,
  Square,
  Circle,
  Target,
  Trash2,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Eye,
  Grid,
  Palette,
  Sparkles,
  Layers,
  Box,
  Play,
  Pause,
  Server,
  Disc,
  Download,
  ChevronDown,
  Wand2,
  Bookmark,
  FileText,
  Link2
} from 'lucide-react';
import { ColorLutType, GridLayout, ImageFilterType, MipMode, SyncMode, ToolType } from '../types/dicom';
import { DEFAULT_WINDOW_PRESETS } from '../services/windowPresets';
import { LUT_PRESETS } from '../services/lutService';

interface ToolbarProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  onRotate: () => void;
  onFlipH: () => void;
  onFlipV: () => void;
  onInvert: () => void;
  currentGrid: GridLayout;
  onSetGrid: (grid: GridLayout) => void;
  currentLut: ColorLutType;
  onSetLut: (lut: ColorLutType) => void;
  currentFilter?: ImageFilterType;
  onSetFilter?: (filter: ImageFilterType) => void;
  syncMode?: SyncMode;
  onSetSyncMode?: (mode: SyncMode) => void;
  currentMipMode: MipMode;
  currentMipSlab: number;
  onSetMip: (mode: MipMode, slab: number) => void;
  isMprActive: boolean;
  onToggleMpr: () => void;
  onOpen3D?: () => void;
  isCinePlaying: boolean;
  onToggleCine: () => void;
  currentWindowCenter?: number;
  currentWindowWidth?: number;
  onApplyWindowPreset: (wc: number, ww: number) => void;
  onClearMeasurements: () => void;
  onOpenPacs: () => void;
  onOpenDicomDir: () => void;
  onOpenExport: () => void;
  bookmarksCount?: number;
  onOpenBookmarks?: () => void;
  onOpenReport?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  onSelectTool,
  onRotate,
  onFlipH,
  onFlipV,
  onInvert,
  currentGrid,
  onSetGrid,
  currentLut,
  onSetLut,
  currentFilter = 'none',
  onSetFilter,
  syncMode = 'none',
  onSetSyncMode,
  currentMipMode,
  currentMipSlab,
  onSetMip,
  isMprActive,
  onToggleMpr,
  onOpen3D,
  isCinePlaying,
  onToggleCine,
  currentWindowCenter,
  currentWindowWidth,
  onApplyWindowPreset,
  onClearMeasurements,
  onOpenPacs,
  onOpenDicomDir,
  onOpenExport,
  bookmarksCount = 0,
  onOpenBookmarks,
  onOpenReport
}) => {
  const [showGridMenu, setShowGridMenu] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [showLutMenu, setShowLutMenu] = useState(false);
  const [showMipMenu, setShowMipMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showSyncMenu, setShowSyncMenu] = useState(false);

  const isAnyMenuOpen = showGridMenu || showPresetMenu || showLutMenu || showMipMenu || showFilterMenu || showSyncMenu;
  const closeAllMenus = () => {
    setShowGridMenu(false);
    setShowPresetMenu(false);
    setShowLutMenu(false);
    setShowMipMenu(false);
    setShowFilterMenu(false);
    setShowSyncMenu(false);
  };

  const toolBtnClass = (tool: ToolType) =>
    `flex flex-col items-center justify-center w-12 h-12 rounded transition-all select-none text-[10.5px] gap-1 ${
      activeTool === tool
        ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-400/80 shadow-[0_0_8px_rgba(0,180,216,0.3)] font-bold'
        : 'hover:bg-radiant-hover text-slate-300 border border-transparent'
    }`;

  const actionBtnClass =
    'flex flex-col items-center justify-center w-12 h-12 rounded transition-all select-none text-[10.5px] gap-1 hover:bg-radiant-hover text-slate-300 border border-transparent';

  return (
    <>
      {/* Invisible backdrop to dismiss open dropdowns on outside click */}
      {isAnyMenuOpen && (
        <div className="fixed inset-0 z-30 bg-transparent" onClick={closeAllMenus} />
      )}

      <div className="h-14 bg-radiant-panel border-b border-radiant-border flex items-center px-3 gap-1.5 relative z-30 overflow-visible select-none shrink-0">
        {/* 1. Main Navigation Tools (Windowing, Pan, Zoom, Loupe) */}
        <div className="flex items-center gap-1 pr-2 border-r border-radiant-border">
          <button
            onClick={() => onSelectTool('ww_wl')}
            title="Window Center / Width [W]"
            className={toolBtnClass('ww_wl')}
          >
            <SunMedium className="w-4 h-4 text-amber-400" />
            <span>Window</span>
          </button>

          <button
            onClick={() => onSelectTool('pan')}
            title="Pan Medical Image [P]"
            className={toolBtnClass('pan')}
          >
            <Move className="w-4 h-4 text-emerald-400" />
            <span>Pan</span>
          </button>

          <button
            onClick={() => onSelectTool('zoom')}
            title="Smooth Zoom [Z]"
            className={toolBtnClass('zoom')}
          >
            <ZoomIn className="w-4 h-4 text-cyan-400" />
            <span>Zoom</span>
          </button>

          <button
            onClick={() => onSelectTool('loupe')}
            title="Diagnostic Magnifying Loupe Lens [L]"
            className={toolBtnClass('loupe')}
          >
            <Search className="w-4 h-4 text-sky-300" />
            <span>Loupe</span>
          </button>
        </div>

        {/* 2. Measurement & Annotation Tools */}
        <div className="flex items-center gap-1 px-2 border-r border-radiant-border">
          <button
            onClick={() => onSelectTool('distance')}
            title="Calibrated Distance Caliper [D]"
            className={toolBtnClass('distance')}
          >
            <Ruler className="w-4 h-4 text-sky-400" />
            <span>Length</span>
          </button>

          <button
            onClick={() => onSelectTool('ctr')}
            title="Cardiothoracic Ratio (CTR) Measurement Tool"
            className={toolBtnClass('ctr')}
          >
            <Heart className="w-4 h-4 text-rose-400" />
            <span>CTR</span>
          </button>

          <button
            onClick={() => onSelectTool('angle')}
            title="Cobb / 3-Point Angle [A]"
            className={toolBtnClass('angle')}
          >
            <Compass className="w-4 h-4 text-emerald-400" />
            <span>Angle</span>
          </button>

          <button
            onClick={() => onSelectTool('cobb_angle')}
            title="Cobb Angle 4-Point Spinal Alignment"
            className={toolBtnClass('cobb_angle')}
          >
            <Activity className="w-4 h-4 text-amber-400" />
            <span>Cobb Ang</span>
          </button>

          <button
            onClick={() => onSelectTool('rectangle_roi')}
            title="Rectangular ROI [R]"
            className={toolBtnClass('rectangle_roi')}
          >
            <Square className="w-4 h-4 text-purple-400" />
            <span>Rect ROI</span>
          </button>

          <button
            onClick={() => onSelectTool('ellipse_roi')}
            title="Elliptical ROI [E]"
            className={toolBtnClass('ellipse_roi')}
          >
            <Circle className="w-4 h-4 text-pink-400" />
            <span>Oval ROI</span>
          </button>

          <button
            onClick={() => onSelectTool('hu_probe')}
            title="Live Hounsfield Unit Point Probe"
            className={toolBtnClass('hu_probe')}
          >
            <Target className="w-4 h-4 text-rose-400" />
            <span>HU Probe</span>
          </button>

          <button
            onClick={onClearMeasurements}
            title="Clear Measurements in Viewport"
            className={actionBtnClass}
          >
            <Trash2 className="w-4 h-4 text-slate-400 hover:text-rose-400" />
            <span>Clear</span>
          </button>
        </div>

        {/* 3. Image Transformation & View Manipulation */}
        <div className="flex items-center gap-1 px-2 border-r border-radiant-border">
          <button onClick={onRotate} title="Rotate 90° Clockwise" className={actionBtnClass}>
            <RotateCw className="w-4 h-4 text-cyan-300" />
            <span>Rotate</span>
          </button>

          <button onClick={onFlipH} title="Flip Horizontal" className={actionBtnClass}>
            <FlipHorizontal className="w-4 h-4 text-amber-300" />
            <span>Flip H</span>
          </button>

          <button onClick={onFlipV} title="Flip Vertical" className={actionBtnClass}>
            <FlipVertical className="w-4 h-4 text-amber-300" />
            <span>Flip V</span>
          </button>

          <button onClick={onInvert} title="Invert Grayscale Window" className={actionBtnClass}>
            <Eye className="w-4 h-4 text-purple-300" />
            <span>Invert</span>
          </button>
        </div>

        {/* 4. Dropdowns: Presets, Color LUT, Filters, MIP */}
        <div className="flex items-center gap-1.5 px-2 border-r border-radiant-border">
          {/* Window Presets Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowPresetMenu(!showPresetMenu);
                setShowLutMenu(false);
                setShowMipMenu(false);
                setShowGridMenu(false);
                setShowFilterMenu(false);
                setShowSyncMenu(false);
              }}
              className="flex items-center gap-1 px-2.5 h-10 bg-radiant-darkest hover:bg-radiant-hover text-slate-200 rounded border border-radiant-border text-xs font-medium"
              title="Calibrated Diagnostic Window Presets (CT / MR / Angio)"
            >
              <SunMedium className="w-3.5 h-3.5 text-amber-400" />
              <span>Presets</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showPresetMenu && (
              <div className="absolute left-0 top-full mt-1 w-64 bg-radiant-panel border border-radiant-border rounded-xl shadow-2xl py-1 z-50 text-xs max-h-96 overflow-y-auto">
                <div className="px-3 py-1.5 text-[10.5px] font-semibold text-slate-400 border-b border-radiant-border flex items-center justify-between">
                  <span>Diagnostic Window Presets</span>
                  <span className="text-[9px] text-slate-500 font-mono">C / W</span>
                </div>
                {DEFAULT_WINDOW_PRESETS.map((p) => {
                  const isActive = currentWindowCenter === p.windowCenter && currentWindowWidth === p.windowWidth;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        onApplyWindowPreset(p.windowCenter, p.windowWidth);
                        setShowPresetMenu(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left hover:bg-radiant-hover flex items-center justify-between text-xs transition-colors ${
                        isActive ? 'bg-amber-950/40 text-amber-300 font-bold' : 'text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {p.shortcut && (
                          <span className="px-1 py-0.2 bg-slate-800 text-slate-400 rounded text-[9px] font-mono border border-slate-700">
                            {p.shortcut}
                          </span>
                        )}
                        <span>{p.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 font-mono">
                          {p.windowCenter}/{p.windowWidth}
                        </span>
                        {isActive && <span className="text-amber-400 text-xs">✓</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Image Enhancement Convolution Filters */}
          <div className="relative">
            <button
              onClick={() => {
                setShowFilterMenu(!showFilterMenu);
                setShowPresetMenu(false);
                setShowLutMenu(false);
                setShowMipMenu(false);
                setShowGridMenu(false);
                setShowSyncMenu(false);
              }}
              className={`flex items-center gap-1 px-2.5 h-10 rounded border text-xs font-medium ${
                currentFilter !== 'none'
                  ? 'bg-amber-900/40 border-amber-500/80 text-amber-300'
                  : 'bg-radiant-darkest hover:bg-radiant-hover text-slate-200 border-radiant-border'
              }`}
              title="Clinical Image Filters (Convolution Sharpen, Bone, Edge, Smoothing)"
            >
              <Wand2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Filter</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showFilterMenu && onSetFilter && (
              <div className="absolute left-0 top-full mt-1 w-48 bg-radiant-panel border border-radiant-border rounded shadow-2xl p-1 z-50 text-xs space-y-0.5">
                <div className="px-2.5 py-1 text-[10.5px] font-semibold text-slate-400 border-b border-radiant-border">
                  Convolution Filters
                </div>
                {[
                  { id: 'none', label: 'None (Standard)' },
                  { id: 'sharpen', label: 'Sharpen (General)' },
                  { id: 'bone', label: 'Bone Detail (High-Pass)' },
                  { id: 'smooth', label: 'Soft Tissue Smoothing' },
                  { id: 'edge', label: 'Edge Detection' }
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      onSetFilter(f.id as ImageFilterType);
                      setShowFilterMenu(false);
                    }}
                    className={`w-full px-2.5 py-1.5 text-left rounded hover:bg-radiant-hover flex items-center justify-between text-xs ${
                      currentFilter === f.id ? 'text-amber-300 font-bold bg-amber-950/40' : 'text-slate-200'
                    }`}
                  >
                    <span>{f.label}</span>
                    {currentFilter === f.id && <span className="text-amber-400">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Color LUT Palette Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowLutMenu(!showLutMenu);
                setShowPresetMenu(false);
                setShowMipMenu(false);
                setShowGridMenu(false);
                setShowFilterMenu(false);
                setShowSyncMenu(false);
              }}
              className="flex items-center gap-1 px-2.5 h-10 bg-radiant-darkest hover:bg-radiant-hover text-slate-200 rounded border border-radiant-border text-xs font-medium"
              title="Color Look-Up Tables (Pseudo-Color Maps)"
            >
              <Palette className="w-3.5 h-3.5 text-pink-400" />
              <span>LUT</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showLutMenu && (
              <div className="absolute left-0 top-full mt-1 w-44 bg-radiant-panel border border-radiant-border rounded shadow-2xl py-1 z-50 text-xs">
                <div className="px-3 py-1 text-[10.5px] font-semibold text-slate-400 border-b border-radiant-border">
                  Color Palettes
                </div>
                {LUT_PRESETS.map((lut) => (
                  <button
                    key={lut.id}
                    onClick={() => {
                      onSetLut(lut.id);
                      setShowLutMenu(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left hover:bg-radiant-hover flex items-center justify-between ${
                      currentLut === lut.id ? 'text-cyan-400 font-semibold' : 'text-slate-200'
                    }`}
                  >
                    <span>{lut.name}</span>
                    {currentLut === lut.id && <span className="text-cyan-400 text-xs">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* MIP / MinIP / Slab Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowMipMenu(!showMipMenu);
                setShowPresetMenu(false);
                setShowLutMenu(false);
                setShowGridMenu(false);
                setShowFilterMenu(false);
                setShowSyncMenu(false);
              }}
              className={`flex items-center gap-1 px-2.5 h-10 rounded border text-xs font-medium ${
                currentMipMode !== 'none'
                  ? 'bg-cyan-900/40 border-cyan-500/80 text-cyan-300'
                  : 'bg-radiant-darkest hover:bg-radiant-hover text-slate-200 border-radiant-border'
              }`}
              title="Maximum / Minimum Intensity Projection (MIP) & Slab Thickness"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>MIP</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showMipMenu && (
              <div className="absolute left-0 top-full mt-1 w-48 bg-radiant-panel border border-radiant-border rounded shadow-2xl p-2 z-50 text-xs space-y-2">
                <div className="text-[10.5px] font-semibold text-slate-400 border-b border-radiant-border pb-1">
                  Projection Mode
                </div>
                <div className="space-y-1">
                  {[
                    { mode: 'none', label: 'Single Slice (Off)' },
                    { mode: 'mip', label: 'MIP (Max Intensity)' },
                    { mode: 'minip', label: 'MinIP (Min Intensity)' }
                  ].map(({ mode, label }) => (
                    <button
                      key={mode}
                      onClick={() => {
                        onSetMip(mode as MipMode, currentMipSlab);
                        setShowMipMenu(false);
                      }}
                      className={`w-full px-2 py-1 text-left rounded hover:bg-radiant-hover text-xs ${
                        currentMipMode === mode ? 'bg-cyan-900/50 text-cyan-300 font-semibold' : 'text-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="text-[10.5px] font-semibold text-slate-400 border-b border-radiant-border pt-1 pb-1">
                  Slab Thickness (Slices)
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[1, 3, 5, 10, 15, 20, 30, 50].map((slab) => (
                    <button
                      key={slab}
                      onClick={() => {
                        onSetMip(currentMipMode === 'none' ? 'mip' : currentMipMode, slab);
                        setShowMipMenu(false);
                      }}
                      className={`py-1 text-center rounded text-xs font-mono ${
                        currentMipSlab === slab && currentMipMode !== 'none'
                          ? 'bg-cyan-600 text-white font-bold'
                          : 'bg-radiant-darkest text-slate-300 hover:bg-radiant-hover'
                      }`}
                    >
                      {slab}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 5. Synchronized Scrolling & Cine */}
        <div className="flex items-center gap-1.5 px-2 border-r border-radiant-border">
          {/* Sync Mode Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowSyncMenu(!showSyncMenu);
                setShowPresetMenu(false);
                setShowLutMenu(false);
                setShowMipMenu(false);
                setShowGridMenu(false);
                setShowFilterMenu(false);
              }}
              className={`flex items-center gap-1 px-2.5 h-10 rounded border text-xs font-medium ${
                syncMode !== 'none'
                  ? 'bg-emerald-900/40 border-emerald-500/80 text-emerald-300'
                  : 'bg-radiant-darkest hover:bg-radiant-hover text-slate-200 border-radiant-border'
              }`}
              title="Multi-Viewport Cross-Series Synchronized Scrolling"
            >
              <Link2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Sync: {syncMode === 'none' ? 'Off' : syncMode === 'index' ? 'Index' : 'Loc'}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showSyncMenu && onSetSyncMode && (
              <div className="absolute left-0 top-full mt-1 w-52 bg-radiant-panel border border-radiant-border rounded shadow-2xl p-1 z-50 text-xs space-y-0.5">
                <div className="px-2.5 py-1 text-[10.5px] font-semibold text-slate-400 border-b border-radiant-border">
                  Multi-Viewport Synchronization
                </div>
                {[
                  { id: 'none', label: 'Sync Off (Independent)' },
                  { id: 'index', label: 'Sync by Slice Index' },
                  { id: 'location', label: 'Sync by Z-Location (mm)' }
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      onSetSyncMode(s.id as SyncMode);
                      setShowSyncMenu(false);
                    }}
                    className={`w-full px-2.5 py-1.5 text-left rounded hover:bg-radiant-hover flex items-center justify-between text-xs ${
                      syncMode === s.id ? 'text-emerald-300 font-bold bg-emerald-950/40' : 'text-slate-200'
                    }`}
                  >
                    <span>{s.label}</span>
                    {syncMode === s.id && <span className="text-emerald-400">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cine Playback */}
          <button
            onClick={onToggleCine}
            title={isCinePlaying ? 'Pause Cine Playback (Space)' : 'Play Cine Loop (Space)'}
            className={`flex items-center gap-1.5 px-3 h-10 rounded text-xs font-medium transition-all ${
              isCinePlaying
                ? 'bg-rose-900/40 border border-rose-500/80 text-rose-300 animate-pulse'
                : 'bg-radiant-darkest hover:bg-radiant-hover text-slate-200 border border-radiant-border'
            }`}
          >
            {isCinePlaying ? <Pause className="w-3.5 h-3.5 text-rose-400" /> : <Play className="w-3.5 h-3.5 text-cyan-400" />}
            <span>{isCinePlaying ? 'Stop' : 'Cine'}</span>
          </button>
        </div>

        {/* 6. Multi-Viewport Grid Layout Selector */}
        <div className="relative">
          <button
            onClick={() => {
              setShowGridMenu(!showGridMenu);
              setShowPresetMenu(false);
              setShowLutMenu(false);
              setShowMipMenu(false);
              setShowFilterMenu(false);
              setShowSyncMenu(false);
            }}
            className="flex items-center gap-1 px-2.5 h-10 bg-radiant-darkest hover:bg-radiant-hover text-slate-200 rounded border border-radiant-border text-xs font-medium"
            title="Viewport Matrix Grid Layout"
          >
            <Grid className="w-3.5 h-3.5 text-amber-400" />
            <span>{currentGrid}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {showGridMenu && (
            <div className="absolute left-0 top-full mt-1 w-32 bg-radiant-panel border border-radiant-border rounded shadow-2xl p-1.5 z-50 text-xs">
              <div className="text-[10px] font-semibold text-slate-400 mb-1 px-1">Grid Layout</div>
              <div className="grid grid-cols-3 gap-1">
                {(['1x1', '1x2', '2x1', '2x2', '2x3', '3x3'] as GridLayout[]).map((g) => (
                  <button
                    key={g}
                    onClick={() => {
                      onSetGrid(g);
                      setShowGridMenu(false);
                    }}
                    className={`py-1.5 px-1 text-center rounded text-[11px] font-mono transition-colors ${
                      currentGrid === g
                        ? 'bg-cyan-600 text-white font-bold'
                        : 'bg-radiant-darkest text-slate-300 hover:bg-radiant-hover'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 7. Advanced 3D & Reconstruction Views */}
        <div className="flex items-center gap-1.5 px-2 border-r border-radiant-border">
          <button
            onClick={onToggleMpr}
            title="Multi-Planar Reconstruction (Axial, Coronal, Sagittal)"
            className={`flex items-center gap-1.5 px-2.5 h-10 rounded text-xs font-medium transition-all ${
              isMprActive
                ? 'bg-cyan-600/40 border border-cyan-400 text-cyan-200'
                : 'bg-radiant-darkest hover:bg-radiant-hover text-slate-200 border border-radiant-border'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>MPR</span>
          </button>

          {onOpen3D && (
            <button
              onClick={onOpen3D}
              title="3D Volume Rendering & Surface Projection"
              className="flex items-center gap-1.5 px-2.5 h-10 bg-radiant-darkest hover:bg-radiant-hover text-amber-300 rounded border border-radiant-border text-xs font-medium"
            >
              <Box className="w-3.5 h-3.5 text-amber-400" />
              <span>3D VR</span>
            </button>
          )}
        </div>

        {/* 8. Clinical Finding Bookmarks & Report Generator */}
        <div className="flex items-center gap-1.5 ml-auto">
          {onOpenBookmarks && (
            <button
              onClick={onOpenBookmarks}
              title="Key Finding Slices Gallery [Press 'B' on any slice to bookmark]"
              className="flex items-center gap-1.5 px-2.5 h-10 bg-radiant-darkest hover:bg-radiant-hover text-amber-300 rounded border border-radiant-border text-xs font-medium relative"
            >
              <Bookmark className="w-3.5 h-3.5 text-amber-400" />
              <span>Key Slices</span>
              {bookmarksCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-black text-[10px] font-bold rounded-full">
                  {bookmarksCount}
                </span>
              )}
            </button>
          )}

          {onOpenReport && (
            <button
              onClick={onOpenReport}
              title="Generate & Print Diagnostic Radiology Report"
              className="flex items-center gap-1.5 px-2.5 h-10 bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-600 hover:to-emerald-600 text-white rounded border border-emerald-400/40 text-xs font-semibold shadow-sm"
            >
              <FileText className="w-3.5 h-3.5 text-teal-200" />
              <span>Report</span>
            </button>
          )}

          <button
            onClick={onOpenPacs}
            title="Open PACS Query & Retrieve Workstation"
            className="flex items-center gap-1.5 px-2.5 h-10 bg-radiant-darkest hover:bg-radiant-hover text-emerald-300 rounded border border-radiant-border text-xs font-medium"
          >
            <Server className="w-3.5 h-3.5 text-emerald-400" />
            <span>PACS</span>
          </button>

          <button
            onClick={onOpenDicomDir}
            title="Open CD/DVD Disc or DICOMDIR"
            className="flex items-center gap-1.5 px-2.5 h-10 bg-radiant-darkest hover:bg-radiant-hover text-amber-300 rounded border border-radiant-border text-xs font-medium"
          >
            <Disc className="w-3.5 h-3.5 text-amber-400" />
            <span>CD/DVD</span>
          </button>

          <button
            onClick={onOpenExport}
            title="Export Image / Medical Report"
            className="flex items-center gap-1.5 px-2.5 h-10 bg-radiant-darkest hover:bg-radiant-hover text-purple-300 rounded border border-radiant-border text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5 text-purple-400" />
            <span>Export</span>
          </button>
        </div>
      </div>
    </>
  );
};
