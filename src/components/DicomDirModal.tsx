import React, { useState, useEffect, useRef } from 'react';
import { Disc, FolderOpen, CheckCircle2, AlertTriangle, X, HardDrive, RefreshCw, AlertCircle } from 'lucide-react';
import { DicomStudy } from '../types/dicom';
import { parseDicomBufferFast, groupInstancesIntoStudies, isDicomBuffer } from '../services/dicomParser';
import { parseDicomDirBuffer } from '../services/dicomdirParser';
import { OpticalDriveService, OpticalDriveResult } from '../services/opticalDriveService';

interface DicomDirModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStudiesLoaded: (studies: DicomStudy[]) => void;
}

type ScanStatus = 'scanning' | 'reading' | 'not_detected' | 'error' | 'success' | 'idle';

export const DicomDirModal: React.FC<DicomDirModalProps> = ({
  isOpen,
  onClose,
  onStudiesLoaded
}) => {
  const [scanStatus, setScanStatus] = useState<ScanStatus>('scanning');
  const [statusMessage, setStatusMessage] = useState<string>('Searching for connected CD/DVD drive...');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [detectedDrive, setDetectedDrive] = useState<{ driveLetter?: string; volumeName?: string } | null>(null);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasAutoScannedRef = useRef<boolean>(false);

  // Direct CD/DVD Scanning Routine
  const startOpticalDriveScan = async () => {
    setScanStatus('scanning');
    setStatusMessage('Searching for connected optical CD/DVD drives...');
    setProgressPercent(10);
    setErrorMessage('');
    setDetectedDrive(null);

    try {
      const result: OpticalDriveResult = await OpticalDriveService.readDisc(
        (percent, msg) => {
          setScanStatus('reading');
          setProgressPercent(percent);
          setStatusMessage(msg);
        },
        (firstStudy) => {
          // As soon as the first slice is ready, give responsive feedback
          setStatusMessage(`Loading patient: ${firstStudy.patientName || 'Medical Study'}...`);
        }
      );

      if (result.detected && result.success && result.studies && result.studies.length > 0) {
        setScanStatus('success');
        setDetectedDrive({ driveLetter: result.driveLetter, volumeName: result.volumeName });
        setStatusMessage(`Successfully loaded ${result.studies.length} study (${result.filesCount || 0} images) from CD/DVD (${result.driveLetter || 'D:'}).`);
        setProgressPercent(100);

        onStudiesLoaded(result.studies);
        setTimeout(() => {
          onClose();
        }, 800);
      } else if (!result.detected) {
        setScanStatus('not_detected');
        setErrorMessage(result.message || 'No CD/DVD disc was detected in the drive.');
      } else {
        setScanStatus('not_detected');
        setErrorMessage(result.message || 'CD/DVD drive found, but no valid DICOM files were detected on the disc.');
      }
    } catch (err: any) {
      setScanStatus('error');
      setErrorMessage(err?.message || 'An error occurred while accessing the optical drive.');
    }
  };

  // Automatically start CD/DVD scan when the modal opens
  useEffect(() => {
    if (isOpen) {
      startOpticalDriveScan();
    } else {
      hasAutoScannedRef.current = false;
      setScanStatus('idle');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Fallback: Handle manual folder / USB selection
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setScanStatus('reading');
    setStatusMessage(`Scanning ${files.length} files from storage...`);
    setProgressPercent(0);

    const instances: any[] = [];
    const total = files.length;
    const chunkSize = 25;

    for (let i = 0; i < total; i += chunkSize) {
      const chunkEnd = Math.min(i + chunkSize, total);

      for (let j = i; j < chunkEnd; j++) {
        const file = files[j];
        try {
          const buffer = await file.arrayBuffer();

          if (file.name.toUpperCase() === 'DICOMDIR' || file.name.toUpperCase().endsWith('DICOMDIR')) {
            try { parseDicomDirBuffer(buffer); } catch (_) {}
          }

          if (isDicomBuffer(buffer)) {
            const inst = parseDicomBufferFast(buffer, file.name);
            if (inst) {
              inst.filePath = (file as any).path || file.name;
              instances.push(inst);
            }
          }
        } catch (_) {}
      }

      const percent = Math.round((chunkEnd / total) * 100);
      setProgressPercent(percent);
      setStatusMessage(`Indexed ${instances.length} slices (${percent}%)...`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    if (instances.length > 0) {
      const grouped = groupInstancesIntoStudies(instances, 'disc', 'USB Flash / Disc Media');
      onStudiesLoaded(grouped);
      setScanStatus('success');
      setStatusMessage(`Loaded ${grouped.length} study (${instances.length} images) successfully!`);
      setTimeout(() => onClose(), 600);
    } else {
      setScanStatus('error');
      setErrorMessage('No valid DICOM imaging files were recognized in this folder.');
    }
  };

  const handleManualFolderClick = () => {
    folderInputRef.current?.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-radiant-panel border border-radiant-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="h-12 bg-radiant-darkest border-b border-radiant-border px-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm text-amber-400">
            <Disc className="w-5 h-5 text-amber-300 animate-spin" style={{ animationDuration: scanStatus === 'reading' || scanStatus === 'scanning' ? '2s' : '0s' }} />
            <span>Optical CD/DVD Disc & DICOMDIR Reader</span>
          </div>

          <button
            onClick={onClose}
            className="p-1 hover:bg-radiant-hover text-slate-400 hover:text-white rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* 1. Scanning & Reading Active State */}
          {(scanStatus === 'scanning' || scanStatus === 'reading') && (
            <div className="flex flex-col items-center justify-center py-4 space-y-4 text-center">
              <div className="relative flex items-center justify-center">
                <div className="w-20 h-20 rounded-full border-4 border-amber-500/20 border-t-amber-400 animate-spin flex items-center justify-center"></div>
                <Disc className="w-10 h-10 text-amber-400 absolute animate-pulse" />
              </div>

              <div>
                <h3 className="font-bold text-base text-slate-100 mb-1">
                  {scanStatus === 'scanning' ? 'Searching for CD/DVD Disc...' : 'Reading Patient DICOM Studies...'}
                </h3>
                <p className="text-xs text-slate-300 max-w-sm">
                  {statusMessage}
                </p>
              </div>

              {/* Progress Bar */}
              <div className="w-full max-w-md bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-700/60 p-0.5">
                <div
                  className="bg-gradient-to-r from-amber-500 via-cyan-400 to-blue-500 h-full rounded-full transition-all duration-200"
                  style={{ width: `${Math.max(5, progressPercent)}%` }}
                ></div>
              </div>
              <span className="text-[11px] font-mono text-cyan-300">{progressPercent}%</span>
            </div>
          )}

          {/* 2. Success State */}
          {scanStatus === 'success' && (
            <div className="flex flex-col items-center justify-center py-4 space-y-3 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="font-bold text-base text-emerald-300">CD/DVD Loaded Successfully!</h3>
              <p className="text-xs text-slate-300">{statusMessage}</p>
              <div className="text-[11px] text-cyan-400 font-mono">Opening viewer now...</div>
            </div>
          )}

          {/* 3. Disc Not Detected State (The Pop-up Alert Requested by User) */}
          {scanStatus === 'not_detected' && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-xl flex items-start gap-3.5">
                <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400 flex-shrink-0 mt-0.5">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-amber-300 text-sm">
                    CD/DVD Disc Not Detected
                  </h4>
                  <p className="text-slate-200 text-xs leading-relaxed">
                    {errorMessage || 'No CD/DVD disc was detected in the drive. Please make sure the patient DICOM disc is properly inserted into the optical drive and try again.'}
                  </p>
                  <p className="text-[11px] text-amber-400/80 font-medium">
                    لم يتم العثور على قرص CD/DVD في محرك الأقراص. يرجى التأكد من وضع قرص المريض والمحاولة مجدداً.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={startOpticalDriveScan}
                  className="py-2.5 px-4 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold rounded-lg shadow-lg shadow-amber-500/30 flex items-center justify-center gap-2 transition-all active:scale-95 text-xs"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Retry CD/DVD Scan</span>
                </button>

                <button
                  type="button"
                  onClick={handleManualFolderClick}
                  className="py-2.5 px-4 bg-radiant-card hover:bg-radiant-hover text-slate-200 border border-radiant-border hover:border-cyan-500/60 font-semibold rounded-lg flex items-center justify-center gap-2 transition-all text-xs"
                >
                  <FolderOpen className="w-4 h-4 text-cyan-400" />
                  <span>Select Folder / USB</span>
                </button>
              </div>
            </div>
          )}

          {/* 4. Error State */}
          {scanStatus === 'error' && (
            <div className="space-y-4">
              <div className="p-4 bg-rose-950/40 border border-rose-500/40 rounded-xl flex items-start gap-3.5">
                <div className="p-2 bg-rose-500/20 rounded-lg text-rose-400 flex-shrink-0 mt-0.5">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-rose-300 text-sm">
                    Optical Drive Read Error
                  </h4>
                  <p className="text-slate-200 text-xs leading-relaxed">
                    {errorMessage}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={startOpticalDriveScan}
                  className="py-2 px-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg flex items-center justify-center gap-2 text-xs"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Retry Scan</span>
                </button>
                <button
                  type="button"
                  onClick={handleManualFolderClick}
                  className="py-2 px-3 bg-radiant-card hover:bg-radiant-hover text-slate-200 border border-radiant-border rounded-lg flex items-center justify-center gap-2 text-xs"
                >
                  <FolderOpen className="w-4 h-4 text-cyan-400" />
                  <span>Browse Folder Manually</span>
                </button>
              </div>
            </div>
          )}

          {/* Hidden inputs */}
          <input
            type="file"
            ref={folderInputRef}
            // @ts-ignore
            webkitdirectory="true"
            directory="true"
            multiple
            onChange={handleFilesSelected}
            className="hidden"
          />
          <input
            type="file"
            ref={fileInputRef}
            multiple
            onChange={handleFilesSelected}
            className="hidden"
          />
        </div>

        {/* Footer */}
        <div className="h-12 bg-radiant-darkest border-t border-radiant-border px-4 flex items-center justify-between">
          <span className="text-slate-500 text-[11px] font-mono">
            {detectedDrive?.driveLetter ? `Drive: ${detectedDrive.driveLetter} (${detectedDrive.volumeName || 'DISC'})` : 'Auto CD/DVD Drive Detection'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-radiant-card hover:bg-radiant-hover text-slate-300 rounded font-semibold text-xs transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
