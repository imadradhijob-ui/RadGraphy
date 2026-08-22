import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  FolderOpen,
  Disc,
  Server,
  Download,
  Trash2,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Activity,
  Sliders,
  Ruler,
  Compass,
  Square,
  Circle,
  Eye,
  Info,
  HelpCircle,
  Layers
} from 'lucide-react';
import { DEFAULT_WINDOW_PRESETS } from '../services/windowPresets';
import { GridLayout, ToolType } from '../types/dicom';

interface MenuBarProps {
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onOpenDicomDir: () => void;
  onOpenPacs: () => void;
  onOpenExport: () => void;
  onClearMeasurements: () => void;
  onSelectTool: (tool: ToolType) => void;
  onApplyWindowPreset: (wc: number, ww: number) => void;
  onSetGrid: (grid: GridLayout) => void;
  onRotate: () => void;
  onFlipH: () => void;
  onFlipV: () => void;
  onInvert: () => void;
  onToggleMpr: () => void;
  onOpenTags: () => void;
  onOpenAbout: () => void;
  onOpenSettings?: () => void;
}

export const MenuBar: React.FC<MenuBarProps> = ({
  onOpenFile,
  onOpenFolder,
  onOpenDicomDir,
  onOpenPacs,
  onOpenExport,
  onClearMeasurements,
  onSelectTool,
  onApplyWindowPreset,
  onSetGrid,
  onRotate,
  onFlipH,
  onFlipV,
  onInvert,
  onToggleMpr,
  onOpenTags,
  onOpenAbout,
  onOpenSettings
}) => {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMenuClick = (menu: string) => {
    setOpenMenu(openMenu === menu ? null : menu);
  };

  const executeAndClose = (action: () => void) => {
    action();
    setOpenMenu(null);
  };

  return (
    <div ref={menuRef} className="h-7 bg-radiant-dark border-b border-radiant-border flex items-center px-2 text-xs text-slate-300 select-none relative z-50">
      {/* File Menu */}
      <div className="relative">
        <button
          onClick={() => handleMenuClick('file')}
          className={`px-2.5 py-0.5 rounded transition-colors ${openMenu === 'file' ? 'bg-radiant-hover text-cyan-400 font-semibold' : 'hover:bg-radiant-hover text-slate-200'}`}
        >
          File
        </button>
        {openMenu === 'file' && (
          <div className="absolute left-0 top-full mt-1 w-64 bg-radiant-panel border border-radiant-border rounded shadow-2xl py-1 text-xs text-slate-200">
            <button
              onClick={() => executeAndClose(onOpenFile)}
              className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                <span>Open DICOM Files...</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Ctrl+O</span>
            </button>
            <button
              onClick={() => executeAndClose(onOpenFolder)}
              className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                <span>Open Folder / Flash Drive...</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Ctrl+Shift+O</span>
            </button>
            <button
              onClick={() => executeAndClose(onOpenDicomDir)}
              className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Disc className="w-3.5 h-3.5 text-rose-400" />
                <span>Open CD/DVD or DICOMDIR...</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Ctrl+D</span>
            </button>
            <div className="my-1 border-t border-radiant-border"></div>
            <button
              onClick={() => executeAndClose(onOpenPacs)}
              className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-emerald-400" />
                <span>PACS Search (C-FIND / WADO)...</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Ctrl+P</span>
            </button>
            <div className="my-1 border-t border-radiant-border"></div>
            <button
              onClick={() => executeAndClose(onOpenExport)}
              className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Download className="w-3.5 h-3.5 text-purple-400" />
                <span>Export Image / Print Report...</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Ctrl+E</span>
            </button>
          </div>
        )}
      </div>

      {/* Edit Menu */}
      <div className="relative">
        <button
          onClick={() => handleMenuClick('edit')}
          className={`px-2.5 py-0.5 rounded transition-colors ${openMenu === 'edit' ? 'bg-radiant-hover text-cyan-400 font-semibold' : 'hover:bg-radiant-hover text-slate-200'}`}
        >
          Edit
        </button>
        {openMenu === 'edit' && (
          <div className="absolute left-0 top-full mt-1 w-56 bg-radiant-panel border border-radiant-border rounded shadow-2xl py-1 text-xs text-slate-200">
            <button
              onClick={() => executeAndClose(onClearMeasurements)}
              className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2 text-rose-300"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All Measurements</span>
            </button>
            <button
              onClick={() => executeAndClose(onOpenTags)}
              className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2"
            >
              <Info className="w-3.5 h-3.5 text-cyan-400" />
              <span>Inspect DICOM Tags</span>
            </button>
          </div>
        )}
      </div>

      {/* View Menu */}
      <div className="relative">
        <button
          onClick={() => handleMenuClick('view')}
          className={`px-2.5 py-0.5 rounded transition-colors ${openMenu === 'view' ? 'bg-radiant-hover text-cyan-400 font-semibold' : 'hover:bg-radiant-hover text-slate-200'}`}
        >
          View
        </button>
        {openMenu === 'view' && (
          <div className="absolute left-0 top-full mt-1 w-56 bg-radiant-panel border border-radiant-border rounded shadow-2xl py-1 text-xs text-slate-200">
            <div className="px-3 py-1 text-[11px] font-bold text-slate-400">Viewport Grid Layout:</div>
            <div className="grid grid-cols-3 gap-1 px-2 py-1 bg-radiant-darkest rounded mx-2 mb-2">
              {(['1x1', '1x2', '2x2', '1x3', '3x3'] as GridLayout[]).map((g) => (
                <button
                  key={g}
                  onClick={() => executeAndClose(() => onSetGrid(g))}
                  className="py-1 px-2 text-center rounded hover:bg-radiant-hover text-[11px] border border-radiant-border font-mono"
                >
                  {g}
                </button>
              ))}
            </div>
            <div className="my-1 border-t border-radiant-border"></div>
            <button
              onClick={() => executeAndClose(onRotate)}
              className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2"
            >
              <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
              <span>Rotate 90° Clockwise</span>
            </button>
            <button
              onClick={() => executeAndClose(onFlipH)}
              className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2"
            >
              <FlipHorizontal className="w-3.5 h-3.5 text-amber-400" />
              <span>Flip Horizontal</span>
            </button>
            <button
              onClick={() => executeAndClose(onFlipV)}
              className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2"
            >
              <FlipVertical className="w-3.5 h-3.5 text-amber-400" />
              <span>Flip Vertical</span>
            </button>
            <button
              onClick={() => executeAndClose(onInvert)}
              className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2"
            >
              <Eye className="w-3.5 h-3.5 text-purple-400" />
              <span>Invert Grayscale (Negative)</span>
            </button>
          </div>
        )}
      </div>

      {/* Windowing Menu */}
      <div className="relative">
        <button
          onClick={() => handleMenuClick('windowing')}
          className={`px-2.5 py-0.5 rounded transition-colors ${openMenu === 'windowing' ? 'bg-radiant-hover text-cyan-400 font-semibold' : 'hover:bg-radiant-hover text-slate-200'}`}
        >
          Windowing
        </button>
        {openMenu === 'windowing' && (
          <div className="absolute left-0 top-full mt-1 w-64 bg-radiant-panel border border-radiant-border rounded shadow-2xl py-1 text-xs text-slate-200">
            {DEFAULT_WINDOW_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => executeAndClose(() => onApplyWindowPreset(preset.windowCenter, preset.windowWidth))}
                className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{preset.name}</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  W:{preset.windowWidth} C:{preset.windowCenter} [{preset.shortcut}]
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Measurements Menu */}
      <div className="relative">
        <button
          onClick={() => handleMenuClick('measure')}
          className={`px-2.5 py-0.5 rounded transition-colors ${openMenu === 'measure' ? 'bg-radiant-hover text-cyan-400 font-semibold' : 'hover:bg-radiant-hover text-slate-200'}`}
        >
          Measurements
        </button>
        {openMenu === 'measure' && (
          <div className="absolute left-0 top-full mt-1 w-60 bg-radiant-panel border border-radiant-border rounded shadow-2xl py-1 text-xs text-slate-200">
            <button
              onClick={() => executeAndClose(() => onSelectTool('distance'))}
              className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2"
            >
              <Ruler className="w-3.5 h-3.5 text-cyan-400" />
              <span>Distance (mm) [D]</span>
            </button>
            <button
              onClick={() => executeAndClose(() => onSelectTool('angle'))}
              className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2"
            >
              <Compass className="w-3.5 h-3.5 text-amber-400" />
              <span>Angle (Deg) [A]</span>
            </button>
            <button
              onClick={() => executeAndClose(() => onSelectTool('cobb_angle'))}
              className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2"
            >
              <Compass className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cobb Angle (Spine)</span>
            </button>
            <button
              onClick={() => executeAndClose(() => onSelectTool('rectangle_roi'))}
              className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2"
            >
              <Square className="w-3.5 h-3.5 text-blue-400" />
              <span>Rectangle ROI (Mean/Min/Max HU) [R]</span>
            </button>
            <button
              onClick={() => executeAndClose(() => onSelectTool('ellipse_roi'))}
              className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2"
            >
              <Circle className="w-3.5 h-3.5 text-purple-400" />
              <span>Ellipse ROI (Mean/Min/Max HU) [E]</span>
            </button>
            <button
              onClick={() => executeAndClose(() => onSelectTool('hu_probe'))}
              className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2"
            >
              <Activity className="w-3.5 h-3.5 text-rose-400" />
              <span>HU Pixel Value Probe</span>
            </button>
          </div>
        )}
      </div>

      {/* 3D / MPR Menu */}
      <div className="relative">
        <button
          onClick={() => handleMenuClick('mpr')}
          className={`px-2.5 py-0.5 rounded transition-colors ${openMenu === 'mpr' ? 'bg-radiant-hover text-cyan-400 font-semibold' : 'hover:bg-radiant-hover text-slate-200'}`}
        >
          3D / MPR
        </button>
        {openMenu === 'mpr' && (
          <div className="absolute left-0 top-full mt-1 w-64 bg-radiant-panel border border-radiant-border rounded shadow-2xl py-1 text-xs text-slate-200">
            <button
              onClick={() => executeAndClose(onToggleMpr)}
              className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2 font-bold text-cyan-300"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Multi-Planar Reconstruction (MPR)</span>
            </button>
          </div>
        )}
      </div>

      {/* Options & Settings Menu */}
      <div className="relative">
        <button
          onClick={() => handleMenuClick('options')}
          className={`px-2.5 py-0.5 rounded transition-colors ${openMenu === 'options' ? 'bg-radiant-hover text-cyan-400 font-semibold' : 'hover:bg-radiant-hover text-slate-200'}`}
        >
          Options
        </button>
        {openMenu === 'options' && (
          <div className="absolute left-0 top-full mt-1 w-64 bg-radiant-panel border border-radiant-border rounded shadow-2xl py-1 text-xs text-slate-200">
            {onOpenSettings && (
              <button
                onClick={() => executeAndClose(onOpenSettings)}
                className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2 font-bold text-cyan-300"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Physician & Institution Settings...</span>
              </button>
            )}
            <button
              onClick={() => executeAndClose(onOpenTags)}
              className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2"
            >
              <Info className="w-3.5 h-3.5 text-amber-400" />
              <span>DICOM Tag Metadata Inspector</span>
            </button>
          </div>
        )}
      </div>

      {/* Help Menu */}
      <div className="relative">
        <button
          onClick={() => handleMenuClick('help')}
          className={`px-2.5 py-0.5 rounded transition-colors ${openMenu === 'help' ? 'bg-radiant-hover text-cyan-400 font-semibold' : 'hover:bg-radiant-hover text-slate-200'}`}
        >
          Help
        </button>
        {openMenu === 'help' && (
          <div className="absolute left-0 top-full mt-1 w-56 bg-radiant-panel border border-radiant-border rounded shadow-2xl py-1 text-xs text-slate-200">
            <button
              onClick={() => executeAndClose(onOpenAbout)}
              className="w-full text-left px-3 py-1.5 hover:bg-radiant-hover flex items-center gap-2"
            >
              <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
              <span>About RadGraph Workstation</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
