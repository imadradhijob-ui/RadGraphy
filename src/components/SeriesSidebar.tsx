import React, { useRef, useEffect, useState } from 'react';
import {
  Layers,
  ChevronLeft,
  ChevronRight,
  User,
  Calendar,
  Activity,
  HardDrive,
  Disc,
  Server,
  Maximize2,
  FileSpreadsheet,
  Film
} from 'lucide-react';
import { DicomInstance, DicomSeries, DicomStudy } from '../types/dicom';
import { getOrDecodeInstancePixels } from '../services/dicomParser';

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

// Live Rendered DICOM Thumbnail Component
const SeriesThumbnailCanvas: React.FC<{ instance?: DicomInstance }> = ({ instance }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !instance) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      const { pixelData, huData } = getOrDecodeInstancePixels(instance);
      const width = instance.columns;
      const height = instance.rows;
      if (!width || !height) return;

      canvas.width = 120;
      canvas.height = 120;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;

      const imgData = tempCtx.createImageData(width, height);
      const data = imgData.data;

      let wc = instance.windowCenter;
      let ww = instance.windowWidth;
      if (wc === undefined || ww === undefined || ww <= 0) {
        wc = 128;
        ww = 256;
      }

      const low = wc - 0.5 - (ww - 1) / 2;
      const isRgb = instance.samplesPerPixel === 3 || instance.photometricInterpretation.includes('RGB');
      const isMonochrome1 = instance.photometricInterpretation === 'MONOCHROME1';

      if (isRgb && pixelData) {
        for (let i = 0; i < width * height; i++) {
          const s = i * 3;
          const d = i * 4;
          data[d] = pixelData[s] || 0;
          data[d + 1] = pixelData[s + 1] || 0;
          data[d + 2] = pixelData[s + 2] || 0;
          data[d + 3] = 255;
        }
      } else {
        const src = huData || pixelData;
        if (src) {
          for (let i = 0; i < width * height; i++) {
            const val = src[i];
            let gray = Math.max(0, Math.min(255, Math.round(((val - low) / ww) * 255)));
            if (isMonochrome1) gray = 255 - gray;
            const d = i * 4;
            data[d] = gray;
            data[d + 1] = gray;
            data[d + 2] = gray;
            data[d + 3] = 255;
          }
        }
      }

      tempCtx.putImageData(imgData, 0, 0);

      ctx.clearRect(0, 0, 120, 120);
      ctx.drawImage(tempCanvas, 0, 0, 120, 120);
    } catch (err) {
      // Fallback
    }
  }, [instance]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full object-cover rounded bg-black transition-transform duration-200 group-hover:scale-105"
    />
  );
};

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
  const [isExtraWide, setIsExtraWide] = useState(false);

  const getModalityBadgeColor = (mod: string) => {
    switch (mod) {
      case 'CT':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/50';
      case 'MR':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50';
      case 'DX':
      case 'CR':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';
      case 'US':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/50';
      case 'XA':
      case 'RF':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/50';
      default:
        return 'bg-blue-500/20 text-blue-300 border-blue-500/50';
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
      <div className="w-7 bg-radiant-darkest border-r border-radiant-border flex flex-col items-center py-2 select-none z-10 shrink-0">
        <button
          onClick={onToggle}
          title="Expand Series Navigator Sidebar"
          className="p-1 hover:bg-radiant-hover text-slate-400 hover:text-white rounded transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-cyan-400" />
        </button>
        <div className="-rotate-90 text-[10px] text-slate-400 tracking-wider font-semibold whitespace-nowrap mt-10">
          SERIES THUMBNAILS
        </div>
      </div>
    );
  }

  const sidebarWidthClass = isExtraWide ? 'w-[420px]' : 'w-80 md:w-96';

  return (
    <aside className={`${sidebarWidthClass} bg-radiant-darkest border-r border-radiant-border flex flex-col h-full select-none text-xs text-slate-200 transition-all duration-150 shrink-0 z-10`}>
      {/* Sidebar Top Header */}
      <div className="h-11 px-3 border-b border-radiant-border flex items-center justify-between bg-radiant-panel shrink-0">
        <div className="flex items-center gap-2 font-bold text-slate-200">
          <Film className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold tracking-wide">Series Thumbnails</span>
          <span className="px-2 py-0.5 bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 rounded-full text-[10.5px] font-mono font-bold">
            {activeStudy ? activeStudy.series.length : 0}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsExtraWide(!isExtraWide)}
            title={isExtraWide ? 'Standard Sidebar Width' : 'Expand Sidebar Width'}
            className="p-1 hover:bg-radiant-hover text-slate-400 hover:text-slate-200 rounded transition-colors text-[10px]"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggle}
            title="Collapse Sidebar"
            className="p-1 hover:bg-radiant-hover text-slate-400 hover:text-white rounded transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Studies Selector Dropdown if multiple studies loaded */}
      {studies.length > 1 && (
        <div className="p-2 border-b border-radiant-border bg-radiant-panel/60 shrink-0">
          <label className="text-[11px] text-slate-400 font-semibold mb-1 block">
            Loaded Patient Studies ({studies.length}):
          </label>
          <select
            value={activeStudy?.studyInstanceUid || ''}
            onChange={(e) => {
              const selected = studies.find(s => s.studyInstanceUid === e.target.value);
              if (selected) onSelectStudy(selected);
            }}
            className="w-full bg-radiant-card border border-radiant-border text-slate-200 text-xs rounded p-1.5 outline-none focus:border-cyan-500 cursor-pointer"
          >
            {studies.map((s) => (
              <option key={s.studyInstanceUid} value={s.studyInstanceUid}>
                {s.patientName.replace(/\^/g, ' ')} - {s.studyDescription || 'Study'} ({s.modalitiesInStudy.join(',')})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Active Patient Card */}
      {activeStudy ? (
        <div className="p-3 bg-gradient-to-b from-radiant-card/90 to-radiant-panel/60 border-b border-radiant-border shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 font-bold text-cyan-300 text-sm truncate">
              <User className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <span className="truncate">{activeStudy.patientName.replace(/\^/g, ' ')}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-slate-400 bg-black/40 px-1.5 py-0.5 rounded border border-slate-800 flex-shrink-0">
              {getSourceIcon(activeStudy.source)}
              <span className="font-mono">{activeStudy.source.toUpperCase()}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-400">
            <div>ID: <span className="font-mono text-slate-200 font-medium">{activeStudy.patientId}</span></div>
            <div>Sex/Age: <span className="text-slate-200">{activeStudy.patientSex || 'O'} {activeStudy.patientAge ? `(${activeStudy.patientAge})` : ''}</span></div>
            <div className="col-span-2 text-amber-300/90 font-medium truncate">{activeStudy.studyDescription || 'Diagnostic Examination'}</div>
            <div className="col-span-2 flex items-center justify-between text-[10px] text-slate-500 pt-0.5 border-t border-slate-800/80">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" />
                {activeStudy.studyDate || 'N/A'}
              </span>
              <span className="text-cyan-400 font-medium">{activeStudy.numberOfInstances} Total Slices</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Series Thumbnail Gallery List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
        {activeStudy && activeStudy.series.length > 0 ? (
          activeStudy.series.map((ser) => {
            const isSelected = activeSeries?.seriesInstanceUid === ser.seriesInstanceUid;
            // Pick middle slice for representative thumbnail preview
            const repInstance = ser.instances[Math.floor(ser.instances.length / 2)] || ser.instances[0];

            return (
              <div
                key={ser.seriesInstanceUid}
                draggable
                onDragStart={(e) => onDragSeriesStart(e, ser)}
                onClick={() => onSelectSeries(ser)}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer group select-none shadow-sm ${
                  isSelected
                    ? 'bg-gradient-to-r from-cyan-950/70 to-radiant-panel border-cyan-500 ring-1 ring-cyan-500/80 shadow-[0_0_12px_rgba(0,180,216,0.2)]'
                    : 'bg-radiant-panel/80 border-radiant-border hover:bg-radiant-card hover:border-slate-500'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Real Rendered DICOM Preview Thumbnail */}
                  <div className="w-20 h-20 sm:w-24 sm:h-24 bg-black rounded-lg border border-slate-700/80 relative overflow-hidden flex-shrink-0 shadow-inner group-hover:border-cyan-500/70 transition-colors">
                    <SeriesThumbnailCanvas instance={repInstance} />

                    {/* Top Modality Badge */}
                    <div className="absolute top-1 left-1 pointer-events-none">
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border backdrop-blur-sm shadow ${getModalityBadgeColor(ser.modality)}`}>
                        {ser.modality}
                      </span>
                    </div>

                    {/* Bottom Series # & Count Badge */}
                    <div className="absolute bottom-1 right-1 pointer-events-none bg-black/80 px-1 py-0.2 rounded text-[9px] font-mono text-cyan-300 border border-slate-800">
                      #{ser.seriesNumber} • {ser.numberOfInstances}
                    </div>
                  </div>

                  {/* Series Metadata & Parameters */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <h4 className={`font-bold text-xs truncate transition-colors ${
                          isSelected ? 'text-cyan-300' : 'text-slate-100 group-hover:text-cyan-300'
                        }`}>
                          {ser.seriesDescription || `Series ${ser.seriesNumber}`}
                        </h4>
                      </div>

                      <p className="text-[11px] text-slate-400 truncate mb-1">
                        {ser.protocolName || ser.bodyPartExamined || `${ser.modality} Examination`}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10.5px] text-slate-400 font-mono pt-1 border-t border-slate-800/80">
                      <div>
                        Thk: <span className="text-slate-200">{repInstance?.sliceThickness ? `${repInstance.sliceThickness.toFixed(1)}mm` : '-'}</span>
                      </div>
                      <div className="text-right">
                        Matrix: <span className="text-slate-200">{repInstance ? `${repInstance.columns}x${repInstance.rows}` : '-'}</span>
                      </div>
                      <div className="col-span-2 flex items-center justify-between text-[10px] text-cyan-400/90 pt-0.5">
                        <span>{ser.numberOfInstances} images</span>
                        <span className="text-slate-500 text-[9px] uppercase tracking-wider group-hover:text-slate-300">Drag to Viewport</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <Layers className="w-10 h-10 text-slate-600 mb-3 animate-pulse" />
            <p className="text-xs font-semibold text-slate-400">No series loaded</p>
            <p className="text-[11px] text-slate-600 mt-1">Open local files, folder or query PACS</p>
          </div>
        )}
      </div>

      {/* Bottom Status Footer */}
      <div className="p-2.5 border-t border-radiant-border bg-radiant-panel text-[11px] text-slate-400 flex items-center justify-between shrink-0">
        <span className="flex items-center gap-1.5">
          <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-400" />
          <span>Total Studies: <strong className="text-slate-200">{studies.length}</strong></span>
        </span>
        <span className="text-cyan-400 font-mono text-[10px]">RadGraph 60 FPS</span>
      </div>
    </aside>
  );
};
