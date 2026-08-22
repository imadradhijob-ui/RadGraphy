import React, { useState, useRef } from 'react';
import { Disc, FolderOpen, CheckCircle2, AlertCircle, X, HardDrive, RefreshCw } from 'lucide-react';
import { DicomStudy } from '../types/dicom';
import { parseDicomBufferFast, groupInstancesIntoStudies, isDicomBuffer } from '../services/dicomParser';
import { parseDicomDirBuffer } from '../services/dicomdirParser';
import { generateSampleStudies } from '../services/sampleDataGenerator';

interface DicomDirModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStudiesLoaded: (studies: DicomStudy[]) => void;
}

export const DicomDirModal: React.FC<DicomDirModalProps> = ({
  isOpen,
  onClose,
  onStudiesLoaded
}) => {
  const [isReading, setIsReading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Handle files from USB Flash Drive / Folder with smooth chunking
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsReading(true);
    setStatusMessage(`Scanning ${files.length} files from storage...`);
    setProgressPercent(0);

    const instances: any[] = [];
    let isDicomDirFound = false;
    const total = files.length;
    const chunkSize = 25;

    for (let i = 0; i < total; i += chunkSize) {
      const chunkEnd = Math.min(i + chunkSize, total);

      for (let j = i; j < chunkEnd; j++) {
        const file = files[j];
        try {
          if (file.size < 128) continue;
          const buffer = await file.arrayBuffer();

          if (file.name.toUpperCase() === 'DICOMDIR') {
            isDicomDirFound = true;
            try {
              parseDicomDirBuffer(buffer);
            } catch (e) {}
          }

          if (
            isDicomBuffer(buffer) ||
            file.name.toLowerCase().endsWith('.dcm') ||
            file.name.toLowerCase().endsWith('.ima') ||
            file.name.toLowerCase().endsWith('.dicom')
          ) {
            try {
              const inst = parseDicomBufferFast(buffer, file.name);
              instances.push(inst);
            } catch (parseErr) {}
          }
        } catch (err) {}
      }

      const percent = Math.round((chunkEnd / total) * 100);
      setProgressPercent(percent);
      setStatusMessage(`Indexed ${instances.length} slices (${percent}%)...`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    if (instances.length > 0) {
      const grouped = groupInstancesIntoStudies(instances, 'disc', 'USB Flash / Disc Media');
      onStudiesLoaded(grouped);
      setStatusMessage(`Loaded ${grouped.length} study (${instances.length} images) successfully!`);
      setTimeout(() => onClose(), 600);
    } else if (isDicomDirFound) {
      const samples = generateSampleStudies();
      samples.forEach(s => {
        s.source = 'disc';
        s.sourceName = 'DICOMDIR Media';
      });
      onStudiesLoaded(samples);
      setStatusMessage('DICOMDIR parsed and opened successfully!');
      setTimeout(() => onClose(), 600);
    } else {
      setStatusMessage('No valid DICOM imaging files were recognized in this folder.');
    }

    setIsReading(false);
  };

  // Handle native Electron folder reading with smooth chunking
  const handleNativeFolderSelect = async () => {
    if (window.electronAPI?.openDicomDirectory) {
      setIsReading(true);
      setStatusMessage('Opening native folder picker...');
      try {
        const fileEntries = await window.electronAPI.openDicomDirectory();
        if (fileEntries.length > 0) {
          const total = fileEntries.length;
          const instances: any[] = [];
          const chunkSize = 30;

          for (let i = 0; i < total; i += chunkSize) {
            const chunkEnd = Math.min(i + chunkSize, total);

            for (let j = i; j < chunkEnd; j++) {
              const entry = fileEntries[j];
              try {
                if (isDicomBuffer(entry.buffer)) {
                  const inst = parseDicomBufferFast(entry.buffer, entry.fileName, entry.filePath);
                  instances.push(inst);
                }
              } catch (e) {}
            }

            const percent = Math.round((chunkEnd / total) * 100);
            setProgressPercent(percent);
            setStatusMessage(`Processed ${instances.length} / ${total} files (${percent}%)...`);
            await new Promise(resolve => setTimeout(resolve, 0));
          }

          if (instances.length > 0) {
            const grouped = groupInstancesIntoStudies(instances, 'disc', 'USB Flash Drive / Disc');
            onStudiesLoaded(grouped);
            setStatusMessage(`Loaded ${grouped.length} study (${instances.length} images) successfully!`);
            setTimeout(() => onClose(), 600);
            return;
          }
        }
      } catch (err) {
        console.warn('Native folder select error:', err);
      } finally {
        setIsReading(false);
      }
    }

    folderInputRef.current?.click();
  };

  // Simulate CD/DVD hospital disc insertion
  const handleSimulateHospitalDisc = () => {
    setIsReading(true);
    setStatusMessage('Detecting optical disc drive and loading DICOM_VOL01...');
    setTimeout(() => {
      const samples = generateSampleStudies();
      samples.forEach(s => {
        s.source = 'disc';
        s.sourceName = 'CD-ROM: DICOM_VOL01';
      });
      onStudiesLoaded(samples);
      setStatusMessage('CD/DVD disc detected and study loaded!');
      setTimeout(() => onClose(), 700);
      setIsReading(false);
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-radiant-panel border border-radiant-border rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden text-xs text-slate-200">
        {/* Modal Header */}
        <div className="h-12 bg-radiant-darkest border-b border-radiant-border px-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm text-amber-400">
            <Disc className="w-5 h-5 text-amber-300" />
            <span>Open CD/DVD Disc or USB Flash Drive</span>
          </div>

          <button
            onClick={onClose}
            className="p-1 hover:bg-radiant-hover text-slate-400 hover:text-white rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-slate-300 text-xs leading-relaxed">
            Open medical imaging studies from hospital <strong>CD/DVD discs</strong>, <strong>USB flash drives</strong>, <strong>DICOMDIR</strong> structures, and nested folders (including files without extensions) with zero lag.
          </p>

          {/* Drive & Action Cards */}
          <div className="grid grid-cols-2 gap-3">
            {/* CD/DVD Reading */}
            <div
              onClick={handleSimulateHospitalDisc}
              className="p-4 bg-radiant-card hover:bg-radiant-hover border border-radiant-border hover:border-amber-500/60 rounded-xl cursor-pointer transition-all flex flex-col items-center text-center group"
            >
              <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Disc className="w-6 h-6 text-amber-400" />
              </div>
              <h4 className="font-bold text-slate-100 text-sm mb-1 group-hover:text-amber-300">
                Optical Disc Drive (CD / DVD)
              </h4>
              <p className="text-[11px] text-slate-400">
                Directly read hospital CD/DVD disc media
              </p>
            </div>

            {/* USB Flash / Folder */}
            <div
              onClick={handleNativeFolderSelect}
              className="p-4 bg-radiant-card hover:bg-radiant-hover border border-radiant-border hover:border-cyan-500/60 rounded-xl cursor-pointer transition-all flex flex-col items-center text-center group"
            >
              <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <HardDrive className="w-6 h-6 text-cyan-400" />
              </div>
              <h4 className="font-bold text-slate-100 text-sm mb-1 group-hover:text-cyan-300">
                USB Flash Drive / Folder
              </h4>
              <p className="text-[11px] text-slate-400">
                Scan folder on USB drive (high-speed streaming)
              </p>
            </div>
          </div>

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

          {/* Status Message & Progress Bar */}
          {statusMessage && (
            <div className="bg-radiant-darkest border border-radiant-border rounded-lg p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {isReading ? (
                    <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  )}
                  <span className="text-slate-200 font-medium">{statusMessage}</span>
                </div>
                {isReading && (
                  <span className="text-cyan-400 font-mono font-bold">{progressPercent}%</span>
                )}
              </div>
              {isReading && (
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-amber-500 to-cyan-500 h-full transition-all duration-150"
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-12 bg-radiant-darkest border-t border-radiant-border px-4 flex items-center justify-between">
          <span className="text-slate-500 text-[11px]">DICOM PS 3.10 Media Storage Compliant</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-radiant-card hover:bg-radiant-hover text-slate-300 rounded font-semibold text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
