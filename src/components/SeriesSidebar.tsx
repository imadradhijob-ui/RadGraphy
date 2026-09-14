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
  Film,
  CheckCircle2,
  Compass
} from 'lucide-react';
import { DicomInstance, DicomSeries, DicomStudy, PacsDownloadState } from '../types/dicom';
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
  pacsDownloadState?: PacsDownloadState | null;
}

import { detectAnatomicalPlane } from '../services/mprEngine';
export { detectAnatomicalPlane };


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

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 120, 120);

      const aspect = (width * (instance.pixelSpacing?.[1] || 1)) / (height * (instance.pixelSpacing?.[0] || 1));
      let dw = 120;
      let dh = 120;
      if (aspect > 1) {
        dh = 120 / aspect;
      } else if (aspect > 0) {
        dw = 120 * aspect;
      }
      const dx = (120 - dw) / 2;
      const dy = (120 - dh) / 2;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
      ctx.drawImage(tempCanvas, dx, dy, dw, dh);
    } catch (err) {
      // Fallback
    }
  }, [instance]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full object-contain rounded bg-black transition-transform duration-200 group-hover:scale-105"
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
  onDragSeriesStart,
  pacsDownloadState
}) => {
  const [isExtraWide, setIsExtraWide] = useState(false);

  const getModalityBadgeColor = (mod: string) => {
    switch (mod) {
      case 'CT':
        return 'bg-amber-500/25 text-amber-300 border-amber-500/60';
      case 'MR':
        return 'bg-cyan-500/25 text-cyan-300 border-cyan-500/60';
      case 'DX':
      case 'CR':
        return 'bg-emerald-500/25 text-emerald-300 border-emerald-500/60';
      case 'US':
        return 'bg-purple-500/25 text-purple-300 border-purple-500/60';
      case 'XA':
      case 'RF':
        return 'bg-rose-500/25 text-rose-300 border-rose-500/60';
      default:
        return 'bg-blue-500/25 text-blue-300 border-blue-500/60';
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

  const sidebarWidthClass = isExtraWide ? 'w-80' : 'w-64';

  return (
    <aside className={`${sidebarWidthClass} bg-radiant-darkest border-r border-radiant-border flex flex-col h-full select-none text-xs text-slate-200 transition-all duration-150 shrink-0 z-10`}>
      {/* Sidebar Top Header */}
      <div className="h-9 px-2.5 border-b border-radiant-border flex items-center justify-between bg-radiant-panel shrink-0">
        <div className="flex items-center gap-1.5 font-bold text-slate-200">
          <Film className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-semibold tracking-wide">Series</span>
          <span className="px-1.5 py-0.2 bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 rounded-full text-[10px] font-mono font-bold">
            {activeStudy ? activeStudy.series.length : 0}
          </span>
        </div>

        <div className="flex items-center gap-0.5">
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
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Studies Selector Dropdown if multiple studies loaded */}
      {studies.length > 1 && (
        <div className="p-1.5 border-b border-radiant-border bg-radiant-panel/60 shrink-0">
          <select
            value={activeStudy?.studyInstanceUid || ''}
            onChange={(e) => {
              const selected = studies.find(s => s.studyInstanceUid === e.target.value);
              if (selected) onSelectStudy(selected);
            }}
            className="w-full bg-radiant-card border border-radiant-border text-slate-200 text-[11px] rounded p-1 outline-none focus:border-cyan-500 cursor-pointer truncate"
          >
            {studies.map((s) => (
              <option key={s.studyInstanceUid} value={s.studyInstanceUid}>
                {s.patientName.replace(/\^/g, ' ')} ({s.modalitiesInStudy.join(',')})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Active Patient Card */}
      {activeStudy ? (
        <div className="p-2 bg-gradient-to-b from-radiant-card/90 to-radiant-panel/60 border-b border-radiant-border shrink-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1 font-bold text-cyan-300 text-xs truncate">
              <User className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
              <span className="truncate">{activeStudy.patientName.replace(/\^/g, ' ')}</span>
            </div>
            <div className="flex items-center gap-1 text-[9.5px] text-slate-400 bg-black/40 px-1 py-0.2 rounded border border-slate-800 flex-shrink-0">
              {getSourceIcon(activeStudy.source)}
              <span className="uppercase text-[9px] font-mono">{activeStudy.source}</span>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 space-y-0.5">
            <div className="flex items-center justify-between">
              <span>ID: <span className="text-slate-300 font-mono">{activeStudy.patientId || 'N/A'}</span></span>
              <span>{activeStudy.modalitiesInStudy.join(', ')}</span>
            </div>

            <div className="flex items-center justify-between text-[9.5px] text-slate-500 pt-0.5 border-t border-slate-800/80">
              <span className="flex items-center gap-1">
                <Calendar className="w-2.5 h-2.5 text-slate-400" />
                {activeStudy.studyDate || 'N/A'}
              </span>
              <span className="text-cyan-400 font-medium">{activeStudy.numberOfInstances} Slices</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Series Thumbnail Gallery List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-2">
        {activeStudy && activeStudy.series.length > 0 ? (
          activeStudy.series.map((ser) => {
            const isSelected = activeSeries?.seriesInstanceUid === ser.seriesInstanceUid;
            const repInstance = ser.instances[Math.floor(ser.instances.length / 2)] || ser.instances[0];
            const plane = detectAnatomicalPlane(ser.seriesDescription, repInstance?.imageOrientationPatient);

            return (
              <div
                key={ser.seriesInstanceUid}
                draggable
                onDragStart={(e) => onDragSeriesStart(e, ser)}
                onClick={() => onSelectSeries(ser)}
                title={`${ser.seriesDescription || `Series ${ser.seriesNumber}`} (${ser.numberOfInstances} images)`}
                className={`p-1.5 rounded-lg border transition-all cursor-pointer group select-none shadow-sm ${
                  isSelected
                    ? 'bg-gradient-to-r from-cyan-950/70 to-radiant-panel border-cyan-500 ring-1 ring-cyan-500/80 shadow-[0_0_10px_rgba(0,180,216,0.2)]'
                    : 'bg-radiant-panel/80 border-radiant-border hover:bg-radiant-card hover:border-slate-500'
                }`}
              >
                <div className="flex items-start gap-2">
                  {/* Real Rendered DICOM Preview Thumbnail */}
                  <div className="w-16 h-16 bg-black rounded border border-slate-700/80 relative overflow-hidden flex-shrink-0 shadow-inner group-hover:border-cyan-500/70 transition-colors">
                    <SeriesThumbnailCanvas instance={repInstance} />

                    {/* Top Modality Badge */}
                    <div className="absolute top-0.5 left-0.5 pointer-events-none">
                      <span className={`px-1 py-0 rounded text-[8.5px] font-bold border backdrop-blur-sm shadow ${getModalityBadgeColor(ser.modality)}`}>
                        {ser.modality}
                      </span>
                    </div>

                    {/* RadiAnt-style Bold Slice Count Badge (Bottom-Right) */}
                    <div className="absolute bottom-0.5 right-0.5 pointer-events-none bg-black/90 px-1 py-0.2 rounded text-[9px] font-mono font-bold text-cyan-300 border border-slate-800 shadow">
                      {ser.numberOfInstances}
                    </div>
                  </div>

                  {/* Series Metadata & Parameters */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch py-0.2">
                    <div>
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-[9px] font-mono font-bold text-slate-400 bg-slate-800/80 px-1 rounded">
                          #{ser.seriesNumber}
                        </span>
                        {plane && (
                          <span className={`text-[8.5px] font-mono font-bold px-1 rounded border ${
                            plane === 'CORONAL'
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600/50'
                              : plane === 'SAGITTAL'
                              ? 'bg-amber-950/80 text-amber-300 border-amber-600/50'
                              : 'bg-indigo-950/80 text-indigo-300 border-indigo-600/50'
                          }`}>
                            {plane === 'CORONAL' ? 'COR' : plane === 'SAGITTAL' ? 'SAG' : 'AX'}
                          </span>
                        )}
                      </div>

                      {/* Series Description - full readability without premature cutoff */}
                      <h4
                        className={`font-semibold text-[11px] leading-snug transition-colors line-clamp-2 ${
                          isSelected ? 'text-cyan-300' : 'text-slate-200 group-hover:text-cyan-300'
                        }`}
                      >
                        {ser.seriesDescription || `Series ${ser.seriesNumber}`}
                      </h4>
                    </div>

                    <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-800/80 mt-1">
                      <span className="text-cyan-300 font-mono font-medium">{ser.numberOfInstances} imgs</span>
                      <span className="text-slate-400 font-mono text-[9px]">
                        {repInstance?.sliceThickness ? `${repInstance.sliceThickness.toFixed(1)}mm` : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500">
            <Layers className="w-8 h-8 text-slate-600 mb-2 animate-pulse" />
            <p className="text-xs font-semibold text-slate-400">No series</p>
          </div>
        )}
      </div>

      {/* Live PACS Download Counter & Progress Panel */}
      {pacsDownloadState && (pacsDownloadState.isDownloading || pacsDownloadState.isComplete) && (
        <div className="p-2 bg-gradient-to-b from-cyan-950/70 to-slate-950/90 border-t border-cyan-800/60 flex flex-col gap-1.5 shrink-0 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between text-[10.5px]">
            <span className="flex items-center gap-1 text-cyan-300 font-semibold truncate">
              {pacsDownloadState.isDownloading ? (
                <>
                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-500"></span>
                  </span>
                  <span className="truncate">Downloading...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="text-emerald-300 truncate">Complete</span>
                </>
              )}
            </span>
            <span className="text-cyan-200 font-mono text-[10px] font-bold shrink-0 ml-1">
              {pacsDownloadState.downloadedSlices} {pacsDownloadState.totalSlices ? `/ ${pacsDownloadState.totalSlices}` : ''}
            </span>
          </div>

          {/* Animated Progress Bar */}
          <div className="w-full bg-slate-800/90 rounded-full h-1.5 overflow-hidden p-0.2 border border-slate-700/50">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                pacsDownloadState.isComplete
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_0_8px_rgba(6,182,212,0.7)] animate-pulse'
              }`}
              style={{
                width: `${
                  pacsDownloadState.totalSlices
                    ? Math.min(100, Math.round((pacsDownloadState.downloadedSlices / pacsDownloadState.totalSlices) * 100))
                    : pacsDownloadState.isComplete
                    ? 100
                    : Math.min(95, Math.max(10, Math.round(pacsDownloadState.downloadedSlices / 15)))
                }%`
              }}
            />
          </div>

          <div className="flex items-center justify-between text-[9.5px] text-slate-400">
            <span className="font-mono text-cyan-200 truncate">
              {pacsDownloadState.downloadedSlices} slides {pacsDownloadState.totalSlices ? `of ${pacsDownloadState.totalSlices}` : ''}
            </span>
            {pacsDownloadState.totalSlices && (
              <span className="text-cyan-400 font-mono font-bold">
                {Math.round((pacsDownloadState.downloadedSlices / pacsDownloadState.totalSlices) * 100)}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* Bottom Status Footer */}
      <div className="p-2 border-t border-radiant-border bg-radiant-panel text-[10px] text-slate-400 flex items-center justify-between shrink-0">
        <span className="flex items-center gap-1">
          <FileSpreadsheet className="w-3 h-3 text-cyan-400" />
          <span>Studies: <strong className="text-slate-200">{studies.length}</strong></span>
        </span>
        <span className="text-cyan-400 font-mono text-[9.5px]">RadNode Viewer</span>
      </div>
    </aside>
  );
};
