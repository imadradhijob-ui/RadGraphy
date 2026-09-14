import React from 'react';
import {
  Activity,
  Layers,
  Maximize,
  Minimize,
  Sliders,
  Play,
  Pause,
  Eye,
  EyeOff,
  HelpCircle,
  HardDrive,
  FileText
} from 'lucide-react';
import { DicomInstance, DicomSeries, DicomStudy, ViewportState } from '../types/dicom';

interface BottomStatusBarProps {
  activeStudy: DicomStudy | null;
  activeSeries: DicomSeries | null;
  activeInstance?: DicomInstance;
  viewportState: ViewportState;
  showOverlays: boolean;
  onToggleOverlays: () => void;
  onOpenShortcuts: () => void;
  totalStudiesCount: number;
}

export const BottomStatusBar: React.FC<BottomStatusBarProps> = ({
  activeStudy,
  activeSeries,
  activeInstance,
  viewportState,
  showOverlays,
  onToggleOverlays,
  onOpenShortcuts,
  totalStudiesCount
}) => {
  const formatTransferSyntax = (uid?: string): string => {
    if (!uid) return 'Explicit VR Little Endian';
    if (uid.includes('1.2.840.10008.1.2.4.70') || uid.includes('1.2.840.10008.1.2.4.57')) {
      return 'JPEG Lossless (Proc 14)';
    }
    if (uid.includes('1.2.840.10008.1.2.4.50')) return 'JPEG Baseline';
    if (uid.includes('1.2.840.10008.1.2.5')) return 'RLE Lossless';
    if (uid.includes('1.2.840.10008.1.2.1')) return 'Explicit VR LE';
    if (uid.includes('1.2.840.10008.1.2')) return 'Implicit VR LE';
    return uid.split('.').slice(-2).join('.');
  };

  const sliceLoc = activeInstance?.sliceLocation ?? activeInstance?.imagePositionPatient?.[2];
  const sliceThick = activeInstance?.sliceThickness;

  const currentIdx = (viewportState.instanceIndex || 0) + 1;
  const totalSlices = activeSeries?.instances.length || 0;
  const zoomPct = Math.round((viewportState.zoom || 1) * 100);

  return (
    <footer className="h-7 bg-radiant-darkest border-t border-radiant-border flex items-center justify-between px-3 select-none text-[11px] text-slate-400 font-medium z-20">
      {/* Left Segment: Modality, Series & Slice Index */}
      <div className="flex items-center gap-3 overflow-hidden">
        {activeSeries ? (
          <>
            <span className="px-1.5 py-0.2 bg-cyan-950 text-cyan-300 rounded border border-cyan-700/50 font-bold font-mono text-[10px]">
              {activeSeries.modality}
            </span>
            <span className="text-slate-200 truncate max-w-[200px] font-semibold">
              {activeSeries.seriesDescription || `Series ${activeSeries.seriesNumber}`}
            </span>
            <span className="text-slate-600">|</span>
            <span className="font-mono text-cyan-400 font-bold">
              Slice: {totalSlices > 0 ? `${currentIdx}/${totalSlices}` : '0/0'}
            </span>
          </>
        ) : (
          <span className="text-slate-500">Ready</span>
        )}

        {activeInstance?.columns && activeInstance?.rows && (
          <>
            <span className="text-slate-600 hidden sm:inline">|</span>
            <span className="font-mono text-slate-300 hidden sm:inline">
              {activeInstance.columns} × {activeInstance.rows} px
            </span>
          </>
        )}
      </div>

      {/* Middle Segment: Slice Location, Windowing & Zoom */}
      <div className="hidden md:flex items-center gap-3 font-mono text-slate-300 text-[10.5px]">
        {sliceLoc !== undefined && (
          <span>
            Loc: <strong className="text-cyan-300">{sliceLoc.toFixed(2)} mm</strong>
            {sliceThick ? ` (Thk: ${sliceThick.toFixed(1)} mm)` : ''}
          </span>
        )}

        <span className="text-slate-600">|</span>

        <span>
          WL: <strong className="text-amber-300">{Math.round(viewportState.windowCenter)}</strong> WW: <strong className="text-amber-300">{Math.round(viewportState.windowWidth)}</strong>
        </span>

        <span className="text-slate-600">|</span>

        <span>
          Zoom: <strong className="text-emerald-300">{zoomPct}%</strong>
        </span>

        {viewportState.cinePlaying && (
          <>
            <span className="text-slate-600">|</span>
            <span className="flex items-center gap-1 text-rose-400 animate-pulse font-bold">
              <Play className="w-3 h-3 fill-current" />
              <span>{viewportState.cineFps} FPS</span>
            </span>
          </>
        )}
      </div>

      {/* Hospital IT Department Powered Badge */}
      <div className="hidden lg:flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/30 text-[9.5px] font-semibold text-emerald-300 tracking-wider select-none">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        <span>POWERED BY THE IT DEPARTMENT AL-SHAAB HOSPITAL</span>
      </div>

      {/* Right Segment: Codec / Syntax, Overlays Toggle, Shortcuts */}
      <div className="flex items-center gap-2">
        {activeInstance?.transferSyntaxUid && (
          <span className="hidden lg:inline font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400">
            {formatTransferSyntax(activeInstance.transferSyntaxUid)}
          </span>
        )}

        {/* Toggle Overlays Button */}
        <button
          onClick={onToggleOverlays}
          title={showOverlays ? 'Hide Medical HUD Overlays (Clean View - O)' : 'Show Medical HUD Overlays (O)'}
          className={`px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors ${
            showOverlays
              ? 'text-cyan-400 hover:bg-cyan-950/60'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
          }`}
        >
          {showOverlays ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span className="text-[10px] font-semibold">{showOverlays ? 'HUD ON' : 'CLEAN'}</span>
        </button>

        {/* Shortcuts Cheat Sheet */}
        <button
          onClick={onOpenShortcuts}
          title="Workstation Keyboard Shortcuts (?)"
          className="p-1 text-slate-400 hover:text-cyan-300 hover:bg-slate-800 rounded transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </div>
    </footer>
  );
};
