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
  onToggleFullscreen
}) => {
  return (
    <header className="h-11 bg-radiant-darkest border-b border-radiant-border flex items-center justify-between px-3 select-none text-xs text-slate-200">
      {/* Brand & App Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-700 px-2.5 py-1 rounded shadow-sm text-white font-bold text-sm tracking-wide">
          <Activity className="w-4 h-4 text-cyan-200 animate-pulse" />
          <span>RadGraph</span>
          <span className="text-[10px] font-mono bg-cyan-950/60 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-400/40">
            v0.0.01
          </span>
        </div>

        {/* Current Active Study Info Badge */}
        {activeStudy ? (
          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 bg-radiant-panel rounded border border-radiant-border text-slate-300">
            <span className="font-semibold text-cyan-400">
              {activeStudy.patientName.replace(/\^/g, ' ')}
            </span>
            <span className="text-slate-500">|</span>
            <span className="font-mono text-slate-400">ID: {activeStudy.patientId}</span>
            <span className="text-slate-500">|</span>
            <span className="text-amber-400 font-medium">{activeStudy.studyDescription}</span>
            <span className="px-1.5 py-0.2 bg-blue-900/60 text-blue-300 rounded text-[10px] font-bold">
              {activeStudy.modalitiesInStudy.join(', ')}
            </span>
          </div>
        ) : (
          <div className="hidden md:flex text-slate-500 text-xs items-center gap-1.5">
            <span>No study currently open</span>
          </div>
        )}
      </div>

      {/* Quick Action Buttons */}
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

        {/* Fullscreen Toggle */}
        <button
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen (F11)'}
          className="p-1.5 bg-radiant-panel hover:bg-radiant-hover text-slate-300 hover:text-white rounded border border-radiant-border transition-colors"
        >
          {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
        </button>
      </div>
    </header>
  );
};
