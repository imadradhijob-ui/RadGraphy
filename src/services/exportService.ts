import { DicomInstance, DicomStudy, Measurement } from '../types/dicom';

export interface ExportOptions {
  format: 'png' | 'jpg' | 'bmp';
  includeOverlay: boolean;
  quality?: number;
  anonymizeDicom?: boolean;
}

export class ExportService {
  /**
   * Captures the given HTML canvas element and triggers download
   */
  static downloadCanvasImage(
    canvas: HTMLCanvasElement,
    filename: string,
    format: 'png' | 'jpg' | 'bmp' = 'png'
  ): void {
    const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const dataUrl = canvas.toDataURL(mimeType, 0.95);
    
    const link = document.createElement('a');
    link.download = `${filename}.${format}`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Generates a printable Medical Radiology Report
   */
  static generateStudyReport(
    study: DicomStudy,
    currentInstance: DicomInstance,
    measurements: Measurement[],
    snapshotCanvasUrl?: string
  ): void {
    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) return;

    const measurementRows = measurements.map((m, idx) => {
      let details = '';
      if (m.type === 'distance') details = `Distance: <strong>${m.distanceMm?.toFixed(2)} mm</strong>`;
      else if (m.type === 'angle') details = `Angle: <strong>${m.angleDeg?.toFixed(1)}°</strong>`;
      else if (m.type === 'cobb_angle') details = `Cobb Angle: <strong>${m.cobbDeg?.toFixed(1)}°</strong>`;
      else if (m.roiValues) {
        details = `Area: <strong>${m.roiValues.areaCm2.toFixed(2)} cm²</strong> | Mean: <strong>${m.roiValues.meanHu.toFixed(1)} HU</strong> | StdDev: <strong>${m.roiValues.stdDevHu.toFixed(1)}</strong> [${m.roiValues.minHu} .. ${m.roiValues.maxHu} HU]`;
      } else if (m.type === 'hu_probe') {
        details = `HU Probe: <strong>${m.probeHu} HU</strong> (X:${m.probeCoord?.x}, Y:${m.probeCoord?.y})`;
      }

      return `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px 12px; font-weight: bold;">#${idx + 1} (${m.type})</td>
          <td style="padding: 8px 12px;">${details}</td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html dir="ltr" lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Diagnostic Radiology Report - ${study.patientName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 40px; color: #1e293b; direction: ltr; }
          .header { border-bottom: 3px solid #0284c7; padding-bottom: 15px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; }
          .title { font-size: 22px; font-weight: bold; color: #0f172a; margin: 0; }
          .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
          .patient-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; margin-bottom: 25px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; font-size: 14px; }
          .field-label { color: #64748b; font-size: 12px; }
          .field-value { font-weight: bold; color: #0f172a; }
          .image-container { text-align: center; margin: 25px 0; }
          .image-container img { max-width: 500px; border-radius: 8px; border: 1px solid #0f172a; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
          .table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13.5px; }
          .table th { background: #0284c7; color: white; padding: 10px 12px; text-align: left; }
          .footer { margin-top: 50px; border-top: 1px solid #cbd5e1; padding-top: 15px; display: flex; justify-content: space-between; font-size: 12px; color: #94a3b8; }
          @media print {
            button { display: none !important; }
            body { margin: 15mm; }
          }
        </style>
      </head>
      <body>
        <div style="display: flex; justify-content: flex-end; margin-bottom: 10px;">
          <button onclick="window.print()" style="background: #0284c7; color: white; border: none; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-weight: bold;">Print Report</button>
        </div>

        <div class="header">
          <div>
            <h1 class="title">Department of Diagnostic Imaging & Radiology</h1>
            <div class="subtitle">RadScope Medical Workstation - Medical Study Examination Report</div>
          </div>
          <div style="text-align: right; font-size: 12px; color: #64748b;">
            Date: ${new Date().toLocaleDateString('en-US')}
          </div>
        </div>

        <div class="patient-card">
          <div>
            <div class="field-label">Patient Name:</div>
            <div class="field-value">${study.patientName.replace(/\^/g, ' ')}</div>
          </div>
          <div>
            <div class="field-label">Patient ID:</div>
            <div class="field-value">${study.patientId}</div>
          </div>
          <div>
            <div class="field-label">Sex / Age:</div>
            <div class="field-value">${study.patientSex || 'N/A'} / ${study.patientAge || 'N/A'}</div>
          </div>
          <div>
            <div class="field-label">Modality:</div>
            <div class="field-value">${study.modalitiesInStudy.join(', ')}</div>
          </div>
          <div>
            <div class="field-label">Study Description:</div>
            <div class="field-value">${study.studyDescription}</div>
          </div>
          <div>
            <div class="field-label">Study Date:</div>
            <div class="field-value">${study.studyDate}</div>
          </div>
        </div>

        ${snapshotCanvasUrl ? `
          <div class="image-container">
            <div style="font-weight: bold; margin-bottom: 8px; font-size: 13px;">Key Image Capture</div>
            <img src="${snapshotCanvasUrl}" alt="Medical Slice" />
          </div>
        ` : ''}

        ${measurements.length > 0 ? `
          <div style="margin-top: 25px;">
            <h3 style="font-size: 16px; color: #0f172a; margin-bottom: 8px;">ROI & Calibrated Measurements:</h3>
            <table class="table">
              <thead>
                <tr>
                  <th style="width: 25%;">Measurement Type</th>
                  <th>Calculated Values</th>
                </tr>
              </thead>
              <tbody>
                ${measurementRows}
              </tbody>
            </table>
          </div>
        ` : ''}

        <div style="margin-top: 30px;">
          <h3 style="font-size: 16px; color: #0f172a; margin-bottom: 6px;">Radiologist Findings:</h3>
          <div style="height: 90px; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 10px; background: #fafafa; font-size: 13px; color: #64748b;">
            Examination reviewed with calibrated window level (${currentInstance.windowCenter} WC / ${currentInstance.windowWidth} WW).
          </div>
        </div>

        <div class="footer">
          <div>Generated by: <strong>RadGraph Medical Workstation (v0.0.01)</strong></div>
          <div>Radiologist Signature: ____________________</div>
        </div>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }
}
