import React from 'react';
import { Activity, CheckCircle2, X } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-radiant-panel border border-radiant-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden text-xs text-slate-200">
        {/* Header */}
        <div className="h-12 bg-radiant-darkest border-b border-radiant-border px-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm text-cyan-400">
            <Activity className="w-5 h-5 text-cyan-300 animate-pulse" />
            <span>About RadGraph Medical Workstation</span>
          </div>

          <button
            onClick={onClose}
            className="p-1 hover:bg-radiant-hover text-slate-400 hover:text-white rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 bg-radiant-card p-3 rounded-lg border border-radiant-border">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center shadow-lg">
              <Activity className="w-7 h-7 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">RadGraph Medical Workstation</h3>
              <p className="text-[11px] text-cyan-400 font-mono">Version: v0.0.01 (Diagnostic Imaging Edition)</p>
            </div>
          </div>

          <p className="text-slate-300 leading-relaxed text-xs">
            RadGraph is an advanced, high-performance diagnostic DICOM PACS medical workstation for CT, MRI, Digital Radiography (X-Ray), and Ultrasound imaging.
          </p>

          <div className="space-y-2 bg-radiant-darkest p-3 rounded-lg border border-radiant-border text-[11px]">
            <div className="font-bold text-slate-200 mb-1">Supported Capabilities:</div>
            <div className="grid grid-cols-2 gap-1.5 text-slate-300">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>PACS Query/Retrieve (DIMSE & DICOMweb)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>CD/DVD & DICOMDIR Media Reader</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>USB Flash Drive Recursive Scanner</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>3D Multi-Planar Reconstruction (MPR)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Maximum Intensity Projection (MIP)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Calibrated Length, Cobb & ROI Stats</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="h-10 bg-radiant-darkest border-t border-radiant-border px-4 flex items-center justify-between text-[11px] text-slate-400">
          <span>DICOM Standard PS 3.1 - 3.20 Compliant</span>
          <button
            onClick={onClose}
            className="px-4 py-1 bg-radiant-card hover:bg-radiant-hover text-slate-200 rounded font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
