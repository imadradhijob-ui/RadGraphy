import React from 'react';
import {
  Folder,
  ChevronLeft,
  ChevronRight,
  Layers,
  User,
  Calendar,
  Activity,
  HardDrive,
  Disc,
  Server
} from 'lucide-react';
import { DicomSeries, DicomStudy } from '../types/dicom';

interface SeriesSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  studies: DicomStudy[];
  activeStudy: DicomStudy | null;
  activeSeries: DicomSeries | null;
  onSelectStudy: (study: DicomStudy) => void;
  onSelectSeries: (series: DicomSeries) => void;
  onDragSeriesStart: (e: React.DragEvent, series: DicomSeries) => void;
}

export const SeriesSidebar: React.FC<SeriesSidebarProps> = ({
  isOpen,
  onToggle,
  studies,
  activeStudy,
  activeSeries,
  onSelectStudy,
  onSelectSeries,
  onDragSeriesStart
}) => {
  const getModalityBadgeColor = (mod: string) => {
    switch (mod) {
      case 'CT':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'MR':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      case 'DX':
      case 'CR':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'US':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      default:
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'disc':
        return <Disc className="w-3.5 h-3.5 text-amber-400" />;
      case 'pacs':
        return <Server className="w-3.5 h-3.5 text-emerald-400" />;
      case 'sample':
        return <Activity className="w-3.5 h-3.5 text-cyan-400" />;
      default:
        return <HardDrive className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  if (!isOpen) {
    return (
      <div className="w-6 bg-radiant-darkest border-r border-radiant-border flex flex-col items-center py-2 select-none">
        <button
          onClick={onToggle}
          title="Show Series Sidebar"
          className="p-1 hover:bg-radiant-hover text-slate-400 hover:text-white rounded transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="-rotate-90 text-[10px] text-slate-500 tracking-wider font-semibold whitespace-nowrap mt-8">
          SERIES & STUDIES
        </div>
      </div>
    );
  }

  return (
    <aside className="w-72 bg-radiant-darkest border-r border-radiant-border flex flex-col h-full select-none text-xs text-slate-200">
      {/* Sidebar Header */}
      <div className="h-10 px-3 border-b border-radiant-border flex items-center justify-between bg-radiant-panel">
        <div className="flex items-center gap-2 font-bold text-slate-200">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span>Series List</span>
          <span className="px-1.5 py-0.2 bg-radiant-card text-slate-400 rounded-full text-[10px]">
            {activeStudy ? activeStudy.series.length : 0}
          </span>
        </div>
        <button
          onClick={onToggle}
          title="Collapse Sidebar"
          className="p-1 hover:bg-radiant-hover text-slate-400 hover:text-white rounded transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Studies Selector Dropdown if multiple studies loaded */}
      {studies.length > 1 && (
        <div className="p-2 border-b border-radiant-border bg-radiant-panel/60">
          <label className="text-[11px] text-slate-400 font-semibold mb-1 block">
            Loaded Studies ({studies.length}):
          </label>
          <select
            value={activeStudy?.studyInstanceUid || ''}
            onChange={(e) => {
              const selected = studies.find(s => s.studyInstanceUid === e.target.value);
              if (selected) onSelectStudy(selected);
            }}
            className="w-full bg-radiant-card border border-radiant-border text-slate-200 text-xs rounded p-1.5 outline-none focus:border-cyan-500"
          >
            {studies.map((s) => (
              <option key={s.studyInstanceUid} value={s.studyInstanceUid}>
                {s.patientName.replace(/\^/g, ' ')} - {s.studyDescription} ({s.modalitiesInStudy.join(',')})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Active Patient Card */}
      {activeStudy ? (
        <div className="p-2.5 bg-radiant-card/60 border-b border-radiant-border">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 font-bold text-cyan-300 text-sm">
              <User className="w-3.5 h-3.5 text-cyan-400" />
              <span className="truncate max-w-[170px]">{activeStudy.patientName.replace(/\^/g, ' ')}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              {getSourceIcon(activeStudy.source)}
              <span>{activeStudy.source.toUpperCase()}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-slate-400 mt-1">
            <div>ID: <span className="font-mono text-slate-300">{activeStudy.patientId}</span></div>
            <div>Sex/Age: <span className="text-slate-300">{activeStudy.patientSex || 'N/A'} {activeStudy.patientAge ? `(${activeStudy.patientAge})` : ''}</span></div>
            <div className="col-span-2 text-amber-300/90 font-medium truncate">{activeStudy.studyDescription}</div>
            <div className="col-span-2 flex items-center gap-1 text-[10px] text-slate-500 mt-0.5">
              <Calendar className="w-3 h-3" />
              <span>{activeStudy.studyDate}</span>
              <span>•</span>
              <span>{activeStudy.numberOfInstances} Total Images</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Series List & Thumbnails */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {activeStudy && activeStudy.series.length > 0 ? (
          activeStudy.series.map((ser) => {
            const isSelected = activeSeries?.seriesInstanceUid === ser.seriesInstanceUid;
            const firstInst = ser.instances[0];

            return (
              <div
                key={ser.seriesInstanceUid}
                draggable
                onDragStart={(e) => onDragSeriesStart(e, ser)}
                onClick={() => onSelectSeries(ser)}
                className={`p-2 rounded-lg border transition-all cursor-pointer group select-none ${
                  isSelected
                    ? 'bg-cyan-950/40 border-cyan-500 shadow-[0_0_10px_rgba(0,180,216,0.15)] ring-1 ring-cyan-500'
                    : 'bg-radiant-panel border-radiant-border hover:bg-radiant-card hover:border-slate-600'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {/* Thumbnail badge */}
                  <div className="w-16 h-16 bg-black rounded border border-slate-700 flex flex-col items-center justify-center relative overflow-hidden flex-shrink-0">
                    <span className="text-xs font-bold text-slate-400 font-mono">
                      #{ser.seriesNumber}
                    </span>
                    <span className="text-[10px] text-cyan-400 font-semibold">
                      {ser.numberOfInstances} Img
                    </span>
                    <div className="absolute top-1 left-1">
                      <span className={`px-1 py-0.2 rounded text-[9px] font-bold border ${getModalityBadgeColor(ser.modality)}`}>
                        {ser.modality}
                      </span>
                    </div>
                  </div>

                  {/* Series Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <h4 className="font-semibold text-slate-100 text-xs truncate group-hover:text-cyan-300">
                        {ser.seriesDescription || `Series ${ser.seriesNumber}`}
                      </h4>
                    </div>

                    <p className="text-[11px] text-slate-400 truncate">
                      {ser.bodyPartExamined || ser.protocolName || `${ser.modality} Scan`}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 font-mono">
                      <span>Thick: {firstInst?.sliceThickness ? `${firstInst.sliceThickness}mm` : '-'}</span>
                      <span className="text-cyan-400 font-bold">{ser.numberOfInstances} images</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500">
            <Layers className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-xs">No series loaded</p>
            <p className="text-[11px] text-slate-600 mt-1">Open files, folder or click "Sample Studies"</p>
          </div>
        )}
      </div>

      {/* Bottom status */}
      <div className="p-2 border-t border-radiant-border bg-radiant-panel text-[11px] text-slate-400 flex items-center justify-between">
        <span>Total Studies: <strong>{studies.length}</strong></span>
        <span className="text-cyan-400">RadiAnt Engine 60 FPS</span>
      </div>
    </aside>
  );
};
