import React from 'react';
import {
  Activity,
  Disc,
  FolderOpen,
  HardDrive,
  Maximize,
  Minimize,
  RefreshCw,
  Server,
  Settings,
  Tag,
  Download,
  FileText
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
  onOpenSettings
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
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <span className="font-extrabold tracking-wider bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-300 bg-clip-text text-transparent">
            RadNode
          </span>
          <span className="text-[10px] text-cyan-400/70 font-mono tracking-widest border-l border-slate-700/60 pl-2 uppercase font-medium">
            Viewer
          </span>
        </div>

        {/* Study Metadata Header Banner */}
        {activeStudy ? (
          <div className="flex items-center gap-2 text-slate-300 bg-radiant-panel px-3 py-1 rounded border border-radiant-border">
            <span className="font-bold text-white tracking-wide">
              {activeStudy.patientName || 'Anonymous'}
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400 font-mono">
              ID: {activeStudy.patientId || 'NO_ID'}
            </span>
            {activeStudy.studyDescription && (
              <>
                <span className="text-slate-500">•</span>
                <span className="text-cyan-400 truncate max-w-[200px]" title={activeStudy.studyDescription}>
                  {activeStudy.studyDescription}
                </span>
              </>
            )}
            {activeStudy.modalitiesInStudy && activeStudy.modalitiesInStudy.length > 0 && (
              <span className="px-1.5 py-0.5 bg-cyan-950/80 text-cyan-400 border border-cyan-700/50 rounded text-[10px] font-bold">
                {activeStudy.modalitiesInStudy.join('/')}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-slate-500 italic bg-radiant-panel/50 px-2.5 py-1 rounded border border-radiant-border/40 text-[11px]">
            <Activity className="w-3.5 h-3.5 text-slate-600 animate-pulse" />
            <span>Ready • Load DICOM files or query PACS archive</span>
          </div>
        )}
      </div>

      {/* Quick Access Action Buttons */}
      <div className="flex items-center gap-1.5">
        {/* Open Files */}
        <button
          onClick={onOpenFileClick}
          title="Open DICOM Files from Local Computer"
          className="flex items-center gap-1.5 px-2.5 py-1 bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 rounded border border-cyan-700/60 transition-colors font-medium shadow-sm"
        >
          <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
          <span>Open File</span>
        </button>

        {/* Open Folder */}
        <button
          onClick={onOpenFolderClick}
          title="Open Folder Containing DICOM Series"
          className="flex items-center gap-1.5 px-2.5 py-1 bg-radiant-panel hover:bg-radiant-hover text-slate-200 rounded border border-radiant-border transition-colors"
        >
          <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
          <span>Open Folder</span>
        </button>

        {/* PACS Query/Retrieve */}
        <button
          onClick={onOpenPacs}
          title="Query PACS Cloud / Hospital Archive"
          className="flex items-center gap-1.5 px-2.5 py-1 bg-radiant-panel hover:bg-radiant-hover text-slate-200 rounded border border-radiant-border transition-colors"
        >
          <Server className="w-3.5 h-3.5 text-cyan-400" />
          <span>PACS</span>
        </button>

        {/* DICOMDIR CD/DVD Media */}
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

        {/* Fullscreen Toggle */}
        <button
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen (F11)' : 'Fullscreen (F11)'}
          className="p-1.5 bg-radiant-panel hover:bg-radiant-hover text-slate-300 hover:text-cyan-300 rounded border border-radiant-border transition-colors ml-0.5"
        >
          {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
        </button>
      </div>
    </header>
  );
};
