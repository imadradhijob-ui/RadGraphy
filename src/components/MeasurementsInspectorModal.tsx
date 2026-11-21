import React, { useState } from 'react';
import {
  X,
  Trash2,
  Copy,
  Download,
  Check,
  Ruler,
  Crosshair,
  CircleDot,
  Compass,
  ArrowUpRight,
  Activity,
  Layers,
  ChevronRight
} from 'lucide-react';
import { Measurement, ToolType } from '../types/dicom';

interface MeasurementsInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  measurements: Measurement[];
  patientName?: string;
  patientId?: string;
  studyDescription?: string;
  onDeleteMeasurement: (id: string) => void;
  onClearAll: () => void;
  onJumpToSlice?: (instanceIndex: number) => void;
}

export const MeasurementsInspectorModal: React.FC<MeasurementsInspectorModalProps> = ({
  isOpen,
  onClose,
  measurements,
  patientName = 'Anonymous',
  patientId = 'N/A',
  studyDescription = 'Medical Study',
  onDeleteMeasurement,
  onClearAll,
  onJumpToSlice
}) => {
  const [copied, setCopied] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');

  if (!isOpen) return null;

  const filteredMeasurements =
    filterType === 'all'
      ? measurements
      : measurements.filter(
          (m) =>
            m.type === filterType ||
            (filterType === 'rectangle_roi' && m.type === 'ellipse_roi')
        );

  const getToolIcon = (type: ToolType) => {
    switch (type) {
      case 'distance':
        return <Ruler className="w-4 h-4 text-cyan-400" />;
      case 'angle':
      case 'cobb_angle':
        return <Compass className="w-4 h-4 text-amber-400" />;
      case 'rectangle_roi':
      case 'ellipse_roi':
      case 'ctr':
        return <CircleDot className="w-4 h-4 text-emerald-400" />;
      case 'hu_probe':
        return <Crosshair className="w-4 h-4 text-rose-400" />;
      case 'arrow':
        return <ArrowUpRight className="w-4 h-4 text-indigo-400" />;
      default:
        return <Activity className="w-4 h-4 text-slate-400" />;
    }
  };

  const getFormattedValue = (m: Measurement): { primary: string; secondary?: string } => {
    switch (m.type) {
      case 'distance':
        return {
          primary: m.distanceMm !== undefined ? `${m.distanceMm.toFixed(1)} mm` : '-'
        };
      case 'angle':
        return {
          primary: m.angleDeg !== undefined ? `${m.angleDeg.toFixed(1)}°` : '-'
        };
      case 'cobb_angle':
        return {
          primary: m.cobbDeg !== undefined ? `Cobb: ${m.cobbDeg.toFixed(1)}°` : '-'
        };
      case 'rectangle_roi':
      case 'ellipse_roi':
        if (m.roiValues) {
          return {
            primary: `${m.roiValues.areaMm2 ? (m.roiValues.areaMm2 / 100).toFixed(2) : '-'} cm² (Mean: ${m.roiValues.meanHu?.toFixed(1) || '-'} HU)`,
            secondary: `Min: ${m.roiValues.minHu ?? '-'} | Max: ${m.roiValues.maxHu ?? '-'} | SD: ${m.roiValues.stdDevHu?.toFixed(1) || '-'}`
          };
        }
        return { primary: 'ROI Area' };
      case 'ctr':
        if (m.ctrValues) {
          return {
            primary: `CTR: ${(m.ctrValues.ratio * 100).toFixed(1)}%`,
            secondary: `Heart: ${m.ctrValues.cardiacDiameterMm.toFixed(1)} mm | Thorax: ${m.ctrValues.thoracicDiameterMm.toFixed(1)} mm`
          };
        }
        return { primary: 'Cardiothoracic Ratio' };
      case 'hu_probe':
        return {
          primary: m.probeHu !== undefined ? `${m.probeHu} HU` : '-',
          secondary: m.tissueName ? `Tissue: ${m.tissueName}` : undefined
        };
      case 'arrow':
        return {
          primary: m.arrowText || 'Annotation',
          secondary: 'Visual marker'
        };
      default:
        return { primary: '-' };
    }
  };

  const handleCopySummary = () => {
    let summary = `RADNODE VIEWER - CLINICAL FINDINGS & MEASUREMENTS\n`;
    summary += `Patient: ${patientName.replace(/\^/g, ' ')} (ID: ${patientId})\n`;
    summary += `Study: ${studyDescription}\n`;
    summary += `Date: ${new Date().toLocaleDateString()}\n`;
    summary += `=================================================\n\n`;

    if (measurements.length === 0) {
      summary += `No annotations or measurements recorded.\n`;
    } else {
      measurements.forEach((m, idx) => {
        const val = getFormattedValue(m);
        const sliceStr = m.instanceIndex !== undefined ? ` [Slice #${m.instanceIndex + 1}]` : '';
        summary += `${idx + 1}. [${m.type.toUpperCase()}] ${val.primary}${sliceStr}\n`;
        if (val.secondary) {
          summary += `   Details: ${val.secondary}\n`;
        }
      });
    }

    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportCsv = () => {
    const headers = ['Index', 'Type', 'Slice', 'Primary_Value', 'Secondary_Details', 'Color'];
    const rows = measurements.map((m, idx) => {
      const val = getFormattedValue(m);
      return [
        idx + 1,
        m.type,
        m.instanceIndex !== undefined ? m.instanceIndex + 1 : '',
        `"${val.primary}"`,
        `"${val.secondary || ''}"`,
        m.color || '#00e5ff'
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `measurements_${patientId || 'study'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[85vh] animate-fade-in">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center shadow-inner">
              <Ruler className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Measurements & Annotations Inspector
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-950/90 border border-cyan-500/40 text-cyan-300">
                  {measurements.length} items
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {patientName.replace(/\^/g, ' ')} • {studyDescription}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="px-5 py-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 text-xs">
            {[
              { id: 'all', label: 'All' },
              { id: 'distance', label: 'Ruler' },
              { id: 'angle', label: 'Angle' },
              { id: 'rectangle_roi', label: 'ROI' },
              { id: 'hu_probe', label: 'HU Probe' }
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setFilterType(id)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                  filterType === id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopySummary}
              title="Copy clinical text summary to clipboard"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-cyan-400" />}
              <span>{copied ? 'Copied!' : 'Copy Summary'}</span>
            </button>

            <button
              onClick={handleExportCsv}
              disabled={measurements.length === 0}
              title="Download CSV table"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        {/* Measurements List Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredMeasurements.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-slate-500">
              <Layers className="w-8 h-8 text-slate-600 mb-2 stroke-1" />
              <p className="text-xs font-semibold text-slate-400">No measurements found</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Use ruler, angle, or ROI tools on viewport to measure</p>
            </div>
          ) : (
            filteredMeasurements.map((m, idx) => {
              const val = getFormattedValue(m);
              return (
                <div
                  key={m.id || idx}
                  className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-cyan-500/40 transition-all flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center shrink-0">
                      {getToolIcon(m.type)}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                          #{idx + 1} {m.type}
                        </span>
                        {m.instanceIndex !== undefined && (
                          <button
                            type="button"
                            onClick={() => onJumpToSlice && onJumpToSlice(m.instanceIndex!)}
                            title="Click to jump to this slice in viewport"
                            className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-[10px] font-mono font-bold hover:bg-cyan-800/60 transition-colors"
                          >
                            <span>Slice {m.instanceIndex + 1}</span>
                            <ChevronRight className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>

                      <div className="text-sm font-mono font-bold text-white tracking-wide mt-0.5 truncate">
                        {val.primary}
                      </div>

                      {val.secondary && (
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {val.secondary}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onDeleteMeasurement(m.id)}
                      title="Delete this measurement"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-500/30 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={onClearAll}
            disabled={measurements.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-rose-950/40 border border-rose-500/40 text-rose-300 hover:bg-rose-900/60 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear All Measurements</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition-colors shadow-md"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
