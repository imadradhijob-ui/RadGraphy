import React from 'react';
import {
  Activity,
  Disc,
  FolderOpen,
  HardDrive,
  Maximize,
  Minimize,
  Minus,
  RefreshCw,
  Server,
  Settings,
  Tag,
  Download,
  FileText,
  X,
  Power
} from 'lucide-react';
import { DicomStudy } from '../types/dicom';

interface HeaderBarProps {
  activeStudy: DicomStudy | null;
  onOpenPacs: () => void;
  onOpenDicomDir: () => void;
  onOpenTags: () => void;
  onOpenExport: () => void;
  onOpenFileClick: () => void;
  onOpenFolderClick: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenSettings?: () => void;
  onMinimize?: () => void;
  onExit?: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  activeStudy,
  onOpenPacs,
  onOpenDicomDir,
  onOpenTags,
  onOpenExport,
  onOpenFileClick,
  onOpenFolderClick,
  isFullscreen,
  onToggleFullscreen,
  onOpenSettings,
  onMinimize,
  onExit
}) => {
  return (
    <header className="h-11 bg-radiant-darkest border-b border-radiant-border flex items-center justify-between px-3 select-none text-xs text-slate-200">
      {/* Brand & App Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/70 px-3 py-1 rounded-xl shadow-md border border-cyan-500/40 text-white font-bold text-sm tracking-wide">
          <div className="relative w-6 h-6 rounded-full overflow-hidden border border-cyan-400/80 shadow-[0_0_10px_rgba(6,182,212,0.5)] bg-slate-950 flex items-center justify-center shrink-0">
            <img
              src="./icon.png"
              alt="RadNode Viewer"
              className="w-full h-full object-contain"
              onError={(e) => {
                const img = e.currentTarget;
                if (img.src.endsWith('./icon.png')) {
                  img.src = '/icon.png';
                } else {
                  img.src = './logo.png';
                }
              }}
            />
          </div>
          <span className="bg-gradient-to-r from-white via-cyan-100 to-cyan-300 bg-clip-text text-transparent font-extrabold tracking-wider">
            RadNode Viewer
          </span>
          <span className="text-[10px] font-mono bg-cyan-950/90 text-cyan-300 px-1.5 py-0.2 rounded border border-cyan-400/50 shadow-sm">
            v0.0.6
          </span>
        </div>

        {/* Hospital IT Department Powered Badge */}
        <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-cyan-950/60 border border-emerald-500/40 text-emerald-300 font-bold text-[10px] tracking-wider shadow-sm select-none">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="truncate">POWERED BY THE IT DEPARTMENT AL-SHAAB HOSPITAL</span>
        </div>

        {/* Current Active Study Info Badge */}
        {activeStudy ? (
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-slate-900/80 rounded-xl border border-cyan-500/30 text-slate-300 shadow-sm backdrop-blur-sm">
            <span className="font-bold text-cyan-300 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>{activeStudy.patientName.replace(/\^/g, ' ')}</span>
            </span>
            <span className="text-slate-600">|</span>
            <span className="font-mono text-slate-400 text-[11px]">ID: {activeStudy.patientId}</span>
            <span className="text-slate-600">|</span>
            <span className="text-amber-300 font-medium truncate max-w-[220px]">{activeStudy.studyDescription}</span>
            <span className="px-2 py-0.5 bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 rounded-md text-[10px] font-bold font-mono">
              {activeStudy.modalitiesInStudy.join(', ')}
            </span>
          </div>
        ) : (
          <div className="hidden md:flex text-slate-500 text-xs items-center gap-1.5">
            <span>No study currently open</span>
          </div>
        )}
      </div>

      {/* Quick Action & Window Controls */}
      <div className="flex items-center gap-1.5">
        {/* Open Files / Folder */}
        <button
          onClick={onOpenFileClick}
          title="Open DICOM Files (Ctrl+O)"
          className="flex items-center gap-1.5 px-2.5 py-1 bg-radiant-panel hover:bg-radiant-hover text-slate-200 rounded border border-radiant-border transition-colors font-medium"
        >
          <FileText className="w-3.5 h-3.5 text-cyan-400" />
          <span>Open File</span>
        </button>

        <button
          onClick={onOpenFolderClick}
          title="Open Folder / USB Flash Drive (Ctrl+Shift+O)"
          className="flex items-center gap-1.5 px-2.5 py-1 bg-radiant-panel hover:bg-radiant-hover text-slate-200 rounded border border-radiant-border transition-colors font-medium"
        >
          <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
          <span>Open Folder</span>
        </button>

        {/* PACS Query Modal */}
        <button
          onClick={onOpenPacs}
          title="Query PACS Server (C-FIND / C-MOVE / DICOMweb)"
          className="flex items-center gap-1.5 px-2.5 py-1 bg-radiant-panel hover:bg-radiant-hover text-slate-200 rounded border border-radiant-border transition-colors"
        >
          <Server className="w-3.5 h-3.5 text-cyan-400" />
          <span>PACS Query</span>
        </button>

        {/* CD/DVD DICOMDIR */}
        <button
          onClick={onOpenDicomDir}
          title="Open CD/DVD DICOMDIR Media"
          className="flex items-center gap-1.5 px-2.5 py-1 bg-radiant-panel hover:bg-radiant-hover text-slate-200 rounded border border-radiant-border transition-colors"
        >
          <Disc className="w-3.5 h-3.5 text-purple-400" />
          <span>DICOMDIR</span>
        </button>

        {/* DICOM Tag Metadata */}
        <button
          onClick={onOpenTags}
          title="Inspect All DICOM Tags & Headers"
          className="p-1.5 bg-radiant-panel hover:bg-radiant-hover text-slate-300 hover:text-white rounded border border-radiant-border transition-colors"
        >
          <Tag className="w-3.5 h-3.5 text-amber-400" />
        </button>

        {/* Export & Report */}
        <button
          onClick={onOpenExport}
          title="Export Image or Generate PDF Report"
          className="p-1.5 bg-radiant-panel hover:bg-radiant-hover text-slate-300 hover:text-white rounded border border-radiant-border transition-colors"
        >
          <Download className="w-3.5 h-3.5 text-blue-400" />
        </button>

        {/* Physician & Hospital Profile Settings */}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            title="Configure Physician & Hospital Profile (Used in Medical Reports)"
            className="p-1.5 bg-radiant-panel hover:bg-radiant-hover text-slate-300 hover:text-cyan-300 rounded border border-radiant-border transition-colors"
          >
            <Settings className="w-3.5 h-3.5 text-cyan-400" />
          </button>
        )}

        {/* Top-Right Window Controls Hub (Minimize, Fullscreen, Exit) */}
        <div className="flex items-center gap-1 pl-1.5 ml-1 border-l border-radiant-border">
          {/* Minimize Button */}
          <button
            onClick={onMinimize}
            title="Minimize Workstation Window"
            className="p-1.5 bg-radiant-panel hover:bg-radiant-hover text-slate-300 hover:text-amber-300 rounded border border-radiant-border transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen / Maximize Toggle */}
          <button
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen (F11)' : 'Always Fullscreen (F11)'}
            className="p-1.5 bg-radiant-panel hover:bg-radiant-hover text-slate-300 hover:text-cyan-300 rounded border border-radiant-border transition-colors"
          >
            {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
          </button>

          {/* Exit / Close Application Button */}
          <button
            onClick={onExit}
            title="Exit / Close RadNode Viewer"
            className="flex items-center gap-1 px-2.5 py-1 bg-rose-950/60 hover:bg-rose-600 text-rose-300 hover:text-white rounded border border-rose-700/60 transition-all font-semibold text-xs shadow-sm"
          >
            <X className="w-3.5 h-3.5" />
            <span>Exit</span>
          </button>
        </div>
      </div>
    </header>
  );
};
