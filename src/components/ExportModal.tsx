import React, { useState } from 'react';
import { Download, FileText, Printer, Check, X, Shield, Image, Server, UploadCloud, RefreshCw } from 'lucide-react';
import { DicomInstance, DicomStudy, Measurement } from '../types/dicom';
import { ExportService } from '../services/exportService';
import { PacsService } from '../services/pacsClient';
import { DicomDirGenerator } from '../services/dicomdirGenerator';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  study: DicomStudy | null;
  currentInstance?: DicomInstance;
  measurements: Measurement[];
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  study,
  currentInstance,
  measurements
}) => {
  const [format, setFormat] = useState<'png' | 'jpg' | 'bmp'>('png');
  const [includeOverlay, setIncludeOverlay] = useState(true);
  const [anonymize, setAnonymize] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
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

  const handleExportImage = () => {
    setIsExporting(true);
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    if (canvas) {
      const pId = anonymize ? 'ANONYMOUS' : study.patientId;
      const fileName = `${pId}_${study.studyDescription.replace(/\s+/g, '_')}_IM${currentInstance.instanceNumber}`;
      ExportService.downloadCanvasImage(canvas, fileName, format);
      setSuccessMessage('Image exported successfully!');
      setTimeout(() => {
        setSuccessMessage('');
        onClose();
      }, 1000);
    }
    setIsExporting(false);
  };

  const handleGenerateReport = () => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const dataUrl = canvas ? canvas.toDataURL('image/jpeg', 0.9) : undefined;
    ExportService.generateStudyReport(study, currentInstance, measurements, dataUrl, anonymize);
    onClose();
  };

  const handleExportDicomDir = async () => {
    if (!study) return;
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
    if (!study || !currentInstance) return;
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
      // 1. Collect target instance references (without building massive buffers upfront)
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
      // Send in safe, fast batches of 15 instances to avoid V8 string length limits and memory spikes
      const BATCH_SIZE = 15;
      let totalStored = 0;

      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batchSlice = targetInstances.slice(i, i + BATCH_SIZE);
        const batchPayload: Array<{ fileName: string; buffer: ArrayBuffer | string }> = [];

        // Synthesize/extract buffers only for this specific batch
        for (const inst of batchSlice) {
          let buf: ArrayBuffer | Uint8Array | null = inst.rawBuffer || null;
          if (!buf) {
            buf = DicomDirGenerator.synthesizeDicomFile(inst, study);
          }
          batchPayload.push({
            fileName: `${inst.sopInstanceUid || `slice_${Date.now()}`}.dcm`,
            buffer: buf instanceof Uint8Array ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf
          });
        }

        const currentNum = Math.min(i + batchSlice.length, total);
        const percent = Math.round((currentNum / total) * 100);
        const msg = `Pushing slices ${i + 1} - ${currentNum} of ${total} to [${targetServer.aeTitle}]...`;

        setPacsSendStatus(msg);
        setPacsProgress({
          percent,
          current: currentNum,
          total,
          status: msg
        });

        const res = await PacsService.sendToPacs(targetServer, batchPayload);
        if (!res.success && res.error) {
          throw new Error(res.error);
        }
        totalStored += (res.storedCount || batchPayload.length);
      }

      setSuccessMessage(`Successfully pushed ${totalStored} DICOM instances to PACS [${targetServer.aeTitle}]!`);
      setTimeout(() => {
        setSuccessMessage('');
        setPacsProgress(null);
        onClose();
      }, 2500);
    } catch (err: any) {
      alert(`PACS C-STORE Error: ${err?.message || 'Failed to push instances to PACS'}`);
      setPacsProgress(null);
    } finally {
      setIsSendingToPacs(false);
      setPacsSendStatus(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-radiant-panel border border-radiant-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden text-xs text-slate-200">
        {/* Header */}
        <div className="h-12 bg-radiant-darkest border-b border-radiant-border px-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm text-cyan-400">
            <Download className="w-5 h-5 text-cyan-300" />
            <span>Export Images, Reports & DICOMDIR Media</span>
          </div>

          <button
            onClick={onClose}
            className="p-1 hover:bg-radiant-hover text-slate-400 hover:text-white rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Options Grid */}
          <div className="space-y-3">
            {/* Format Selection */}
            <div>
              <label className="text-[11px] text-slate-400 font-semibold block mb-1">Image Format:</label>
              <div className="grid grid-cols-3 gap-2">
                {(['png', 'jpg', 'bmp'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setFormat(fmt)}
                    className={`py-2 rounded-lg font-bold text-xs uppercase border transition-all ${
                      format === fmt
                        ? 'bg-cyan-600/30 text-cyan-300 border-cyan-400'
                        : 'bg-radiant-card text-slate-400 border-radiant-border hover:bg-radiant-hover'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            {/* Checkboxes */}
            <div className="bg-radiant-card border border-radiant-border rounded-lg p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeOverlay}
                  onChange={(e) => setIncludeOverlay(e.target.checked)}
                  className="accent-cyan-500 rounded"
                />
                <span>Include Medical HUD Text Overlays & Measurements</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-amber-300">
                <input
                  type="checkbox"
                  checked={anonymize}
                  onChange={(e) => setAnonymize(e.target.checked)}
                  className="accent-amber-500 rounded"
                />
                <Shield className="w-3.5 h-3.5" />
                <span>Anonymize Patient Personal Health Information (PHI)</span>
              </label>
            </div>
          </div>

          {/* Action Cards */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleExportImage}
              disabled={isExporting}
              className="p-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl font-bold flex flex-col items-center gap-1 shadow-md transition-colors"
            >
              <Image className="w-5 h-5" />
              <span>Export Current Slice</span>
            </button>

            <button
              onClick={handleGenerateReport}
              disabled={isExporting}
              className="p-3 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl font-bold flex flex-col items-center gap-1 shadow-md transition-colors"
            >
              <Printer className="w-5 h-5" />
              <span>Print Radiology Report</span>
            </button>
          </div>

          {/* New Feature: Full DICOMDIR Media Package Export */}
          <div className="pt-2 border-t border-radiant-border">
            <button
              onClick={handleExportDicomDir}
              disabled={isExporting}
              className="w-full p-3 bg-gradient-to-r from-purple-800 to-indigo-700 hover:from-purple-700 hover:to-indigo-600 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-between shadow-lg border border-purple-500/40 transition-all group"
            >
              <div className="flex items-center gap-2.5 text-left">
                <div className="w-9 h-9 rounded-lg bg-purple-950/60 flex items-center justify-center border border-purple-400/30 text-purple-300 group-hover:scale-105 transition-transform">
                  <Download className="w-5 h-5 text-purple-300" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>Export DICOMDIR Media Package</span>
                    <span className="px-1.5 py-0.5 rounded text-[9.5px] font-mono bg-purple-900/80 text-purple-200 border border-purple-400/40">CD / DVD / USB</span>
                  </div>
                  <div className="text-[10.5px] text-purple-200/80 font-normal">
                    Packages full study with compliant DICOMDIR file into a downloadable .zip
                  </div>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-purple-300">
                {study.numberOfInstances} slices
              </span>
            </button>
          </div>

          {/* Real-time DICOMDIR Export Progress Bar */}
          {dicomdirProgress && (
            <div className="bg-purple-950/40 border border-purple-500/40 rounded-xl p-3 space-y-2">
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

          {/* Reverse Export to PACS (C-STORE SCU) */}
          <div className="pt-2 border-t border-radiant-border space-y-2">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 space-y-2.5 shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs text-amber-300">
                  <UploadCloud className="w-4 h-4 text-amber-400" />
                  <span>Send to PACS Server (C-STORE SCU)</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">DIMSE Store</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10.5px] text-slate-400 block mb-1">Target PACS Node:</label>
                  <select
                    value={selectedPacsServerId}
                    onChange={(e) => setSelectedPacsServerId(e.target.value)}
                    disabled={isSendingToPacs}
                    className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-xs text-slate-200 font-medium focus:border-cyan-400 focus:outline-none cursor-pointer"
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
                    className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-xs text-slate-200 font-medium focus:border-cyan-400 focus:outline-none cursor-pointer"
                  >
                    <option value="current">Current Slice Only (1 slice)</option>
                    <option value="study">Entire Study ({study.numberOfInstances} slices)</option>
                  </select>
                </div>
              </div>

              {/* Real-time PACS Push Progress Bar */}
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

          {successMessage && (
            <div className="bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 p-2.5 rounded-lg flex items-center gap-2 font-bold">
              <Check className="w-4 h-4" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-10 bg-radiant-darkest border-t border-radiant-border px-4 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1 bg-radiant-card hover:bg-radiant-hover text-slate-300 rounded font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
