import { DicomInstance, DicomSeries, DicomStudy, Measurement, ColorLutType } from '../types/dicom';
import { getOrDecodeInstancePixels } from './dicomParser';
import { getLutTable } from './lutService';
import { DicomDirGenerator } from './dicomdirGenerator';
import JSZip from 'jszip';

export interface HighResRenderOptions {
  resolutionScale?: 1 | 2 | 4; // 1 = Native DICOM matrix (e.g. 512x512), 2 = 2X HD, 4 = 4X Ultra-HD / 300 DPI
  format?: 'png' | 'jpg' | 'bmp';
  quality?: number; // 0.95 - 1.0 for JPG
  windowCenter?: number;
  windowWidth?: number;
  lut?: ColorLutType;
  invert?: boolean;
  includeOverlays?: boolean;
  anonymize?: boolean;
  measurements?: Measurement[];
}

export interface BatchExportOptions extends HighResRenderOptions {
  scope: 'current_slice' | 'current_series' | 'entire_study';
  targetBaseDir?: string; // If Electron directory chosen (e.g. USB flash drive or PC folder)
  onProgress?: (progress: { current: number; total: number; percent: number; status: string }) => void;
}

export interface ExportResult {
  success: boolean;
  count: number;
  savedPath?: string;
  isZip?: boolean;
  error?: string;
}

export class ExportService {
  /**
   * Renders a single DICOM instance into a full High-Resolution offscreen Canvas,
   * preserving true native pixel matrix, pixel spacing aspect ratio, calibrated WL/WW,
   * and burning in high-DPI vector medical HUD overlays and measurement annotations.
   */
  static renderHighResInstanceCanvas(
    instance: DicomInstance,
    study?: DicomStudy | null,
    series?: DicomSeries | null,
    options: HighResRenderOptions = {}
  ): HTMLCanvasElement {
    const width = instance.columns;
    const height = instance.rows;
    if (!width || !height || width <= 0 || height <= 0) {
      throw new Error(`Invalid DICOM image dimensions: ${width}x${height}`);
    }

    // 1. Calculate physical aspect ratio from pixel spacing
    const rowSpacing = instance.pixelSpacing?.[0] || 1;
    const colSpacing = instance.pixelSpacing?.[1] || 1;
    const aspect = (width * colSpacing) / (height * rowSpacing);

    const scale = options.resolutionScale || 1;
    let baseW = width;
    let baseH = height;
    if (aspect > 1.002) {
      baseW = Math.round(height * aspect);
    } else if (aspect < 0.998) {
      baseH = Math.round(width / aspect);
    }

    const canvasW = Math.round(baseW * scale);
    const canvasH = Math.round(baseH * scale);

    // 2. Decode raw 16-bit / 8-bit pixels
    const { pixelData, huData } = getOrDecodeInstancePixels(instance);
    const numPixels = width * height;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) throw new Error('Failed to create offscreen 2D canvas context');

    const imgData = tempCtx.createImageData(width, height);
    const data = imgData.data;

    // Window Center / Width parameters
    const wc = options.windowCenter ?? instance.windowCenter ?? 40;
    const ww = Math.max(1, options.windowWidth ?? instance.windowWidth ?? 400);
    const low = wc - 0.5 - (ww - 1) / 2;
    const high = wc - 0.5 + (ww - 1) / 2;

    const isMonochrome1 = instance.photometricInterpretation === 'MONOCHROME1';
    const effectiveInvert = isMonochrome1 ? !options.invert : !!options.invert;
    const lutTable = getLutTable(options.lut || 'grayscale');
    const isRgb = instance.samplesPerPixel === 3 || instance.photometricInterpretation.includes('RGB');

    if (isRgb && pixelData) {
      for (let i = 0; i < numPixels; i++) {
        const srcIdx = i * 3;
        const pIdx = i * 4;
        data[pIdx] = pixelData[srcIdx] || 0;
        data[pIdx + 1] = pixelData[srcIdx + 1] || 0;
        data[pIdx + 2] = pixelData[srcIdx + 2] || 0;
        data[pIdx + 3] = 255;
      }
    } else {
      const src = huData || pixelData;
      if (src) {
        for (let i = 0; i < numPixels; i++) {
          const val = src[i];
          let gray: number;
          if (val <= low) {
            gray = 0;
          } else if (val >= high) {
            gray = 255;
          } else {
            gray = Math.round(((val - low) / ww) * 255);
          }

          if (effectiveInvert) {
            gray = 255 - gray;
          }

          const pIdx = i * 4;
          if (lutTable) {
            const lutIdx = gray * 3;
            data[pIdx] = lutTable[lutIdx];
            data[pIdx + 1] = lutTable[lutIdx + 1];
            data[pIdx + 2] = lutTable[lutIdx + 2];
            data[pIdx + 3] = 255;
          } else {
            data[pIdx] = gray;
            data[pIdx + 1] = gray;
            data[pIdx + 2] = gray;
            data[pIdx + 3] = 255;
          }
        }
      }
    }

