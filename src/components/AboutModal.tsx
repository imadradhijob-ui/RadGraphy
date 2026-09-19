import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  X,
  FileCheck,
  Server,
  Layers,
  Sliders,
  Shield,
  Box,
  Cpu,
  Award,
  Disc,
  Info,
  ExternalLink,
  BookOpen
} from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'overview' | 'conformance' | 'specs' | 'legal';
}

export const AboutModal: React.FC<AboutModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'overview'
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'conformance' | 'specs' | 'legal'>(initialTab);

  if (!isOpen) return null;

  const tabs = [
    { id: 'overview', label: 'Overview & Features', icon: <Activity className="w-3.5 h-3.5" /> },
    { id: 'conformance', label: 'DICOM Conformance', icon: <FileCheck className="w-3.5 h-3.5" /> },
    { id: 'specs', label: 'Clinical Specifications', icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: 'legal', label: 'Regulatory & License', icon: <Shield className="w-3.5 h-3.5" /> }
  ] as const;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div className="bg-radiant-panel border border-radiant-border rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden text-xs text-slate-200 flex flex-col max-h-[88vh]">
        {/* Header Bar */}
        <div className="h-14 bg-radiant-darkest border-b border-radiant-border px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-cyan-500/50 shadow-md shadow-cyan-500/20 bg-slate-900 flex items-center justify-center">
              <img
                src="./icon.png"
                alt="RadNode Viewer"
                className="w-full h-full object-contain"
                onError={(e) => {
                  // Fallback if relative path differs
                  const img = e.currentTarget;
                  if (img.src.endsWith('./icon.png')) {
                    img.src = '/icon.png';
                  } else {
                    img.src = './logo.png';
                  }
                }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm text-white tracking-wide">RadNode Viewer</h2>
                <span className="px-1.5 py-0.2 bg-cyan-950/80 text-cyan-300 font-mono text-[10px] rounded border border-cyan-400/40">
                  v0.0.8 Release
                </span>
              </div>
              <p className="text-[10.5px] text-slate-400">Medical Diagnostic PACS Workstation</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 hover:bg-radiant-hover text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hospital IT Department Powered Header Banner */}
        <div className="bg-gradient-to-r from-emerald-950/90 via-slate-900 to-cyan-950/90 border-b border-emerald-500/30 px-5 py-2 flex items-center justify-between text-[11px] text-emerald-300 font-bold tracking-wide shadow-inner">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>POWERED BY THE IT DEPARTMENT AL-SHAAB HOSPITAL</span>
          </div>
          <span className="text-[9.5px] font-mono px-2 py-0.5 rounded bg-emerald-900/60 border border-emerald-500/50 text-emerald-200">
            Al-Shaab Hospital
          </span>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-radiant-border bg-slate-950/60 px-4 gap-1 shrink-0 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-slate-900 to-cyan-950/40 border border-cyan-500/30 rounded-xl p-4 flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-slate-950 border border-cyan-400/50 p-1 shrink-0 shadow-lg shadow-cyan-900/40 flex items-center justify-center">
                  <img
                    src="./icon.png"
                    alt="RadNode Viewer App Icon"
                    className="w-full h-full object-contain rounded-lg"
                    onError={(e) => {
                      const img = e.currentTarget;
                      img.src = '/icon.png';
                    }}
                  />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white mb-0.5">
                    RadNode Viewer Diagnostic Workstation
                  </h3>
                  <p className="text-[11.5px] text-slate-300 leading-relaxed">
                    A native-grade, high-fidelity radiological visualization platform engineered for diagnostic reviewing of computed tomography (CT), magnetic resonance (MRI), digital radiography (DX/CR), ultrasound (US), and nuclear medicine studies.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-cyan-400" />
                  <span>Key Workstation Capabilities</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  {[
                    { title: 'PACS DIMSE & DICOMweb', desc: 'Direct C-FIND, C-MOVE, C-GET, WADO-RS & QIDO-RS integration' },
                    { title: 'Optical CD/DVD Reader', desc: 'Auto-detection & recursive reading of patient DICOMDIR discs' },
                    { title: 'Multi-Planar Reconstruction', desc: 'Real-time Orthogonal MPR (Axial, Coronal, Sagittal) with 3D crosshair' },
                    { title: '3D Volume Raycasting', desc: 'Interactive GPU-accelerated volumetric 3D reconstruction' },
                    { title: 'DICOMDIR Media Exporter', desc: 'Compliant DICOMDIR generation with portable ZIP packaging' },
                    { title: 'Clinical Annotations', desc: 'Arrow lesion markers, Cobb angle, CTR, Rectangle & Ellipse ROI' },
                    { title: 'Direct ZIP File Drag & Drop', desc: 'In-memory extraction and instant playback of .zip archive studies' },
                    { title: 'Medical Report Generator', desc: 'Customizable hospital header with normal templates and PDF export' },
                  ].map((feat, idx) => (
                    <div key={idx} className="bg-radiant-card border border-radiant-border rounded-lg p-2.5 space-y-0.5">
                      <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{feat.title}</span>
                      </div>
                      <p className="text-slate-400 text-[10.5px] pl-5">{feat.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DICOM CONFORMANCE */}
          {activeTab === 'conformance' && (
            <div className="space-y-4">
              <div className="bg-slate-900/80 border border-radiant-border rounded-xl p-3.5 space-y-2">
                <div className="font-bold text-cyan-300 text-xs flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4 text-cyan-400" />
                  <span>DICOM Standard Conformance (PS 3.1 - PS 3.20)</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  RadNode Viewer adheres to the official NEMA / ISO 12052 Digital Imaging and Communications in Medicine (DICOM) specifications across all network DIMSE services and offline storage media.
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-200 text-xs">Supported Transfer Syntaxes & Codecs:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10.5px]">
                  <div className="bg-radiant-card border border-radiant-border rounded-lg p-2 font-mono">
                    <div className="text-amber-300 font-bold">1.2.840.10008.1.2.1</div>
                    <div className="text-slate-300">Explicit VR Little Endian</div>
                  </div>
                  <div className="bg-radiant-card border border-radiant-border rounded-lg p-2 font-mono">
                    <div className="text-amber-300 font-bold">1.2.840.10008.1.2</div>
                    <div className="text-slate-300">Implicit VR Little Endian</div>
                  </div>
                  <div className="bg-radiant-card border border-radiant-border rounded-lg p-2 font-mono">
                    <div className="text-amber-300 font-bold">1.2.840.10008.1.2.4.70</div>
                    <div className="text-slate-300">JPEG Lossless (Process 14 SV1)</div>
                  </div>
                  <div className="bg-radiant-card border border-radiant-border rounded-lg p-2 font-mono">
                    <div className="text-amber-300 font-bold">1.2.840.10008.1.2.4.50</div>
                    <div className="text-slate-300">JPEG Baseline (Process 1 8-bit)</div>
                  </div>
                  <div className="bg-radiant-card border border-radiant-border rounded-lg p-2 font-mono">
                    <div className="text-amber-300 font-bold">1.2.840.10008.1.2.5</div>
                    <div className="text-slate-300">RLE Lossless Decompression</div>
                  </div>
                  <div className="bg-radiant-card border border-radiant-border rounded-lg p-2 font-mono">
                    <div className="text-amber-300 font-bold">1.2.840.10008.1.3.10</div>
                    <div className="text-slate-300">Media Storage Directory (DICOMDIR)</div>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="font-bold text-slate-200 text-xs">Supported DICOM SOP Classes:</div>
                <p className="text-[11px] text-slate-400">
                  CT Image Storage, MR Image Storage, Secondary Capture (SC), Computed Radiography (CR), Digital X-Ray (DX), Mammography (MG), X-Ray Angiography (XA), Ultrasound (US), Nuclear Medicine (NM), and Positron Emission Tomography (PT).
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: CLINICAL SPECIFICATIONS */}
          {activeTab === 'specs' && (
            <div className="space-y-4">
              <div className="bg-slate-900 border border-radiant-border rounded-xl p-3.5 space-y-2">
                <div className="font-bold text-slate-200 text-xs">Diagnostic Calibrations:</div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Hounsfield Unit (HU) Transform:</span>
                    <strong className="text-cyan-300 font-mono">HU = PixelValue × Slope + Intercept</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Spatial Metric:</span>
                    <strong className="text-cyan-300 font-mono">Calibrated (0028,0030) Pixel Spacing (mm)</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Cardiothoracic Ratio (CTR):</span>
                    <strong className="text-emerald-300 font-mono">Heart Dia / Thoracic Dia (&gt;0.50 Cardiomegaly)</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Cobb Angle:</span>
                    <strong className="text-emerald-300 font-mono">Superior vs Inferior vertebral endplates (°)</strong>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="font-bold text-slate-200 text-xs">Workstation Color Look-Up Tables (LUT):</div>
                <div className="flex flex-wrap gap-1.5">
                  {['Grayscale', 'Hot Iron (Thermal)', 'PET Rainbow', 'Bone Contrast', 'Angio High-Pass', 'Cool Blue', 'Inverted Mono'].map((lut) => (
                    <span key={lut} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 text-[10.5px]">
                      {lut}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: LEGAL & HOSPITAL DISCLAIMER */}
          {activeTab === 'legal' && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-radiant-border rounded-xl p-4 space-y-2.5">
                <div className="font-bold text-amber-300 text-xs flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-amber-400" />
                  <span>Clinical Disclaimer & Regulatory Usage</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  RadNode Viewer is distributed for clinical radiology review, surgical planning, diagnostic tele-radiology consultation, and medical education. Display calibration on standard commercial monitors does not substitute for dedicated DICOM Part 14 Grayscale Standard Display Function (GSDF) calibrated diagnostic monitors where required by local healthcare authority regulations.
                </p>
              </div>

              <div className="text-[11px] text-slate-400 space-y-1">
                <div>Copyright © 2026 IT Department - Al-Shaab Hospital. All rights reserved.</div>
                <div>Engineered with high-precision medical codecs for hospital and clinic deployments worldwide.</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-12 bg-radiant-darkest border-t border-radiant-border px-5 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <span className="font-mono text-cyan-400">RadNode Viewer • Version 0.0.8</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-semibold transition-colors text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
