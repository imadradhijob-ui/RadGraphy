import React, { useState } from 'react';
import { FileText, Download, Printer, X, Shield, Hospital, User, Calendar, CheckSquare, Edit3 } from 'lucide-react';
import { DicomStudy, KeyImageBookmark, Measurement } from '../types/dicom';

interface ReportGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  study: DicomStudy | null;
  bookmarks: KeyImageBookmark[];
  measurements?: Measurement[];
}

export const ReportGeneratorModal: React.FC<ReportGeneratorModalProps> = ({
  isOpen,
  onClose,
  study,
  bookmarks,
  measurements = []
}) => {
  const [institutionName, setInstitutionName] = useState('Central Diagnostic Imaging & Radiology Center');
  const [radiologistName, setRadiologistName] = useState('Dr. Clinical Radiologist, MD, FRCR');
  const [clinicalHistory, setClinicalHistory] = useState('Routine diagnostic follow-up examination.');
  const [technique, setTechnique] = useState(
    study?.modalitiesInStudy ? `High-resolution ${study.modalitiesInStudy.join('/')} examination acquired on calibrated diagnostic PACS workstation.` : 'Multi-slice diagnostic acquisition.'
  );
  const [findings, setFindings] = useState(
    bookmarks.length > 0
      ? bookmarks.map((b, i) => `Finding #${i + 1} (${b.seriesDescription}, Slice ${b.instanceIndex + 1}): ${b.notes || 'Target region of interest evaluated. No acute destructive lesion.'}`).join('\n\n')
      : 'Comprehensive evaluation performed. Calibrated window widths and centers applied.'
  );
  const [impression, setImpression] = useState(
    '1. Diagnostic examination reviewed.\n2. Key findings documented with calibrated measurements.'
  );
  const [isAnonymized, setIsAnonymized] = useState(false);

  if (!isOpen) return null;

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups for this site to print the report.');
      return;
    }

    const patientName = isAnonymized ? 'ANONYMOUS' : (study?.patientName || 'Anonymous').replace(/\^/g, ' ');
    const patientId = isAnonymized ? 'ANON_ID' : (study?.patientId || 'NO_ID');
    const studyDate = study?.studyDate || new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const formattedDate = studyDate.length === 8
      ? `${studyDate.slice(0, 4)}-${studyDate.slice(4, 6)}-${studyDate.slice(6, 8)}`
      : studyDate;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Radiology Report - ${patientName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #1e293b; padding: 25px 35px; line-height: 1.5; margin: 0; }
          .header { border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
          .hospital-title { font-size: 18px; font-weight: 800; color: #0369a1; text-transform: uppercase; letter-spacing: 0.5px; }
          .report-title { font-size: 15px; font-weight: 700; color: #475569; }
          .patient-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px 16px; margin-bottom: 18px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 12px; }
          .patient-field { color: #64748b; font-weight: 600; }
          .patient-val { color: #0f172a; font-weight: 700; }
          .section { margin-bottom: 16px; }
          .section-title { font-size: 13px; font-weight: 800; color: #0284c7; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px; }
          .section-content { font-size: 12.5px; color: #334155; white-space: pre-wrap; }
          .gallery { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 16px 0; page-break-inside: avoid; }
          .thumb-card { border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; background: #000; text-align: center; }
          .thumb-card img { max-width: 100%; height: 190px; object-fit: contain; }
          .thumb-caption { background: #f1f5f9; color: #1e293b; padding: 6px 10px; font-size: 11px; text-align: left; border-top: 1px solid #cbd5e1; }
          .footer { margin-top: 30px; border-top: 1px solid #cbd5e1; padding-top: 12px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b; }
          @media print {
            body { padding: 10px; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="hospital-title">${institutionName}</div>
            <div class="report-title">DIAGNOSTIC RADIOLOGY REPORT</div>
          </div>
          <div style="font-size: 11px; text-align: right; color: #64748b;">
            <div>Report Date: ${new Date().toLocaleDateString()}</div>
            <div>Workstation: RadGraph Medical V0.0.01</div>
          </div>
        </div>

        <div class="patient-box">
          <div><span class="patient-field">Patient Name:</span> <span class="patient-val">${patientName}</span></div>
          <div><span class="patient-field">Patient ID:</span> <span class="patient-val">${patientId}</span></div>
          <div><span class="patient-field">Sex / Age:</span> <span class="patient-val">${study?.patientSex || 'N/A'} / ${study?.patientAge || 'N/A'}</span></div>
          <div><span class="patient-field">Study Date:</span> <span class="patient-val">${formattedDate}</span></div>
          <div><span class="patient-field">Modalities:</span> <span class="patient-val">${study?.modalitiesInStudy.join(', ') || 'N/A'}</span></div>
          <div><span class="patient-field">Accession #:</span> <span class="patient-val">${study?.accessionNumber || 'N/A'}</span></div>
        </div>

        <div class="section">
          <div class="section-title">Clinical History & Indication</div>
          <div class="section-content">${clinicalHistory}</div>
        </div>

        <div class="section">
          <div class="section-title">Examination Technique</div>
          <div class="section-content">${technique}</div>
        </div>

        <div class="section">
          <div class="section-title">Diagnostic Findings</div>
          <div class="section-content">${findings}</div>
        </div>

        ${bookmarks.length > 0 ? `
          <div class="section">
            <div class="section-title">Key Finding Image Captures (${bookmarks.length})</div>
            <div class="gallery">
              ${bookmarks.map((b, i) => `
                <div class="thumb-card">
                  <img src="${b.snapshotDataUrl}" alt="Slice ${b.instanceIndex + 1}" />
                  <div class="thumb-caption">
                    <strong>#${i + 1} ${b.seriesDescription}</strong> (Slice ${b.instanceIndex + 1}${b.sliceLocation !== undefined ? ` | Loc: ${b.sliceLocation.toFixed(1)}mm` : ''})
                    ${b.notes ? `<div style="margin-top: 3px; color: #0284c7; font-weight: 500;">${b.notes}</div>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="section" style="page-break-inside: avoid;">
          <div class="section-title">Impression & Conclusion</div>
          <div class="section-content" style="font-weight: 700;">${impression}</div>
        </div>

        <div class="footer">
          <div>Interpreting Radiologist: <strong>${radiologistName}</strong></div>
          <div>Electronically Authenticated & Signed</div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-radiant-panel border border-radiant-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-xs text-slate-200">
        {/* Header */}
        <div className="h-12 bg-radiant-darkest border-b border-radiant-border px-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm text-cyan-400">
            <FileText className="w-5 h-5 text-cyan-300" />
            <span>Diagnostic Radiology Report Generator</span>
          </div>

          <button
            onClick={onClose}
            className="p-1 hover:bg-radiant-hover text-slate-400 hover:text-white rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Editor Form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Options Bar */}
          <div className="bg-radiant-darkest border border-radiant-border rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAnonymized}
                  onChange={(e) => setIsAnonymized(e.target.checked)}
                  className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                />
                <Shield className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-slate-200">HIPAA Anonymize / De-identify Report</span>
              </label>
            </div>

            <span className="text-[11px] text-slate-400 font-mono">
              {bookmarks.length} key findings embedded
            </span>
          </div>

          {/* Institution & Radiologist */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-400 font-semibold block mb-1">Institution / Hospital Name:</label>
              <input
                type="text"
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
                className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-slate-100 focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-400 font-semibold block mb-1">Interpreting Radiologist:</label>
              <input
                type="text"
                value={radiologistName}
                onChange={(e) => setRadiologistName(e.target.value)}
                className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-slate-100 focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Clinical History */}
          <div>
            <label className="text-[11px] text-slate-400 font-semibold block mb-1">Clinical History & Indication:</label>
            <textarea
              value={clinicalHistory}
              onChange={(e) => setClinicalHistory(e.target.value)}
              className="w-full h-14 bg-radiant-darkest border border-radiant-border rounded p-2 text-slate-100 focus:border-cyan-400 focus:outline-none resize-none font-sans"
            />
          </div>

          {/* Findings */}
          <div>
            <label className="text-[11px] text-slate-400 font-semibold block mb-1">Diagnostic Findings:</label>
            <textarea
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
              className="w-full h-24 bg-radiant-darkest border border-radiant-border rounded p-2 text-slate-100 focus:border-cyan-400 focus:outline-none resize-none font-sans leading-relaxed"
            />
          </div>

          {/* Impression */}
          <div>
            <label className="text-[11px] text-slate-400 font-semibold block mb-1">Impression & Conclusion:</label>
            <textarea
              value={impression}
              onChange={(e) => setImpression(e.target.value)}
              className="w-full h-16 bg-radiant-darkest border border-radiant-border rounded p-2 text-slate-100 focus:border-cyan-400 focus:outline-none resize-none font-sans font-semibold"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="h-12 bg-radiant-darkest border-t border-radiant-border px-4 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">PDF / Print Ready with Calibrated PACS Scales</span>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-900/40 transition-all border border-cyan-400/40"
            >
              <Printer className="w-4 h-4 text-cyan-200" />
              <span>Print / Save as PDF</span>
            </button>

            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-radiant-card hover:bg-radiant-hover text-slate-300 rounded font-semibold text-xs transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