    tempCtx.putImageData(imgData, 0, 0);

    // 3. Draw onto target High-Resolution Canvas
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create target export canvas');

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tempCanvas, 0, 0, canvasW, canvasH);

    // 4. Burn in High-DPI Vector Medical HUD Overlays & Annotations
    if (options.includeOverlays) {
      const s = Math.max(1, canvasW / 650);
      const fontSize = Math.round(11 * s);
      const lineHeight = Math.round(15 * s);
      const padX = Math.round(16 * s);
      const padY = Math.round(20 * s);

      ctx.save();
      ctx.font = `600 ${fontSize}px "JetBrains Mono", "Courier New", monospace`;

      const drawTextWithBackdrop = (
        text: string,
        x: number,
        y: number,
        color: string = '#f8fafc',
        align: CanvasTextAlign = 'left'
      ) => {
        ctx.save();
        ctx.textAlign = align;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowBlur = 4 * s;
        // 4-point outline
        ctx.fillText(text, x + 1.5 * s, y + 1.5 * s);
        ctx.fillText(text, x - 1.5 * s, y - 1.5 * s);
        ctx.fillText(text, x + 1.5 * s, y - 1.5 * s);
        ctx.fillText(text, x - 1.5 * s, y + 1.5 * s);
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
        ctx.restore();
      };

      // Top-Left: Patient Metadata
      const pName = options.anonymize
        ? 'ANONYMOUS'
        : (study?.patientName || 'Anonymous').replace(/\^/g, ' ');
      const pId = options.anonymize ? 'ANON_ID' : (study?.patientId || 'NO_ID');
      const pSex = study?.patientSex || 'N/A';
      const pAge = study?.patientAge ? `(${study.patientAge})` : '';

      drawTextWithBackdrop(pName, padX, padY, '#fde047');
      drawTextWithBackdrop(`ID: ${pId}`, padX, padY + lineHeight, '#e2e8f0');
      drawTextWithBackdrop(`${pSex} ${pAge}`.trim(), padX, padY + lineHeight * 2, '#cbd5e1');
      if (study?.studyDescription) {
        drawTextWithBackdrop(study.studyDescription, padX, padY + lineHeight * 3, '#38bdf8');
      }

      // Top-Right: Hospital & Acquisition
      const modality = series?.modality || instance.rawTags['(0008,0060)']?.value || 'OT';
      const serDesc = series?.seriesDescription || `Series ${series?.seriesNumber || 1}`;
      const fovMm = (width * colSpacing).toFixed(0);

      drawTextWithBackdrop('AL-SHAAB HOSPITAL', canvasW - padX, padY, '#38bdf8', 'right');
      drawTextWithBackdrop(`${modality} | ${serDesc}`, canvasW - padX, padY + lineHeight, '#e2e8f0', 'right');
      if (study?.studyDate) {
        const d = study.studyDate;
        const formattedDate = d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
        drawTextWithBackdrop(formattedDate, canvasW - padX, padY + lineHeight * 2, '#94a3b8', 'right');
      }
      drawTextWithBackdrop(`FOV: ${fovMm} mm`, canvasW - padX, padY + lineHeight * 3, '#94a3b8', 'right');

      // Bottom-Left: Slice Position & Dynamic Calibration Scale Bar
      const totalSlices = series?.instances?.length || 1;
      const sliceIdx = (instance.instanceNumber || 1);
      const locStr = instance.sliceLocation !== undefined ? `Loc: ${instance.sliceLocation.toFixed(1)} mm` : '';
      const thickStr = instance.sliceThickness ? `Thick: ${instance.sliceThickness.toFixed(1)} mm` : '';

      drawTextWithBackdrop(`Slice: ${sliceIdx} / ${totalSlices}`, padX, canvasH - padY - lineHeight * 2.5, '#fde047');
      if (locStr || thickStr) {
        drawTextWithBackdrop(`${locStr}  ${thickStr}`.trim(), padX, canvasH - padY - lineHeight * 1.5, '#e2e8f0');
      }

      // Calibrated Scale Ruler on Bottom-Left
      const pixelsPerMm = canvasW / (width * colSpacing);
      const candidateMm = [10, 20, 50, 100];
      let bestMm = candidateMm[0];
      for (const cm of candidateMm) {
        if (cm * pixelsPerMm >= 40 * s && cm * pixelsPerMm <= 140 * s) {
          bestMm = cm;
          break;
        }
      }
      const rulerPx = bestMm * pixelsPerMm;
      const rulerY = canvasH - padY;
      ctx.save();
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(padX, rulerY - 4 * s);
      ctx.lineTo(padX, rulerY);
      ctx.lineTo(padX + rulerPx, rulerY);
      ctx.lineTo(padX + rulerPx, rulerY - 4 * s);
      ctx.stroke();
      ctx.restore();
      drawTextWithBackdrop(bestMm >= 10 ? `${bestMm / 10} cm` : `${bestMm} mm`, padX + rulerPx / 2, rulerY - 4 * s, '#38bdf8', 'center');

      // Bottom-Right: Window Values, Matrix & Tagline
      drawTextWithBackdrop(`WL: ${wc}  WW: ${ww}`, canvasW - padX, canvasH - padY - lineHeight * 2, '#4ade80', 'right');
      drawTextWithBackdrop(`Matrix: ${width}x${height} (${scale > 1 ? `${scale}X HD` : 'Native'})`, canvasW - padX, canvasH - padY - lineHeight, '#94a3b8', 'right');
      drawTextWithBackdrop('POWERED BY AL-SHAAB HOSPITAL IT TEAM', canvasW - padX, canvasH - padY, '#10b981', 'right');

      // 5. Draw Measurements & Annotations if available
      if (options.measurements && options.measurements.length > 0) {
        const scaleX = canvasW / width;
        const scaleY = canvasH / height;

        for (const m of options.measurements) {
          if (m.instanceIndex !== undefined && instance.instanceNumber !== undefined && m.instanceIndex !== instance.instanceNumber - 1) {
            continue;
          }
          if (!m.points || m.points.length === 0) continue;

          ctx.save();
          ctx.strokeStyle = m.color || '#00e5ff';
          ctx.lineWidth = 2 * s;
          ctx.fillStyle = m.color || '#00e5ff';

          if (m.type === 'distance' && m.points.length >= 2) {
            const p1 = { x: m.points[0].x * scaleX, y: m.points[0].y * scaleY };
            const p2 = { x: m.points[1].x * scaleX, y: m.points[1].y * scaleY };

            // Line
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            // Caliper ticks
            const drawTick = (pt: { x: number; y: number }) => {
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, 3 * s, 0, Math.PI * 2);
              ctx.fill();
            };
            drawTick(p1);
            drawTick(p2);

            // Distance Badge
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const distText = m.distanceMm !== undefined ? `${m.distanceMm.toFixed(1)} mm` : '';
            if (distText) {
              drawTextWithBackdrop(distText, midX, midY - 6 * s, '#00e5ff', 'center');
            }
          } else if ((m.type === 'rectangle_roi' || m.type === 'ellipse_roi') && m.points.length >= 2) {
            const p1 = { x: m.points[0].x * scaleX, y: m.points[0].y * scaleY };
            const p2 = { x: m.points[1].x * scaleX, y: m.points[1].y * scaleY };
            const rx = Math.min(p1.x, p2.x);
            const ry = Math.min(p1.y, p2.y);
            const rw = Math.abs(p2.x - p1.x);
            const rh = Math.abs(p2.y - p1.y);

            ctx.beginPath();
            if (m.type === 'rectangle_roi') {
              ctx.strokeRect(rx, ry, rw, rh);
            } else {
              ctx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
              ctx.stroke();
            }

            if (m.roiValues) {
              const areaText = `${m.roiValues.areaMm2 ? (m.roiValues.areaMm2 / 100).toFixed(2) : '-'} cm²`;
              const meanText = `Mean: ${m.roiValues.meanHu?.toFixed(1) || '-'} HU`;
              drawTextWithBackdrop(`${areaText} | ${meanText}`, rx, ry - 6 * s, '#00e5ff');
            }
          } else if (m.type === 'hu_probe' && m.points.length >= 1) {
            const p = { x: m.points[0].x * scaleX, y: m.points[0].y * scaleY };
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4 * s, 0, Math.PI * 2);
            ctx.stroke();
            drawTextWithBackdrop(`${m.probeHu || 0} HU`, p.x + 8 * s, p.y + 4 * s, '#f43f5e');
          }
          ctx.restore();
        }
      }

      ctx.restore();
    }

    return canvas;
  }

  /**
   * Captures and triggers immediate browser download of the given canvas
   */
  static downloadCanvasImage(
    canvas: HTMLCanvasElement,
    filename: string,
    format: 'png' | 'jpg' | 'bmp' = 'png',
    quality: number = 0.98
  ): void {
    const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const dataUrl = canvas.toDataURL(mimeType, quality);

    const link = document.createElement('a');
    link.download = `${filename}.${format}`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * High-Performance Batch Exporter for Current Slice, Entire Series, or Entire Study.
   * Supports direct local filesystem saving (USB flash drives, local drives) via Electron,
   * or downloadable structured ZIP archives in browser environments.
   */
  static async exportHighResPackage(
    study: DicomStudy,
    currentSeries: DicomSeries | null,
    currentInstance: DicomInstance | null,
    options: BatchExportOptions
  ): Promise<ExportResult> {
    const format = options.format || 'png';
    const quality = options.quality ?? 0.98;
    const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';

    // 1. Gather targeted series and instances
    interface ExportTarget {
      series: DicomSeries;
      instance: DicomInstance;
      seriesDirName: string;
      fileName: string;
    }
    const targets: ExportTarget[] = [];

    const sanitize = (str: string) => (str || 'UNKNOWN').replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_');
    const pName = options.anonymize ? 'ANONYMOUS' : sanitize(study.patientName);
    const pId = options.anonymize ? 'ANON_ID' : sanitize(study.patientId);
    const sDate = study.studyDate || 'STUDY';
    const studyFolderName = `${pName}_${pId}_${sDate}`;

    if (options.scope === 'current_slice') {
      if (!currentInstance || !currentSeries) throw new Error('No active slice selected for export');
      const serDir = `Series_${currentSeries.seriesNumber || 1}_${sanitize(currentSeries.seriesDescription || 'Series')}`;
      const fName = `IM_${String(currentInstance.instanceNumber || 1).padStart(4, '0')}.${format}`;
      targets.push({ series: currentSeries, instance: currentInstance, seriesDirName: serDir, fileName: fName });
    } else if (options.scope === 'current_series') {
      if (!currentSeries) throw new Error('No active series selected for export');
      const serDir = `Series_${currentSeries.seriesNumber || 1}_${sanitize(currentSeries.seriesDescription || 'Series')}`;
      currentSeries.instances.forEach((inst, idx) => {
        const num = inst.instanceNumber ?? idx + 1;
        const fName = `IM_${String(num).padStart(4, '0')}.${format}`;
        targets.push({ series: currentSeries, instance: inst, seriesDirName: serDir, fileName: fName });
      });
    } else {
      // Entire Study
      for (const ser of study.series) {
        const serDir = `Series_${ser.seriesNumber || 1}_${sanitize(ser.seriesDescription || 'Series')}`;
        ser.instances.forEach((inst, idx) => {
          const num = inst.instanceNumber ?? idx + 1;
          const fName = `IM_${String(num).padStart(4, '0')}.${format}`;
          targets.push({ series: ser, instance: inst, seriesDirName: serDir, fileName: fName });
        });
      }
    }

    const total = targets.length;
    if (total === 0) throw new Error('No images found matching export scope');

    const onProgress = options.onProgress || (() => {});
    onProgress({ current: 0, total, percent: 5, status: `Preparing ${total} high-res images...` });

    const hasElectronFs = !!(window.electronAPI?.saveExportBatch && options.targetBaseDir);

    // 2. Mode A: Direct Electron Local / USB Flash Drive Export
    if (hasElectronFs && options.targetBaseDir) {
      const baseDir = options.targetBaseDir;
      const BATCH_SIZE = 10;
      let processed = 0;

      // Group targets by series subfolder
      const seriesGroups = new Map<string, ExportTarget[]>();
      for (const t of targets) {
        const fullSubDir = `${studyFolderName}/${t.seriesDirName}`;
        if (!seriesGroups.has(fullSubDir)) seriesGroups.set(fullSubDir, []);
        seriesGroups.get(fullSubDir)!.push(t);
      }

      for (const [subDir, items] of seriesGroups.entries()) {
        for (let i = 0; i < items.length; i += BATCH_SIZE) {
          const chunk = items.slice(i, i + BATCH_SIZE);
          const batchFiles: Array<{ filename: string; base64: string }> = [];

          for (const item of chunk) {
            const canvas = ExportService.renderHighResInstanceCanvas(item.instance, study, item.series, options);
            const dataUrl = canvas.toDataURL(mimeType, quality);
            const base64 = dataUrl.split(',')[1] || '';
            batchFiles.push({ filename: item.fileName, base64 });
            processed++;
          }

          await window.electronAPI!.saveExportBatch!({
            baseDir,
            subDir,
            files: batchFiles
          });

          const pct = Math.min(98, Math.round((processed / total) * 95));
          onProgress({
            current: processed,
            total,
            percent: pct,
            status: `Saving to USB/Disk: ${processed} of ${total} images...`
          });
        }
      }

      // Write README.TXT
      const readmeText =
        `RADNODE VIEWER - HIGH RESOLUTION MEDICAL IMAGE EXPORT\r\n` +
        `POWERED BY AL-SHAAB HOSPITAL IT TEAM\r\n` +
        `=====================================================\r\n` +
        `Patient Name:     ${options.anonymize ? 'ANONYMOUS' : study.patientName}\r\n` +
        `Patient ID:       ${options.anonymize ? 'ANON_ID' : study.patientId}\r\n` +
        `Study Date:       ${study.studyDate}\r\n` +
        `Study Desc:       ${study.studyDescription}\r\n` +
        `Export Scope:     ${options.scope}\r\n` +
        `Resolution:       ${options.resolutionScale || 1}X (${options.resolutionScale === 4 ? '4K Ultra-HD 300DPI' : options.resolutionScale === 2 ? '2K High-Definition' : 'Native DICOM 1:1'})\r\n` +
        `Image Format:     ${format.toUpperCase()}\r\n` +
        `Total Images:     ${total}\r\n` +
        `Export Date:      ${new Date().toISOString()}\r\n` +
        `=====================================================\r\n`;

      await window.electronAPI!.saveExportBatch!({
        baseDir,
        subDir: studyFolderName,
        files: [{ filename: 'README.TXT', base64: btoa(unescape(encodeURIComponent(readmeText))) }]
      });

      onProgress({ current: total, total, percent: 100, status: 'Export completed successfully!' });
      return {
        success: true,
        count: total,
        savedPath: `${baseDir}\\${studyFolderName}`
      };
    }

    // 3. Mode B: Single Slice Direct Download (If scope is single slice and no folder selected)
    if (options.scope === 'current_slice' && targets.length === 1) {
      const item = targets[0];
      const canvas = ExportService.renderHighResInstanceCanvas(item.instance, study, item.series, options);
      const downloadName = `${pName}_${pId}_${item.fileName.replace(`.${format}`, '')}`;
      ExportService.downloadCanvasImage(canvas, downloadName, format, quality);
      onProgress({ current: 1, total: 1, percent: 100, status: 'Image downloaded successfully!' });
      return { success: true, count: 1 };
    }

    // 4. Mode C: Multi-Image ZIP Archive Package
    const zip = new JSZip();
    const rootFolder = zip.folder(studyFolderName) || zip;
    let processed = 0;

    for (const item of targets) {
      const canvas = ExportService.renderHighResInstanceCanvas(item.instance, study, item.series, options);
      const dataUrl = canvas.toDataURL(mimeType, quality);
      const base64 = dataUrl.split(',')[1] || '';

      const serFolder = rootFolder.folder(item.seriesDirName) || rootFolder;
      serFolder.file(item.fileName, base64, { base64: true });

      processed++;
      if (processed % 5 === 0 || processed === total) {
        const pct = Math.min(85, Math.round((processed / total) * 85));
        onProgress({
          current: processed,
          total,
          percent: pct,
          status: `Rendering high-res images: ${processed} of ${total}...`
        });
        // Allow UI to update
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // Add README.TXT
    const readmeContent =
      `RADNODE VIEWER - HIGH RESOLUTION MEDICAL IMAGE EXPORT\r\n` +
      `POWERED BY AL-SHAAB HOSPITAL IT TEAM\r\n` +
      `=====================================================\r\n` +
      `Patient Name:     ${options.anonymize ? 'ANONYMOUS' : study.patientName}\r\n` +
      `Patient ID:       ${options.anonymize ? 'ANON_ID' : study.patientId}\r\n` +
      `Study Date:       ${study.studyDate}\r\n` +
      `Study Desc:       ${study.studyDescription}\r\n` +
      `Export Scope:     ${options.scope}\r\n` +
      `Resolution:       ${options.resolutionScale || 1}X\r\n` +
      `Total Images:     ${total}\r\n` +
      `Export Date:      ${new Date().toISOString()}\r\n`;
    rootFolder.file('README.TXT', readmeContent);

    onProgress({ current: total, total, percent: 90, status: 'Compressing ZIP archive package...' });
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, (metadata) => {
      const pct = 90 + Math.round((metadata.percent / 100) * 9);
      onProgress({ current: total, total, percent: pct, status: `Building ZIP package (${metadata.percent.toFixed(0)}%)...` });
    });

    const zipFilename = `${studyFolderName}_HighRes_Images.zip`;
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = zipFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    onProgress({ current: total, total, percent: 100, status: 'ZIP package downloaded successfully!' });
    return { success: true, count: total, isZip: true };
  }

  /**
   * Generates a printable Medical Radiology Report
   */
  static generateStudyReport(
    study: DicomStudy,
    currentInstance: DicomInstance,
    measurements: Measurement[],
    snapshotCanvasUrl?: string,
    anonymize: boolean = false
  ): void {
    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) return;

    const patientName = anonymize ? 'ANONYMOUS' : study.patientName.replace(/\^/g, ' ');
    const patientId = anonymize ? 'ANON_ID' : study.patientId;

    const measurementRows = measurements.map((m, idx) => {
      let details = '';
      if (m.type === 'distance') details = `Distance: <strong>${m.distanceMm?.toFixed(2)} mm</strong>`;
      else if (m.type === 'angle') details = `Angle: <strong>${m.angleDeg?.toFixed(1)}°</strong>`;
      else if (m.type === 'cobb_angle') details = `Cobb Angle: <strong>${m.cobbDeg?.toFixed(1)}°</strong>`;
      else if (m.type === 'ctr' && m.ctrValues) {
        details = `Cardiothoracic Ratio (CTR): <strong>${(m.ctrValues.ratio * 100).toFixed(1)}%</strong> (${m.ctrValues.cardiacDiameterMm.toFixed(1)} mm / ${m.ctrValues.thoracicDiameterMm.toFixed(1)} mm) - <span style="color:${m.ctrValues.isCardiomegaly ? '#e11d48' : '#16a34a'};font-weight:bold;">${m.ctrValues.isCardiomegaly ? 'Cardiomegaly (≥ 50%)' : 'Normal (< 50%)'}</span>`;
      } else if (m.roiValues) {
        details = `Area: <strong>${(m.roiValues.areaMm2 ? m.roiValues.areaMm2 / 100 : 0).toFixed(2)} cm²</strong> | Mean: <strong>${m.roiValues.meanHu?.toFixed(1) || '-'} HU</strong> [Min: ${m.roiValues.minHu} .. Max: ${m.roiValues.maxHu} HU]`;
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
            <div class="subtitle">RadNode Medical Workstation - Medical Study Examination Report</div>
          </div>
          <div style="text-align: right; font-size: 12px; color: #64748b;">
            Date: ${new Date().toLocaleDateString('en-US')}
          </div>
        </div>

        <div class="patient-card">
          <div>
            <div class="field-label">Patient Name:</div>
            <div class="field-value">${patientName}</div>
          </div>
          <div>
            <div class="field-label">Patient ID:</div>
            <div class="field-value">${patientId}</div>
          </div>
          <div>
            <div class="field-label">Sex / Age:</div>
            <div class="field-value">${study.patientSex || 'N/A'} / ${study.patientAge || 'N/A'}</div>
          </div>
          <div>
            <div class="field-label">Modality:</div>
            <div class="field-value">${study.modalitiesInStudy?.join(', ') || 'OT'}</div>
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
          <div>Generated by: <strong>RadNode Viewer (Version 1.0.0)</strong> • POWERED BY AL-SHAAB HOSPITAL IT TEAM</div>
          <div>Radiologist Signature: ____________________</div>
        </div>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }

  /**
   * Exports the entire study as a standard DICOMDIR ZIP Media Package (CD/DVD/USB ready)
   */
  static async exportStudyAsDicomdirZip(
    study: DicomStudy,
    onProgress?: (progress: { current: number; total: number; percent: number; status: string }) => void
  ): Promise<void> {
    const blob = await DicomDirGenerator.exportStudyAsDicomdirPackage(study, onProgress);

    const pId = study.patientId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'PATIENT';
    const sDate = study.studyDate || 'STUDY';
    const filename = `${pId}_${sDate}_DICOMDIR_Media.zip`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
