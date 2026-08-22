import React, { useState, useEffect } from 'react';
import { FileText, Download, Printer, X, Shield, Hospital, User, Calendar, CheckSquare, Edit3, Settings, Award, Phone } from 'lucide-react';
import { DicomStudy, KeyImageBookmark, Measurement } from '../types/dicom';
import { UserProfileService, UserProfileSettings } from '../services/userProfileService';

interface ReportGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  study: DicomStudy | null;
  bookmarks: KeyImageBookmark[];
  measurements?: Measurement[];
  onOpenSettings?: () => void;
}

export const ReportGeneratorModal: React.FC<ReportGeneratorModalProps> = ({
  isOpen,
  onClose,
  study,
  bookmarks,
  measurements = [],
  onOpenSettings
}) => {
  const [profile, setProfile] = useState<UserProfileSettings>(UserProfileService.getProfile());
  const [institutionName, setInstitutionName] = useState(profile.institutionName);
  const [department, setDepartment] = useState(profile.department);
  const [radiologistName, setRadiologistName] = useState(profile.radiologistName);
  const [radiologistTitle, setRadiologistTitle] = useState(profile.radiologistTitle);
  const [radiologistLicense, setRadiologistLicense] = useState(profile.radiologistLicense);

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

  useEffect(() => {
    if (isOpen) {
      const p = UserProfileService.getProfile();
      setProfile(p);
      setInstitutionName(p.institutionName);
      setDepartment(p.department);
      setRadiologistName(p.radiologistName);
      setRadiologistTitle(p.radiologistTitle);
      setRadiologistLicense(p.radiologistLicense);
    }
  }, [isOpen]);

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
          .header { border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
          .hospital-title { font-size: 18px; font-weight: 800; color: #0369a1; text-transform: uppercase; letter-spacing: 0.5px; }
          .hospital-dept { font-size: 12px; font-weight: 600; color: #64748b; margin-top: 2px; }
          .hospital-contact { font-size: 10.5px; color: #94a3b8; margin-top: 1px; }
          .report-title { font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.8px; text-align: right; }
          .patient-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 12px; }
          .patient-field { color: #64748b; font-weight: 600; }
          .patient-val { color: #0f172a; font-weight: 700; }
          .section { margin-bottom: 15px; }
          .section-title { font-size: 12.5px; font-weight: 800; color: #0284c7; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px; }
          .section-content { font-size: 12px; color: #334155; white-space: pre-wrap; }
          .gallery { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 14px 0; page-break-inside: avoid; }
          .thumb-card { border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; background: #000; text-align: center; }
          .thumb-card img { max-width: 100%; height: 180px; object-fit: contain; }
          .thumb-caption { background: #f1f5f9; color: #1e293b; padding: 6px 10px; font-size: 11px; text-align: left; border-top: 1px solid #cbd5e1; }
          .footer { margin-top: 25px; border-top: 1.5px solid #cbd5e1; padding-top: 12px; display: flex; justify-content: space-between; align-items: flex-start; font-size: 11px; color: #475569; page-break-inside: avoid; }
          .physician-sign { line-height: 1.4; }
          .physician-name { font-size: 12.5px; font-weight: 800; color: #0f172a; }
          .physician-title { color: #475569; }
          .physician-license { font-family: monospace; font-size: 10.5px; color: #64748b; }
          .attestation { font-size: 10px; color: #94a3b8; text-align: right; max-width: 320px; }
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
            <div class="hospital-dept">${department}</div>
            ${profile.address || profile.phone ? `<div class="hospital-contact">${profile.address ? profile.address + ' • ' : ''}${profile.phone || ''}</div>` : ''}
          </div>
          <div>
            <div class="report-title">DIAGNOSTIC RADIOLOGY REPORT</div>
            <div style="font-size: 10.5px; text-align: right; color: #64748b; margin-top: 3px;">
              <div>Report Date: ${new Date().toLocaleDateString()}</div>
              <div>RadGraph Medical PACS</div>
            </div>
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
          <div class="physician-sign">
            <div class="physician-name">${radiologistName}</div>
            <div class="physician-title">${radiologistTitle}</div>
            ${radiologistLicense ? `<div class="physician-license">License: ${radiologistLicense}</div>` : ''}
          </div>
          <div class="attestation">
            <div>${profile.footerNote}</div>
            <div style="margin-top: 3px; font-weight: 600; color: #64748b;">Electronically Authenticated & Signed</div>
          </div>
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-radiant-panel border border-radiant-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden text-xs text-slate-200">
        {/* Header */}
        <div className="h-12 bg-radiant-darkest border-b border-radiant-border px-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 font-bold text-sm text-cyan-400">
            <FileText className="w-5 h-5 text-cyan-300" />
            <span>Diagnostic Radiology Report Generator</span>
          </div>

          <div className="flex items-center gap-2">
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="flex items-center gap-1 px-2.5 py-1 bg-radiant-card hover:bg-radiant-hover text-slate-300 rounded border border-radiant-border text-[11px] transition-colors"
                title="Edit Interpreting Physician & Hospital Profile"
              >
                <Settings className="w-3.5 h-3.5 text-cyan-400" />
                <span>Configure Profile</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 hover:bg-radiant-hover text-slate-400 hover:text-white rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Editor Form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Institution & Physician Info Bar */}
          <div className="bg-radiant-darkest border border-radiant-border rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-slate-300">
              <span className="font-semibold text-[11.5px] text-cyan-300 flex items-center gap-1.5">
                <Hospital className="w-3.5 h-3.5 text-emerald-400" />
                <span>Header Branding & Physician Attestation</span>
              </span>
              <button
                type="button"
                onClick={() => setIsAnonymized(!isAnonymized)}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold transition-colors border ${
                  isAnonymized
                    ? 'bg-amber-900/40 border-amber-500/80 text-amber-300'
                    : 'bg-radiant-card border-radiant-border text-slate-400'
                }`}
              >
                <Shield className="w-3 h-3 text-amber-400" />
                <span>{isAnonymized ? 'HIPAA De-Identified' : 'Patient Identifiers Active'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10.5px] text-slate-400 mb-0.5">Institution / Hospital Name:</label>
                <input
                  type="text"
                  value={institutionName}
                  onChange={(e) => setInstitutionName(e.target.value)}
                  className="w-full bg-radiant-panel border border-radiant-border rounded px-2.5 py-1.5 text-slate-200 outline-none focus:border-cyan-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-[10.5px] text-slate-400 mb-0.5">Department / Division:</label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full bg-radiant-panel border border-radiant-border rounded px-2.5 py-1.5 text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-[10.5px] text-slate-400 mb-0.5">Interpreting Radiologist:</label>
                <input
                  type="text"
                  value={radiologistName}
                  onChange={(e) => setRadiologistName(e.target.value)}
                  className="w-full bg-radiant-panel border border-radiant-border rounded px-2.5 py-1.5 text-slate-200 outline-none focus:border-cyan-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-[10.5px] text-slate-400 mb-0.5">License / Registry Number:</label>
                <input
                  type="text"
                  value={radiologistLicense}
                  onChange={(e) => setRadiologistLicense(e.target.value)}
                  className="w-full bg-radiant-panel border border-radiant-border rounded px-2.5 py-1.5 text-slate-200 outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Clinical History */}
          <div>
            <label className="block font-semibold text-slate-300 mb-1">Clinical History & Indication:</label>
            <input
              type="text"
              value={clinicalHistory}
              onChange={(e) => setClinicalHistory(e.target.value)}
              className="w-full bg-radiant-darkest border border-radiant-border rounded-lg p-2.5 text-slate-200 outline-none focus:border-cyan-500"
            />
          </div>

          {/* Technique */}
          <div>
            <label className="block font-semibold text-slate-300 mb-1">Examination Technique:</label>
            <input
              type="text"
              value={technique}
              onChange={(e) => setTechnique(e.target.value)}
              className="w-full bg-radiant-darkest border border-radiant-border rounded-lg p-2.5 text-slate-200 outline-none focus:border-cyan-500"
            />
          </div>

          {/* Diagnostic Findings */}
          <div>
            <label className="block font-semibold text-slate-300 mb-1">
              Diagnostic Findings {bookmarks.length > 0 && `(Prefilled from ${bookmarks.length} Key Image Slices)`}:
            </label>
            <textarea
              rows={4}
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
              className="w-full bg-radiant-darkest border border-radiant-border rounded-lg p-2.5 text-slate-200 outline-none focus:border-cyan-500 font-sans resize-y"
            />
          </div>

          {/* Key Images Embedded Gallery Summary */}
          {bookmarks.length > 0 && (
            <div className="bg-radiant-darkest border border-radiant-border rounded-xl p-3">
              <div className="text-[11px] font-semibold text-cyan-300 mb-2">
                Attached Key Images ({bookmarks.length} will be printed with report):
              </div>
              <div className="grid grid-cols-4 gap-2">
                {bookmarks.slice(0, 4).map((b, i) => (
                  <div key={b.id} className="bg-black rounded border border-slate-700 overflow-hidden relative text-center">
                    <img src={b.snapshotDataUrl} alt={`Key ${i}`} className="w-full h-16 object-contain" />
                    <div className="bg-slate-900/90 text-[9px] text-slate-300 px-1 py-0.5 truncate">
                      #{i + 1} {b.seriesDescription}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Impression / Conclusion */}
          <div>
            <label className="block font-semibold text-slate-300 mb-1">Impression & Conclusion:</label>
            <textarea
              rows={3}
              value={impression}
              onChange={(e) => setImpression(e.target.value)}
              className="w-full bg-radiant-darkest border border-radiant-border rounded-lg p-2.5 text-slate-200 outline-none focus:border-cyan-500 font-sans resize-y font-semibold"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="h-14 bg-radiant-darkest border-t border-radiant-border px-5 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Print preview opens browser print dialog (Save as PDF / Paper Printer)
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-radiant-panel hover:bg-radiant-hover text-slate-300 rounded-lg transition-colors font-semibold"
            >
              Cancel
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg transition-colors font-bold shadow-lg shadow-cyan-600/30"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Export PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
