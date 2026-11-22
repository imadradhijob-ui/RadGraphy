import React, { useState } from 'react';
import {
  Download,
  FileText,
  Printer,
  Check,
  X,
  Shield,
  Image as ImageIcon,
  Server,
  UploadCloud,
  RefreshCw,
  HardDrive,
  FolderOpen,
  Sparkles,
  Archive,
  Layers,
  FileCheck,
  ExternalLink
} from 'lucide-react';
import { DicomInstance, DicomSeries, DicomStudy, Measurement, ViewportState } from '../types/dicom';
import { ExportService } from '../services/exportService';
import { PacsService } from '../services/pacsClient';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  study: DicomStudy | null;
  currentSeries?: DicomSeries | null;
  currentInstance?: DicomInstance;
  currentViewport?: ViewportState;
  measurements: Measurement[];
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  study,
  currentSeries,
  currentInstance,
  currentViewport,
  measurements
}) => {
  const [format, setFormat] = useState<'png' | 'jpg' | 'bmp'>('png');
  const [resolutionScale, setResolutionScale] = useState<1 | 2 | 4>(1);
  const [exportScope, setExportScope] = useState<'current_slice' | 'current_series' | 'entire_study'>('current_slice');
  const [includeOverlay, setIncludeOverlay] = useState(true);
  const [anonymize, setAnonymize] = useState(false);

  // Storage / Folder State
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null);
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);

  // Progress and Feedback
  const [isExporting, setIsExporting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [exportProgress, setExportProgress] = useState<{
    percent: number;
    current: number;
    total: number;
    status: string;
  } | null>(null);

  const [dicomdirProgress, setDicomdirProgress] = useState<{
    percent: number;
    status: string;
  } | null>(null);

  // PACS C-STORE SCU State
  const pacsServers = PacsService.getServers();
  const [selectedPacsServerId, setSelectedPacsServerId] = useState<string>(pacsServers[0]?.id || '');
  const [pacsExportScope, setPacsExportScope] = useState<'current' | 'study'>('current');
  const [isSendingToPacs, setIsSendingToPacs] = useState(false);
  const [pacsSendStatus, setPacsSendStatus] = useState<string | null>(null);
  const [pacsProgress, setPacsProgress] = useState<{
    percent: number;
    current: number;
    total: number;
    status: string;
  } | null>(null);

  if (!isOpen || !study || !currentInstance) return null;

  const effectiveSeries = currentSeries || study.series[0] || null;
  const currentSeriesCount = effectiveSeries?.instances?.length || 1;
  const totalStudyCount = study.numberOfInstances || 1;

  const handleSelectDestinationFolder = async () => {
    if (window.electronAPI?.selectDirectory) {
      const dir = await window.electronAPI.selectDirectory();
      if (dir) {
        setSelectedDirectory(dir);
        setLastSavedPath(null);
      }
    }
  };

  const handleExportHighRes = async (forceZip: boolean = false) => {
    setIsExporting(true);
    setSuccessMessage('');
    setLastSavedPath(null);
    setExportProgress({ percent: 5, current: 0, total: 1, status: 'Preparing high-resolution images...' });

    try {
      const targetDir = forceZip ? undefined : (selectedDirectory || undefined);
      const res = await ExportService.exportHighResPackage(
        study,
        effectiveSeries,
        currentInstance,
        {
          scope: exportScope,
          resolutionScale,
          format,
          includeOverlays: includeOverlay,
          anonymize,
          measurements,
          windowCenter: currentViewport?.windowCenter,
          windowWidth: currentViewport?.windowWidth,
          lut: currentViewport?.lut,
          invert: currentViewport?.invert,
          targetBaseDir: targetDir,
          onProgress: (p) => setExportProgress(p)
        }
      );

      if (res.savedPath) {
        setLastSavedPath(res.savedPath);
        setSuccessMessage(`Saved ${res.count} high-res images directly to folder / USB drive!`);
      } else if (res.isZip) {
        setSuccessMessage(`Exported ${res.count} high-res images in structured ZIP package!`);
      } else {
        setSuccessMessage('High-resolution image saved successfully!');
      }
    } catch (err: any) {
      alert(`Export Error: ${err?.message || 'Failed to export images'}`);
    } finally {
      setIsExporting(false);
      setTimeout(() => setExportProgress(null), 4000);
    }
  };

  const handleOpenSavedFolder = () => {
    if (lastSavedPath && window.electronAPI?.openFolder) {
      window.electronAPI.openFolder(lastSavedPath);
    }
  };

  const handleGenerateReport = () => {
    const canvas = ExportService.renderHighResInstanceCanvas(currentInstance, study, effectiveSeries, {
      resolutionScale: 2,
      includeOverlays: includeOverlay,
      anonymize,
      measurements,
      windowCenter: currentViewport?.windowCenter,
      windowWidth: currentViewport?.windowWidth,
      lut: currentViewport?.lut,
      invert: currentViewport?.invert
    });
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    ExportService.generateStudyReport(study, currentInstance, measurements, dataUrl, anonymize);
    onClose();
  };

  const handleExportDicomDir = async () => {
    setIsExporting(true);
    setDicomdirProgress({ percent: 5, status: 'Starting DICOMDIR export...' });
    try {
      await ExportService.exportStudyAsDicomdirZip(study, (p) => {
        setDicomdirProgress({ percent: p.percent, status: p.status });
      });
      setSuccessMessage('DICOMDIR media package exported successfully!');
      setTimeout(() => {
        setSuccessMessage('');
        setDicomdirProgress(null);
        onClose();
      }, 2000);
    } catch (err: any) {
      alert(`Error exporting DICOMDIR package: ${err?.message || 'Unknown error'}`);
      setDicomdirProgress(null);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSendToPacs = async () => {
    const targetServer = pacsServers.find(s => s.id === selectedPacsServerId) || pacsServers[0];
    if (!targetServer) {
      alert('No PACS server configured. Please configure a PACS server in PACS Settings.');
      return;
    }

    setIsSendingToPacs(true);
    setPacsSendStatus(`Preparing DICOM instances for ${targetServer.name}...`);
    setPacsProgress({
      percent: 0,
      current: 0,
      total: pacsExportScope === 'current' ? 1 : study.numberOfInstances,
      status: 'Starting upload to PACS...'
    });

    try {
      const targetInstances: DicomInstance[] = [];
      if (pacsExportScope === 'current') {
        targetInstances.push(currentInstance);
      } else {
        for (const ser of study.series) {
          for (const inst of ser.instances) {
            targetInstances.push(inst);
          }
        }
      }

      const total = targetInstances.length;
      const BATCH_SIZE = 15;
      let totalStored = 0;

      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batchSlice = targetInstances.slice(i, i + BATCH_SIZE);
        const batchPayload: Array<{ fileName: string; buffer: ArrayBuffer | string }> = [];

        for (const inst of batchSlice) {
          let buf: ArrayBuffer | null = null;
          if (inst.rawBuffer && inst.rawBuffer.byteLength > 128) {
            buf = inst.rawBuffer;
          } else if (inst.filePath && window.electronAPI?.readFile) {
            buf = await window.electronAPI.readFile(inst.filePath);
          }

          if (buf && buf.byteLength > 128) {
            const fileName = `IM_${String(inst.instanceNumber || 1).padStart(4, '0')}.dcm`;
            batchPayload.push({ fileName, buffer: buf });
          }
        }

        if (batchPayload.length > 0) {
          const res = await PacsService.sendToPacs(targetServer, batchPayload);
          if (!res.success) {
            throw new Error(res.error || `Failed storing batch at index ${i}`);
          }
          totalStored += res.storedCount || batchPayload.length;
        }

        const pct = Math.min(100, Math.round(((i + batchSlice.length) / total) * 100));
        setPacsProgress({
          percent: pct,
          current: Math.min(total, i + batchSlice.length),
          total,
          status: `Pushed ${totalStored} of ${total} instances...`
        });
      }

      setSuccessMessage(`Successfully sent ${totalStored} DICOM instances to ${targetServer.name}!`);
      setTimeout(() => {
        setSuccessMessage('');
        setPacsProgress(null);
      }, 3000);
    } catch (err: any) {
      alert(`PACS C-STORE Error: ${err?.message || 'Failed to push instances to PACS'}`);
      setPacsProgress(null);
    } finally {
      setIsSendingToPacs(false);
      setPacsSendStatus(null);
    }
  };

  const isElectron = !!window.electronAPI?.selectDirectory;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-xs text-slate-200 animate-fade-in">
        {/* Header */}
        <div className="h-14 bg-slate-950/90 border-b border-slate-800 px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center shadow-inner">
              <Download className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-white tracking-wide flex items-center gap-2">
                <span>Save High-Resolution Images & Reports</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-500/40 text-cyan-300">
                  HD Medical Export
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                {study.patientName.replace(/\^/g, ' ')} • ID: {study.patientId} • {study.studyDescription}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* 1. Export Scope Selection */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <label className="text-[11px] text-slate-300 font-bold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>1. Export Scope (نطاق الحفظ):</span>
              </span>
              <span className="text-amber-400 font-mono text-[10.5px]">
                {exportScope === 'current_slice'
                  ? '1 Image'
                  : exportScope === 'current_series'
                  ? `${currentSeriesCount} Images`
                  : `${totalStudyCount} Images (All Series)`}
              </span>
            </label>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setExportScope('current_slice')}
                className={`py-2 px-2.5 rounded-lg border text-left flex flex-col gap-0.5 transition-all ${
                  exportScope === 'current_slice'
                    ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200 ring-1 ring-cyan-400/30'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800/80'
                }`}
              >
                <span className="font-bold text-white text-[11px]">Current Slice</span>
                <span className="text-[9.5px] text-slate-400">الشريحة الحالية فقط</span>
              </button>

              <button
                type="button"
                onClick={() => setExportScope('current_series')}
                className={`py-2 px-2.5 rounded-lg border text-left flex flex-col gap-0.5 transition-all ${
                  exportScope === 'current_series'
                    ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200 ring-1 ring-cyan-400/30'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800/80'
                }`}
              >
                <span className="font-bold text-white text-[11px]">Current Series</span>
                <span className="text-[9.5px] text-slate-400">السلسلة الحالية ({currentSeriesCount} صور)</span>
              </button>

              <button
                type="button"
                onClick={() => setExportScope('entire_study')}
                className={`py-2 px-2.5 rounded-lg border text-left flex flex-col gap-0.5 transition-all ${
                  exportScope === 'entire_study'
                    ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200 ring-1 ring-cyan-400/30'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800/80'
                }`}
              >
                <span className="font-bold text-white text-[11px]">Entire Study</span>
                <span className="text-[9.5px] text-slate-400">الدراسة كاملة ({totalStudyCount} صور)</span>
              </button>
            </div>
          </div>

          {/* 2. Resolution & Quality */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <label className="text-[11px] text-slate-300 font-bold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>2. Image Resolution & Clarity (دقة وجودة الصورة):</span>
              </span>
              <span className="text-cyan-400 font-mono text-[10.5px]">
                Matrix: {currentInstance.columns}x{currentInstance.rows}
              </span>
            </label>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setResolutionScale(1)}
                className={`py-2 px-2.5 rounded-lg border text-left flex flex-col gap-0.5 transition-all ${
                  resolutionScale === 1
                    ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200 ring-1 ring-cyan-400/30'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800/80'
                }`}
              >
                <span className="font-bold text-white text-[11px]">1X Native DICOM</span>
                <span className="text-[9.5px] text-slate-400">100% الدقة الأصلية الكاملة</span>
              </button>

              <button
                type="button"
                onClick={() => setResolutionScale(2)}
                className={`py-2 px-2.5 rounded-lg border text-left flex flex-col gap-0.5 transition-all ${
                  resolutionScale === 2
                    ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200 ring-1 ring-cyan-400/30'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800/80'
                }`}
              >
                <span className="font-bold text-white text-[11px]">2X High-Definition</span>
                <span className="text-[9.5px] text-slate-400">دقة مضاعفة فائقة النقاء</span>
              </button>

              <button
                type="button"
                onClick={() => setResolutionScale(4)}
                className={`py-2 px-2.5 rounded-lg border text-left flex flex-col gap-0.5 transition-all ${
                  resolutionScale === 4
                    ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200 ring-1 ring-cyan-400/30'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800/80'
                }`}
              >
                <span className="font-bold text-white text-[11px]">4X Ultra-HD 4K</span>
                <span className="text-[9.5px] text-slate-400">طباعة سريرية 300 DPI</span>
              </button>
            </div>
          </div>

          {/* 3. Image Format & Clinical Overlays */}
          <div className="grid grid-cols-2 gap-3">
            {/* Format Selection */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-1.5">
              <label className="text-[11px] text-slate-300 font-bold block">Image Format:</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['png', 'jpg', 'bmp'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setFormat(fmt)}
                    className={`py-1.5 rounded-lg font-bold text-xs uppercase border transition-all ${
                      format === fmt
                        ? 'bg-cyan-600/30 text-cyan-300 border-cyan-400 shadow-sm'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
              <p className="text-[9.5px] text-slate-500 font-mono mt-1">
                {format === 'png' ? 'PNG: Lossless, highest fidelity' : format === 'jpg' ? 'JPG: 98% quality, light size' : 'BMP: Uncompressed'}
              </p>
            </div>

            {/* Checkboxes */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2 flex flex-col justify-center">
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={includeOverlay}
                  onChange={(e) => setIncludeOverlay(e.target.checked)}
                  className="accent-cyan-500 rounded"
                />
                <span className="font-medium text-slate-200">Include HUD Overlays & Scale Ruler</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-amber-300">
                <input
                  type="checkbox"
                  checked={anonymize}
                  onChange={(e) => setAnonymize(e.target.checked)}
                  className="accent-amber-500 rounded"
                />
                <Shield className="w-3.5 h-3.5" />
                <span>Anonymize Patient PHI</span>
              </label>
            </div>
          </div>

          {/* 4. Target Destination (USB Flash Drive / Local Folder) */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3 shadow-inner">
            <div className="flex items-center justify-between">
              <label className="text-[11.5px] text-cyan-300 font-bold flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-cyan-400" />
                <span>Save Destination (مكان الحفظ على الفلاشة أو الكمبيوتر):</span>
              </label>
              {isElectron && (
                <button
                  type="button"
                  onClick={handleSelectDestinationFolder}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 font-semibold text-[10.5px] flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{selectedDirectory ? 'Change Folder / USB' : 'Browse USB / Folder'}</span>
                </button>
              )}
            </div>

            {/* Path Display */}
            {selectedDirectory ? (
              <div className="px-3 py-2 rounded-lg bg-slate-900 border border-emerald-500/40 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2 text-emerald-300 truncate">
                  <HardDrive className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span className="truncate">{selectedDirectory}</span>
                </div>
                <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/40 font-bold shrink-0">
                  Ready
                </span>
              </div>
            ) : (
              <div className="px-3 py-2 rounded-lg bg-slate-900/60 border border-dashed border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <span>Direct Save to USB Flash Drive or PC Directory:</span>
                {isElectron ? (
                  <button
                    type="button"
                    onClick={handleSelectDestinationFolder}
                    className="text-cyan-400 hover:underline font-semibold"
                  >
                    Click to choose USB or folder
                  </button>
                ) : (
                  <span className="text-slate-500">ZIP download mode</span>
                )}
              </div>
            )}

            {/* Main Action Buttons */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => handleExportHighRes(false)}
                disabled={isExporting}
                className="py-3 px-4 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-cyan-900/20 transition-all text-xs"
              >
                {isExporting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <HardDrive className="w-4 h-4 text-emerald-200" />
                )}
                <span>
                  {selectedDirectory ? 'Save Images to Selected Folder / USB' : 'Export High-Res Images'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleExportHighRes(true)}
                disabled={isExporting}
                className="py-3 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md transition-all text-xs"
              >
                <Archive className="w-4 h-4 text-amber-400" />
                <span>Download as Structured ZIP</span>
              </button>
            </div>

            {/* Quick Open Folder Link if saved */}
            {lastSavedPath && (
              <div className="pt-1 flex items-center justify-between bg-emerald-950/40 border border-emerald-500/40 rounded-lg p-2.5">
                <span className="text-[11px] text-emerald-300 font-medium truncate">
                  Saved successfully to: {lastSavedPath}
                </span>
                <button
                  type="button"
                  onClick={handleOpenSavedFolder}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-[10.5px] flex items-center gap-1.5 shrink-0 shadow transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Folder in Windows</span>
                </button>
              </div>
            )}
          </div>

          {/* Export Progress Bar */}
          {exportProgress && (
            <div className="bg-cyan-950/50 border border-cyan-500/40 rounded-xl p-3.5 space-y-2 animate-fade-in">
              <div className="flex justify-between items-center text-xs font-semibold text-cyan-300">
                <span className="truncate max-w-[340px]">{exportProgress.status}</span>
                <span className="font-mono font-bold text-amber-300">
                  {exportProgress.percent}% ({exportProgress.current}/{exportProgress.total})
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-cyan-800/40">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300"
                  style={{ width: `${exportProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* 5. Additional Medical Exports: Report & DICOMDIR */}
          <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleGenerateReport}
              disabled={isExporting}
              className="p-3 bg-blue-900/60 hover:bg-blue-800/80 border border-blue-700/60 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              <Printer className="w-4 h-4 text-blue-300" />
              <span>Print Radiology Report</span>
            </button>

            <button
              type="button"
              onClick={handleExportDicomDir}
              disabled={isExporting}
              className="p-3 bg-purple-950/60 hover:bg-purple-900/80 border border-purple-700/60 disabled:opacity-50 text-purple-200 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              <Archive className="w-4 h-4 text-purple-300" />
              <span>Export DICOMDIR Package</span>
            </button>
          </div>

          {/* DICOMDIR Progress Bar */}
          {dicomdirProgress && (
            <div className="bg-purple-950/50 border border-purple-500/40 rounded-xl p-3 space-y-2 animate-fade-in">
              <div className="flex justify-between items-center text-xs font-semibold text-purple-300">
                <span>{dicomdirProgress.status}</span>
                <span className="font-mono">{dicomdirProgress.percent}%</span>
              </div>
              <div className="w-full h-2 bg-purple-950 rounded-full overflow-hidden border border-purple-800/40">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-400 transition-all duration-300"
                  style={{ width: `${dicomdirProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* 6. PACS C-STORE SCU Push */}
          <div className="pt-2 border-t border-slate-800/80">
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs text-amber-300">
                  <UploadCloud className="w-4 h-4 text-amber-400" />
                  <span>Send to PACS Server (C-STORE SCU)</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 font-mono">
                  DIMSE Store
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10.5px] text-slate-400 block mb-1">Target PACS Node:</label>
                  <select
                    value={selectedPacsServerId}
                    onChange={(e) => setSelectedPacsServerId(e.target.value)}
                    disabled={isSendingToPacs}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 font-medium focus:border-cyan-400 focus:outline-none cursor-pointer"
                  >
                    {pacsServers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.aeTitle})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10.5px] text-slate-400 block mb-1">Send Scope:</label>
                  <select
                    value={pacsExportScope}
                    onChange={(e) => setPacsExportScope(e.target.value as any)}
                    disabled={isSendingToPacs}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 font-medium focus:border-cyan-400 focus:outline-none cursor-pointer"
                  >
                    <option value="current">Current Slice Only (1 slice)</option>
                    <option value="study">Entire Study ({study.numberOfInstances} slices)</option>
                  </select>
                </div>
              </div>

              {pacsProgress && (
                <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between items-center text-xs font-semibold text-amber-300">
                    <span className="truncate max-w-[280px]">{pacsProgress.status}</span>
                    <span className="font-mono">{pacsProgress.percent}% ({pacsProgress.current}/{pacsProgress.total})</span>
                  </div>
                  <div className="w-full h-2 bg-amber-950 rounded-full overflow-hidden border border-amber-800/40">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300"
                      style={{ width: `${pacsProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleSendToPacs}
                disabled={isSendingToPacs || pacsServers.length === 0}
                className="w-full py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2 shadow-md transition-all text-xs"
              >
                {isSendingToPacs ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{pacsSendStatus || 'Sending to PACS...'}</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Push to Selected PACS Server</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Success Message */}
          {successMessage && (
            <div className="bg-emerald-950/70 border border-emerald-500/60 text-emerald-200 p-3 rounded-xl flex items-center gap-2.5 font-bold shadow-md animate-fade-in">
              <Check className="w-5 h-5 text-emerald-400 shrink-0" />
              <span className="text-xs">{successMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-12 bg-slate-950/90 border-t border-slate-800 px-5 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-emerald-400 font-mono font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>POWERED BY AL-SHAAB HOSPITAL IT TEAM</span>
          </span>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
