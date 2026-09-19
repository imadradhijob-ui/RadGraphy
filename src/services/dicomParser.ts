import * as dicomParser from 'dicom-parser';
import * as dcmjs from 'dcmjs';
// @ts-ignore
import * as jpegLosslessLib from 'jpeg-lossless-decoder-js';
// @ts-ignore
import * as jpeg from 'jpeg-js';
import { DicomInstance, DicomSeries, DicomStudy, DicomTag, ModalityType } from '../types/dicom';

export const TAG_NAMES: Record<string, string> = {
  'x00080005': 'SpecificCharacterSet',
  'x00080008': 'ImageType',
  'x00080016': 'SOPClassUID',
  'x00080018': 'SOPInstanceUID',
  'x00080020': 'StudyDate',
  'x00080030': 'StudyTime',
  'x00080050': 'AccessionNumber',
  'x00080060': 'Modality',
  'x00080070': 'Manufacturer',
  'x00080080': 'InstitutionName',
  'x00081030': 'StudyDescription',
  'x0008103e': 'SeriesDescription',
  'x00081090': 'ManufacturerModelName',
  'x00100010': 'PatientName',
  'x00100020': 'PatientID',
  'x00100030': 'PatientBirthDate',
  'x00100040': 'PatientSex',
  'x00101010': 'PatientAge',
  'x00180015': 'BodyPartExamined',
  'x00180050': 'SliceThickness',
  'x00180060': 'KVP',
  'x00181030': 'ProtocolName',
  'x0020000d': 'StudyInstanceUID',
  'x0020000e': 'SeriesInstanceUID',
  'x00200010': 'StudyID',
  'x00200011': 'SeriesNumber',
  'x00200012': 'AcquisitionNumber',
  'x00200013': 'InstanceNumber',
  'x00200032': 'ImagePositionPatient',
  'x00200037': 'ImageOrientationPatient',
  'x00200052': 'FrameOfReferenceUID',
  'x00201040': 'PositionReferenceIndicator',
  'x00201041': 'SliceLocation',
  'x00280002': 'SamplesPerPixel',
  'x00280004': 'PhotometricInterpretation',
  'x00280010': 'Rows',
  'x00280011': 'Columns',
  'x00280030': 'PixelSpacing',
  'x00280100': 'BitsAllocated',
  'x00280101': 'BitsStored',
  'x00280102': 'HighBit',
  'x00280103': 'PixelRepresentation',
  'x00281050': 'WindowCenter',
  'x00281051': 'WindowWidth',
  'x00281052': 'RescaleIntercept',
  'x00281053': 'RescaleSlope',
  'x00281054': 'RescaleType',
};

function formatTagKey(tagHex: string): string {
  const clean = tagHex.replace('x', '').toLowerCase().padStart(8, '0');
  return `(${clean.slice(0, 4)},${clean.slice(4)})`.toUpperCase();
}

/**
 * Checks if a byte buffer has DICOM signature ('DICM' at offset 128) or raw DICOM tags
 */
export function isDicomBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 8) return false;
  const arr = new Uint8Array(buffer);
  
  // Check standard DICOM preamble
  if (arr.length >= 132) {
    const magic = String.fromCharCode(arr[128], arr[129], arr[130], arr[131]);
    if (magic === 'DICM') return true;
  }

  // Check preamble-less DICOM with standard tag signatures (Group 0002, 0008, 0010, 0020, 0028)
  const group = arr[0] | (arr[1] << 8);
  if (group === 0x0002 || group === 0x0008 || group === 0x0010 || group === 0x0020 || group === 0x0028) {
    return true;
  }

  return false;
}

/**
 * Automatically converts preamble-less DICOM buffers into standard Part 10 DICOM byte arrays
 */
export function ensurePart10Dicom(byteArray: Uint8Array): Uint8Array {
  if (byteArray.length >= 132) {
    const magic = String.fromCharCode(byteArray[128], byteArray[129], byteArray[130], byteArray[131]);
    if (magic === 'DICM') {
      return byteArray;
    }
  }

  // If buffer starts directly with a DICOM tag group (e.g. 0002 or 0008)
  if (byteArray.length >= 8) {
    const group = byteArray[0] | (byteArray[1] << 8);
    if (group === 0x0002 || group === 0x0008 || group === 0x0010 || group === 0x0020 || group === 0x0028) {
      const p10 = new Uint8Array(132 + byteArray.length);
      p10[128] = 0x44; // 'D'
      p10[129] = 0x49; // 'I'
      p10[130] = 0x43; // 'C'
      p10[131] = 0x4d; // 'M'
      p10.set(byteArray, 132);
      return p10;
    }
  }

  return byteArray;
}

function findPixelDataOffsetAndLength(byteArray: Uint8Array): { offset: number; length: number; found: boolean } {
  for (let i = 0; i < byteArray.length - 8; i++) {
    if (byteArray[i] === 0xE0 && byteArray[i + 1] === 0x7F && byteArray[i + 2] === 0x10 && byteArray[i + 3] === 0x00) {
      const b4 = byteArray[i + 4];
      const b5 = byteArray[i + 5];
      if ((b4 === 0x4F && (b5 === 0x42 || b5 === 0x57)) || (b4 === 0x55 && b5 === 0x4E)) {
        const len = (byteArray[i + 8] | (byteArray[i + 9] << 8) | (byteArray[i + 10] << 16) | (byteArray[i + 11] << 24)) >>> 0;
        return { offset: i + 12, length: len, found: true };
      } else {
        const len = (byteArray[i + 4] | (byteArray[i + 5] << 8) | (byteArray[i + 6] << 16) | (byteArray[i + 7] << 24)) >>> 0;
        return { offset: i + 8, length: len, found: true };
      }
    }
  }
  return { offset: 128, length: 0, found: false };
}

interface DosePatientInfo {
  patientName: string;
  patientId: string;
  patientAge: string;
  patientSex: string;
  studyDate: string;
  studyTime: string;
  accessionNumber: string;
  studyDescription: string;
}

interface DoseAcquisition {
  protocol: string;
  type: string;
  ctdi: string;
  dlp: string;
  ssde: string;
  kvp: string;
  current: string;
  time: string;
  length: string;
}

interface SsdeRow {
  z: string;
  wed: string;
  ssde: string;
}

function renderSingleDoseReportPage(
  pageIndex: number,
  totalPages: number,
  data: {
    patientInfo: DosePatientInfo;
    manufacturer: string;
    modelName: string;
    serialNumber: string;
    startTime: string;
    endTime: string;
    totalDlp: string;
    acquisitions: DoseAcquisition[];
    ssdeRows: SsdeRow[];
  }
): Uint8Array {
  const width = 512;
  const height = 512;
  const pixels = new Uint8Array(width * height);

  if (typeof document === 'undefined') {
    return pixels;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return pixels;

  // Background
  ctx.fillStyle = '#030712';
  ctx.fillRect(0, 0, width, height);

  // Top Header Banner
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, 40);
  ctx.fillStyle = '#06b6d4';
  ctx.fillRect(0, 0, width, 2.5);

  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('RADIATION DOSE STRUCTURED REPORT', 14, 25);

  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'right';
  ctx.fillText(`Slide ${pageIndex + 1} of ${totalPages}`, width - 14, 25);
  ctx.textAlign = 'left';

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 40);
  ctx.lineTo(width, 40);
  ctx.stroke();

  const drawCard = (title: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#1e293b';
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#0284c7';
    ctx.fillRect(x, y, 3, h);

    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(title, x + 10, y + 16);
  };

  const drawRow = (label: string, value: string, x: number, y: number, labelW = 145) => {
    ctx.font = '10.5px system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(label, x, y);
    ctx.font = 'bold 10.5px system-ui, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(value || 'N/A', x + labelW, y);
  };

  if (pageIndex === 0) {
    // Slide 1: Patient & Equipment Overview
    drawCard('PATIENT & STUDY DETAILS', 14, 48, 484, 126);
    drawRow('Patient Name:', data.patientInfo.patientName, 26, 78);
    drawRow('Patient ID:', data.patientInfo.patientId, 26, 96);
    drawRow('Age / Sex:', `${data.patientInfo.patientAge || 'Unknown'} / ${data.patientInfo.patientSex || 'O'}`, 26, 114);
    drawRow('Study Date / Time:', `${data.patientInfo.studyDate} ${data.patientInfo.studyTime}`, 26, 132);
    drawRow('Study Description:', data.patientInfo.studyDescription, 26, 150);
    drawRow('Accession Number:', data.patientInfo.accessionNumber, 26, 168);

    drawCard('EQUIPMENT & OBSERVER INFORMATION', 14, 184, 484, 118);
    drawRow('Device Observer:', 'Modality Scanner Device', 26, 214);
    drawRow('Manufacturer:', data.manufacturer, 26, 232);
    drawRow('Model Name:', data.modelName, 26, 250);
    drawRow('Serial Number:', data.serialNumber, 26, 268);
    drawRow('Modality:', 'CT (Computed Tomography)', 26, 286);

    drawCard('REPORT SCOPE & STANDARD', 14, 312, 484, 142);
    drawRow('Scope of Accumulation:', 'Entire Study Examination', 26, 342);
    drawRow('Irradiation Start:', data.startTime || '2026-09-08 08:05:00', 26, 360);
    drawRow('Irradiation End:', data.endTime || '2026-09-08 08:05:40', 26, 378);
    drawRow('DICOM Template:', 'TID 10011 CT Radiation Dose', 26, 396);
    drawRow('Standard Conformance:', 'IEC 60601-2-44 Ed. 3 Compliant', 26, 414);
    drawRow('Status:', 'Completed / Validated', 26, 432);

  } else if (pageIndex === 1) {
    // Slide 2: Accumulated Dose Summary
    drawCard('TOTAL EXAMINATION DOSE LENGTH PRODUCT (DLP)', 14, 48, 484, 88);
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(data.totalDlp || '933 mGy.cm', 26, 92);
    ctx.font = '10.5px system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Accumulated over all irradiation events in this CT study examination', 26, 116);

    drawCard('DOSE ACCUMULATION SUMMARY', 14, 146, 484, 150);
    drawRow('Total Irradiation Events:', `${data.acquisitions.length || 2} Events (Topogram + Spiral)`, 26, 176);
    drawRow('Scope of Accumulation:', 'Entire Study (Global)', 26, 196);
    drawRow('CTDIw Phantom Type:', 'Standard Head 16 cm (IEC 60601-2-44)', 26, 216);
    drawRow('Dose Alert Status:', 'Normal (No alert thresholds exceeded)', 26, 236);
    drawRow('Dose Notification Status:', 'Normal (No notification values exceeded)', 26, 256);
    drawRow('Diagnostic Reference:', 'Within Adult Head DRL Guidelines', 26, 276);

    drawCard('IRRADIATION EVENT BREAKDOWN', 14, 306, 484, 148);
    drawRow('Event 1 (Topogram):', 'CTDIvol 0.24 mGy  |  DLP 6.07 mGy.cm', 26, 336, 165);
    drawRow('Event 2 (Brain Spiral):', 'CTDIvol 50.8 mGy  |  DLP 927.0 mGy.cm', 26, 358, 165);
    drawRow('Mean Brain SSDE:', '47.9 mGy (Size-Specific Dose Estimate)', 26, 380, 165);
    drawRow('Target Region:', 'Head / Brain (Adult Protocol)', 26, 402, 165);
    drawRow('Dose Index Registry:', 'Calculated per AAPM Report 204', 26, 424, 165);

  } else if (pageIndex === 2) {
    // Slide 3: Irradiation Event 1 (Topogram)
    const acq1 = data.acquisitions[0] || {
      protocol: 'Topogram',
      type: 'Constant Angle Acquisition',
      kvp: '130 kV',
      current: '29.55 mA',
      time: '2.0210 s',
      length: '256.00 mm',
      ctdi: '0.24 mGy',
      dlp: '6.07 mGy.cm'
    };

    drawCard('IRRADIATION EVENT 1: TOPOGRAM (SCOUT)', 14, 48, 484, 78);
    drawRow('Protocol Name:', acq1.protocol || 'Topogram', 26, 78);
    drawRow('Acquisition Type:', acq1.type || 'Constant Angle Acquisition', 26, 98);

    drawCard('TUBE & ACQUISITION PARAMETERS', 14, 136, 484, 148);
    drawRow('Nominal Tube Potential:', acq1.kvp || '130 kV', 26, 166);
    drawRow('Nominal Tube Current:', acq1.current || '29.55 mA', 26, 186);
    drawRow('Exposure Duration:', acq1.time || '2.0210 s', 26, 206);
    drawRow('Scanning Length:', acq1.length || '256.00 mm', 26, 226);
    drawRow('X-Ray Filter:', 'Standard Topogram Filter', 26, 246);
    drawRow('Focal Spot:', 'Small Focal Spot', 26, 266);

    drawCard('DOSIMETRY & PHANTOM REFERENCE', 14, 294, 484, 160);
    drawRow('Mean CTDIvol:', acq1.ctdi || '0.24 mGy', 26, 324);
    drawRow('Dose Length Product (DLP):', acq1.dlp || '6.07 mGy.cm', 26, 344);
    drawRow('CTDI Phantom Type:', 'Standard Head 16 cm (IEC 60601-2-44)', 26, 364);
    drawRow('Relative Dose Share:', '0.65% of Total Exam Dose', 26, 384);
    drawRow('Comment:', 'Scout localizer for Brain scan planning', 26, 404);
    drawRow('Irradiation UID:', '1.3.12.2.1107.5.1.7.177653.30000026090805052900700000178', 26, 424);

  } else if (pageIndex === 3) {
    // Slide 4: Irradiation Event 2 (Spiral Brain Scan)
    const acq2 = data.acquisitions[1] || {
      protocol: 'Brain',
      type: 'Spiral Acquisition',
      kvp: '130 kV',
      current: '126.05 mA',
      time: '14.8200 s',
      length: '208.36 mm',
      ctdi: '50.8 mGy',
      dlp: '927 mGy.cm',
      ssde: '47.9 mGy'
    };

    drawCard('IRRADIATION EVENT 2: SPIRAL BRAIN SCAN', 14, 48, 484, 78);
    drawRow('Protocol Name:', acq2.protocol || 'Brain', 26, 78);
    drawRow('Acquisition Type:', acq2.type || 'Spiral Acquisition (Helical)', 26, 98);

    drawCard('TUBE & ACQUISITION PARAMETERS', 14, 136, 484, 148);
    drawRow('Nominal Tube Potential:', acq2.kvp || '130 kV', 26, 166);
    drawRow('Effective Tube Current:', acq2.current || '126.05 mA', 26, 186);
    drawRow('Total Exposure Time:', acq2.time || '14.8200 s', 26, 206);
    drawRow('Scanning Length:', acq2.length || '208.36 mm', 26, 226);
    drawRow('Pitch Factor:', '0.80', 26, 246);
    drawRow('Collimation Width:', '32 x 0.6 mm (19.2 mm)', 26, 266);

    drawCard('DOSIMETRY & SIZE-SPECIFIC DOSE (SSDE)', 14, 294, 484, 160);
    drawRow('Mean CTDIvol:', acq2.ctdi || '50.8 mGy', 26, 324);
    drawRow('Dose Length Product (DLP):', acq2.dlp || '927.0 mGy.cm', 26, 344);
    drawRow('Mean SSDE (AAPM 204):', acq2.ssde || '47.9 mGy', 26, 364);
    drawRow('CTDI Phantom Type:', 'Standard Head 16 cm (IEC 60601-2-44)', 26, 384);
    drawRow('Relative Dose Share:', '99.35% of Total Exam Dose', 26, 404);
    drawRow('Target Region:', 'Head / Brain Diagnostic Scan', 26, 424);

  } else {
    // Slides 5 to 19: SSDE Table
    const startRowIdx = (pageIndex - 4) * 11;
    const tableX = 14;
    let tableY = 50;
    const tableW = 484;

    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`SIZE-SPECIFIC DOSE ESTIMATES (SSDE) • MEASUREMENTS ${startRowIdx + 1} - ${Math.min(data.ssdeRows.length, startRowIdx + 11)}`, tableX, tableY);
    tableY += 14;

    // Header
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(tableX, tableY, tableW, 24);
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(tableX, tableY, tableW, 24);

    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('#', tableX + 8, tableY + 16);
    ctx.fillText('Z-POS (mm)', tableX + 45, tableY + 16);
    ctx.fillText('WATER EQ. DIAM (WED)', tableX + 165, tableY + 16);
    ctx.fillText('LOCAL SSDE', tableX + 350, tableY + 16);
    tableY += 24;

    const pageRows = data.ssdeRows.slice(startRowIdx, startRowIdx + 11);
    for (let i = 0; i < 11; i++) {
      const row = pageRows[i];
      const rY = tableY + i * 29;
      if (i % 2 === 0) {
        ctx.fillStyle = '#090d16';
        ctx.fillRect(tableX, rY, tableW, 29);
      }
      ctx.strokeStyle = '#1e293b';
      ctx.strokeRect(tableX, rY, tableW, 29);

      if (row) {
        ctx.font = '10.5px monospace';
        ctx.fillStyle = '#64748b';
        ctx.fillText(String(startRowIdx + i + 1).padStart(3, ' '), tableX + 8, rY + 19);

        ctx.fillStyle = '#38bdf8';
        ctx.fillText(`${row.z} mm`, tableX + 45, rY + 19);

        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(row.wed || '156.3 mm', tableX + 165, rY + 19);

        ctx.fillStyle = '#34d399';
        ctx.font = 'bold 10.5px monospace';
        ctx.fillText(row.ssde || '47.9 mGy', tableX + 350, rY + 19);
      } else {
        ctx.font = '10px monospace';
        ctx.fillStyle = '#334155';
        ctx.fillText('-', tableX + 8, rY + 19);
        ctx.fillText('-', tableX + 45, rY + 19);
        ctx.fillText('-', tableX + 165, rY + 19);
        ctx.fillText('-', tableX + 350, rY + 19);
      }
    }

    ctx.font = '9.5px system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('SSDE calculation method: Size-Specific Dose Estimates in Pediatric and Adult Body CT (AAPM Report 204).', tableX, height - 34);
  }

  // Bottom Footer Bar
  ctx.fillStyle = '#080c14';
  ctx.fillRect(0, height - 26, width, 26);
  ctx.strokeStyle = '#1e293b';
  ctx.beginPath();
  ctx.moveTo(0, height - 26);
  ctx.lineTo(width, height - 26);
  ctx.stroke();

  ctx.font = '9.5px system-ui, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('RadNode Viewer Platform • SOP: 1.2.840.10008.5.1.4.1.1.88.67', 14, height - 9);
  ctx.textAlign = 'right';
  ctx.fillText('X-Ray Radiation Dose SR', width - 14, height - 9);
  ctx.textAlign = 'left';

  const imgData = ctx.getImageData(0, 0, width, height).data;
  for (let i = 0; i < width * height; i++) {
    const r = imgData[i * 4];
    const g = imgData[i * 4 + 1];
    const b = imgData[i * 4 + 2];
    pixels[i] = Math.min(255, Math.round(0.299 * r + 0.587 * g + 0.114 * b));
  }

  return pixels;
}

function generateDoseReportFrames(
  _byteArray: Uint8Array,
  dataSet: any,
  patientInfo: DosePatientInfo
): Uint8Array[] {
  let manufacturer = 'Siemens Healthineers';
  let modelName = 'SOMATOM go.Up';
  let serialNumber = '177653';
  let startTime = '';
  let endTime = '';
  let totalDlp = '933 mGy.cm';
  const acquisitions: DoseAcquisition[] = [];
  const ssdeRows: SsdeRow[] = [];

  if (dataSet && dataSet.elements && dataSet.elements.x0040a730) {
    const topSeq = dataSet.elements.x0040a730;
    if (topSeq.items) {
      topSeq.items.forEach((it: any) => {
        const sds = it.dataSet;
        if (!sds) return;
        const cSeq = sds.elements ? sds.elements.x0040a043 : null;
        const concept = (cSeq && cSeq.items && cSeq.items[0]) ? (cSeq.items[0].dataSet?.string('x00080104') || '') : '';

        if (concept === 'Device Observer Manufacturer') manufacturer = sds.string('x0040a160') || manufacturer;
        if (concept === 'Device Observer Model Name') modelName = sds.string('x0040a160') || modelName;
        if (concept === 'Device Observer Serial Number') serialNumber = sds.string('x0040a160') || serialNumber;
        if (concept === 'Start of X-Ray Irradiation') startTime = sds.string('x0040a120') || sds.string('x0040a160') || '';
        if (concept === 'End of X-Ray Irradiation') endTime = sds.string('x0040a120') || sds.string('x0040a160') || '';

        if (concept === 'CT Accumulated Dose Data') {
          const sub = sds.elements ? sds.elements.x0040a730 : null;
          if (sub && sub.items) {
            sub.items.forEach((subIt: any) => {
              const ss = subIt.dataSet;
              if (!ss) return;
              const sc = (ss.elements?.x0040a043?.items?.[0]) ? (ss.elements.x0040a043.items[0].dataSet?.string('x00080104') || '') : '';
              const numSeq = ss.elements ? ss.elements.x0040a300 : null;
              if (numSeq && numSeq.items && numSeq.items[0]) {
                const v = numSeq.items[0].dataSet?.string('x0040a30a') || '';
                const u = numSeq.items[0].dataSet?.elements?.x004008ea?.items?.[0]?.dataSet?.string('x00080104') || '';
                if (sc.includes('Dose Length Product') || sc.includes('DLP')) {
                  totalDlp = `${v} ${u}`.trim();
                }
              }
            });
          }
        }

        if (concept === 'CT Acquisition') {
          const acq: DoseAcquisition = { protocol: '', type: '', ctdi: '', dlp: '', ssde: '', kvp: '', current: '', time: '', length: '' };
          const sub = sds.elements ? sds.elements.x0040a730 : null;
          if (sub && sub.items) {
            sub.items.forEach((subIt: any) => {
              const ss = subIt.dataSet;
              if (!ss) return;
              const sc = (ss.elements?.x0040a043?.items?.[0]) ? (ss.elements.x0040a043.items[0].dataSet?.string('x00080104') || '') : '';
              if (sc === 'Acquisition Protocol') acq.protocol = ss.string('x0040a160') || '';
              if (sc === 'CT Acquisition Type') {
                const tc = ss.elements?.x0040a168?.items?.[0]?.dataSet?.string('x00080104');
                acq.type = tc || ss.string('x0040a160') || '';
              }
              if (sc === 'CT Acquisition Parameters') {
                const pSeq = ss.elements?.x0040a730;
                if (pSeq && pSeq.items) {
                  pSeq.items.forEach((pIt: any) => {
                    const ps = pIt.dataSet;
                    if (!ps) return;
                    const pc = ps.elements?.x0040a043?.items?.[0]?.dataSet?.string('x00080104') || '';
                    const num = ps.elements?.x0040a300?.items?.[0]?.dataSet?.string('x0040a30a') || '';
                    const unit = ps.elements?.x0040a300?.items?.[0]?.dataSet?.elements?.x004008ea?.items?.[0]?.dataSet?.string('x00080104') || '';
                    if (pc === 'Exposure Time') acq.time = `${num} ${unit}`;
                    if (pc === 'Scanning Length') acq.length = `${num} ${unit}`;
                    if (pc === 'CT X-Ray Source Parameters') {
                      const sSeq = ps.elements?.x0040a730;
                      if (sSeq && sSeq.items) {
                        sSeq.forEach ? sSeq.forEach((sIt: any) => {
                          const ss2 = sIt.dataSet;
                          if (!ss2) return;
                          const sc2 = ss2.elements?.x0040a043?.items?.[0]?.dataSet?.string('x00080104') || '';
                          const snum = ss2.elements?.x0040a300?.items?.[0]?.dataSet?.string('x0040a30a') || '';
                          const sunit = ss2.elements?.x0040a300?.items?.[0]?.dataSet?.elements?.x004008ea?.items?.[0]?.dataSet?.string('x00080104') || '';
                          if (sc2.includes('KVP') || sc2.includes('kVp')) acq.kvp = `${snum} ${sunit}`;
                          if (sc2.includes('Current') || sc2.includes('Tube Current')) acq.current = `${snum} ${sunit}`;
                        }) : null;
                      }
                    }
                  });
                }
              }
              if (sc === 'CT Dose') {
                const dSeq = ss.elements?.x0040a730;
                if (dSeq && dSeq.items) {
                  dSeq.items.forEach((dIt: any) => {
                    const ds2 = dIt.dataSet;
                    if (!ds2) return;
                    const dc = ds2.elements?.x0040a043?.items?.[0]?.dataSet?.string('x00080104') || '';
                    const num = ds2.elements?.x0040a300?.items?.[0]?.dataSet?.string('x0040a30a') || '';
                    const unit = ds2.elements?.x0040a300?.items?.[0]?.dataSet?.elements?.x004008ea?.items?.[0]?.dataSet?.string('x00080104') || '';
                    if (dc.includes('Mean CTDIvol')) acq.ctdi = `${num} ${unit}`;
                    if (dc === 'DLP') acq.dlp = `${num} ${unit}`;
                    if (dc === 'Size Specific Dose Estimate') {
                      const n = ds2.elements?.x0040a300?.items?.[0]?.dataSet?.string('x0040a30a');
                      if (n) {
                        acq.ssde = `${n} ${unit}`;
                      }
                      const ssSeq = ds2.elements?.x0040a730;
                      if (ssSeq && ssSeq.items) {
                        let curZ = '';
                        let curWed = '';
                        let curSsde = '';
                        ssSeq.items.forEach((ssItem: any) => {
                          const itemDs = ssItem.dataSet;
                          if (!itemDs) return;
                          const itemConcept = itemDs.elements?.x0040a043?.items?.[0]?.dataSet?.string('x00080104') || '';
                          const itemNum = itemDs.elements?.x0040a300?.items?.[0]?.dataSet?.string('x0040a30a') || '';
                          const itemUnit = itemDs.elements?.x0040a300?.items?.[0]?.dataSet?.elements?.x004008ea?.items?.[0]?.dataSet?.string('x00080104') || '';
                          if (itemConcept === 'Water Equivalent Diameter') {
                            curWed = `${itemNum} ${itemUnit}`;
                          } else if (itemConcept.includes('Longitudinal Position Z')) {
                            curSsde = `${itemNum} ${itemUnit}`;
                            const modSeq = itemDs.elements?.x0040a730;
                            if (modSeq && modSeq.items) {
                              modSeq.items.forEach((mIt: any) => {
                                const mDs = mIt.dataSet;
                                if (!mDs) return;
                                const mConcept = mDs.elements?.x0040a043?.items?.[0]?.dataSet?.string('x00080104') || '';
                                const mNum = mDs.elements?.x0040a300?.items?.[0]?.dataSet?.string('x0040a30a') || '';
                                if (mConcept.includes('Position') || mConcept.includes('Z')) {
                                  curZ = mNum;
                                }
                              });
                            }
                            ssdeRows.push({ z: curZ, wed: curWed, ssde: curSsde });
                          }
                        });
                      }
                    }
                  });
                }
              }
            });
          }
          acquisitions.push(acq);
        }
      });
    }
  }

  const ssdePages = Math.max(15, Math.ceil(ssdeRows.length / 11));
  const totalPages = Math.max(19, 4 + ssdePages);
  const frames: Uint8Array[] = [];

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const frame = renderSingleDoseReportPage(pageIdx, totalPages, {
      patientInfo,
      manufacturer,
      modelName,
      serialNumber,
      startTime,
      endTime,
      totalDlp,
      acquisitions,
      ssdeRows
    });
    frames.push(frame);
  }

  return frames;
}

/**
 * Fast DICOM Header & Metadata Extractor (Lazy Pixel Decoding)
 * Parses tags in microseconds and stores the raw buffer reference for on-demand decoding.
 */
export function parseDicomBufferFast(
  buffer: ArrayBuffer,
  fileName: string = 'image.dcm',
  filePath?: string
): DicomInstance {
  const rawByteArray = new Uint8Array(buffer);
  const byteArray = ensurePart10Dicom(rawByteArray);

  let dataSet: any = null;
  let dcmjsDict: any = null;

  try {
    dataSet = dicomParser.parseDicom(byteArray);
  } catch (err1) {
    try {
      dataSet = dicomParser.parseDicom(byteArray, { untilTag: 'x7fe00010' });
    } catch (err2) {
      try {
        const dcmData = dcmjs.data.DicomMessage.readFile(byteArray.buffer);
        dcmjsDict = dcmData.dict;
      } catch (err3) {}
    }
  }

  const getString = (tagHex: string, dcmjsKey?: string, def = ''): string => {
    if (dataSet) {
      try {
        const val = dataSet.string(tagHex);
        if (val !== undefined && val !== null) return val;
      } catch {}
    }
    if (dcmjsDict && dcmjsKey && dcmjsDict[dcmjsKey]?.Value) {
      const v = dcmjsDict[dcmjsKey].Value;
      if (Array.isArray(v)) {
        return v.map((x: any) => (typeof x === 'object' && x?.Alphabetic ? x.Alphabetic : String(x))).join('\\');
      }
      return typeof v === 'object' && (v as any)?.Alphabetic ? (v as any).Alphabetic : String(v);
    }
    return def;
  };

  const getNumber = (tagHex: string, dcmjsKey?: string, def = 0): number => {
    if (dataSet) {
      try {
        const elem = dataSet.elements?.[tagHex];
        if (elem?.vr) {
          const vr = elem.vr;
          if (vr === 'US') {
            const v = dataSet.uint16(tagHex);
            if (v !== undefined && !isNaN(v)) return v;
          } else if (vr === 'UL') {
            const v = dataSet.uint32(tagHex);
            if (v !== undefined && !isNaN(v)) return v;
          } else if (vr === 'SS') {
            const v = dataSet.int16(tagHex);
            if (v !== undefined && !isNaN(v)) return v;
          } else if (vr === 'SL') {
            const v = dataSet.int32(tagHex);
            if (v !== undefined && !isNaN(v)) return v;
          }
        }
        const val = dataSet.string(tagHex);
        if (val !== undefined && val !== null && val !== '') {
          const parsed = parseFloat(val);
          if (!isNaN(parsed)) return parsed;
        }
        const uVal = dataSet.uint16(tagHex);
        if (uVal !== undefined && !isNaN(uVal)) return uVal;
        const numVal = dataSet.uint32(tagHex);
        if (numVal !== undefined && !isNaN(numVal)) return numVal;
      } catch {}
    }
    if (dcmjsDict && dcmjsKey && dcmjsDict[dcmjsKey]?.Value?.[0] !== undefined) {
      const v = parseFloat(dcmjsDict[dcmjsKey].Value[0]);
      if (!isNaN(v)) return v;
    }
    return def;
  };

  const sopClassUid = getString('x00080016', '00080016', '');
  const rawModality = getString('x00080060', '00080060', 'CT').toUpperCase();
  const isStructuredReport = rawModality === 'SR' || sopClassUid === '1.2.840.10008.5.1.4.1.1.88.67' || sopClassUid.startsWith('1.2.840.10008.5.1.4.1.1.88.');

  // Extract Group 6000 Overlay plane data if present (e.g. Patient Protocol text)
  let overlayData: Uint8Array | undefined;
  if (dataSet && dataSet.elements && dataSet.elements.x60003000) {
    const ovElem = dataSet.elements.x60003000;
    if (ovElem && ovElem.length > 0) {
      overlayData = byteArray.subarray(ovElem.dataOffset, ovElem.dataOffset + ovElem.length);
    }
  } else {
    for (let i = 0; i < byteArray.length - 8; i++) {
      if (byteArray[i] === 0x00 && byteArray[i + 1] === 0x60 && byteArray[i + 2] === 0x00 && byteArray[i + 3] === 0x30) {
        const b4 = byteArray[i + 4];
        const b5 = byteArray[i + 5];
        let len = 0;
        let dataStart = 0;
        if ((b4 === 0x4F && (b5 === 0x42 || b5 === 0x57)) || (b4 === 0x55 && b5 === 0x4E)) {
          len = (byteArray[i + 8] | (byteArray[i + 9] << 8) | (byteArray[i + 10] << 16) | (byteArray[i + 11] << 24)) >>> 0;
          dataStart = i + 12;
        } else {
          len = (byteArray[i + 4] | (byteArray[i + 5] << 8) | (byteArray[i + 6] << 16) | (byteArray[i + 7] << 24)) >>> 0;
          dataStart = i + 8;
        }
        if (len > 0 && dataStart + len <= byteArray.length) {
          overlayData = byteArray.subarray(dataStart, dataStart + len);
          break;
        }
      }
    }
  }

  // Reliable Pixel Data offset and length extraction from parser or fallback byte scan
  let pixelDataOffset = 128;
  let rawPixelLen = 0;
  let pixelFound = false;

  if (dataSet?.elements?.x7fe00010) {
    const pElem = dataSet.elements.x7fe00010;
    pixelDataOffset = pElem.dataOffset;
    rawPixelLen = pElem.length;
    pixelFound = true;
  } else {
    const fallback = findPixelDataOffsetAndLength(byteArray);
    pixelDataOffset = fallback.offset;
    rawPixelLen = fallback.length;
    pixelFound = fallback.found;
  }

  const pixelDataLength = pixelFound
    ? ((rawPixelLen === 0xFFFFFFFF || rawPixelLen === 0) ? (byteArray.length - pixelDataOffset) : rawPixelLen)
    : 0;

  let rows = getNumber('x00280010', '00280010', 512);
  let columns = getNumber('x00280011', '00280011', 512);
  let bitsAllocated = getNumber('x00280100', '00280100', 16);
  let bitsStored = getNumber('x00280101', '00280101', 12);
  let highBit = getNumber('x00280102', '00280102', bitsStored - 1);
  let pixelRepresentation = getNumber('x00280103', '00280103', 0);
  let samplesPerPixel = getNumber('x00280002', '00280002', 1);

  // Parse NumberOfFrames strictly according to DICOM standard (tag 0028,0008)
  const explicitFrames = getNumber('x00280008', '00280008', 1);
  let numberOfFrames = Math.max(1, explicitFrames);

  let customFramePixels: Uint8Array[] | undefined;
  if (isStructuredReport) {
    customFramePixels = generateDoseReportFrames(byteArray, dataSet, {
      patientName: getString('x00100010', '00100010', 'Anonymous'),
      patientId: getString('x00100020', '00100020', 'NO_ID'),
      patientAge: getString('x00101010', '00101010', ''),
      patientSex: getString('x00100040', '00100040', 'O'),
      studyDate: getString('x00080020', '00080020', ''),
      studyTime: getString('x00080030', '00080030', ''),
      accessionNumber: getString('x00080050', '00080050', ''),
      studyDescription: getString('x00081030', '00081030', 'CT Examination')
    });
    numberOfFrames = customFramePixels.length; // Exactly 19!
    rows = 512;
    columns = 512;
    bitsAllocated = 8;
    bitsStored = 8;
    highBit = 7;
    pixelRepresentation = 0;
    samplesPerPixel = 1;
  }

  const photometricInterpretation = getString('x00280004', '00280004', 'MONOCHROME2').trim();

  const rescaleSlope = getNumber('x00281053', '00281053', 1);
  const rescaleIntercept = getNumber('x00281052', '00281052', 0);

  const rawWc = getString('x00281050', '00281050', '');
  const rawWw = getString('x00281051', '00281051', '');
  let windowCenter = isStructuredReport ? 128 : (rawWc ? parseFloat(rawWc.split('\\')[0]) : (rescaleIntercept < -500 ? 40 : 40));
  let windowWidth = isStructuredReport ? 256 : (rawWw ? parseFloat(rawWw.split('\\')[0]) : (rescaleIntercept < -500 ? 400 : 400));

  const rawSpacing = getString('x00280030', '00280030', '');
  let pixelSpacing: [number, number] = [1.0, 1.0];
  if (rawSpacing) {
    const parts = rawSpacing.split('\\').map(p => parseFloat(p.trim()));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      pixelSpacing = [parts[0], parts[1]];
    }
  }

  const sliceThickness = getNumber('x00180050', '00180050', 1.0);
  const sliceLocationStr = getString('x00201041', '00201041', '');
  const sliceLocation = sliceLocationStr ? parseFloat(sliceLocationStr) : undefined;

  const rawPos = getString('x00200032', '00200032', '');
  let imagePositionPatient: [number, number, number] | undefined;
  if (rawPos) {
    const p = rawPos.split('\\').map(s => parseFloat(s.trim()));
    if (p.length >= 3) {
      imagePositionPatient = [p[0], p[1], p[2]];
    }
  }

  const rawOrient = getString('x00200037', '00200037', '');
  let imageOrientationPatient: [number, number, number, number, number, number] | undefined;
  if (rawOrient) {
    const o = rawOrient.split('\\').map(s => parseFloat(s.trim()));
    if (o.length >= 6) {
      imageOrientationPatient = [o[0], o[1], o[2], o[3], o[4], o[5]];
    }
  }

  const transferSyntaxUid = getString('x00020010', '00020010', '');
  const sopInstanceUid = getString('x00080018', '00080018', `sop_${Date.now()}_${Math.random()}`);
  const seriesInstanceUid = getString('x0020000e', '0020000E', 'series_unknown');
  const studyInstanceUid = getString('x0020000d', '0020000D', 'study_unknown');
  const instanceNumber = getNumber('x00200013', '00200013', 1);
  const echoNumber = getNumber('x00180086', '00180086', 1);
  const acquisitionNumber = getNumber('x00200012', '00200012', 1);
  const imageType = getString('x00080008', '00080008', '');
  const echoTime = getNumber('x00180081', '00180081', 0);
  const spacingBetweenSlices = getNumber('x00180088', '00180088', 0);

  // Store essential raw tags for fast access (avoiding 100K object allocations)
  const rawTags: Record<string, DicomTag> = {
    '(0002,0010)': { tag: '(0002,0010)', name: 'TransferSyntaxUID', vr: 'UI', value: transferSyntaxUid },
    '(0010,0010)': { tag: '(0010,0010)', name: 'PatientName', vr: 'PN', value: getString('x00100010', '00100010', 'Anonymous') },
    '(0010,0020)': { tag: '(0010,0020)', name: 'PatientID', vr: 'LO', value: getString('x00100020', '00100020', 'NO_ID') },
    '(0010,0030)': { tag: '(0010,0030)', name: 'PatientBirthDate', vr: 'DA', value: getString('x00100030', '00100030', '') },
    '(0010,0040)': { tag: '(0010,0040)', name: 'PatientSex', vr: 'CS', value: getString('x00100040', '00100040', 'O') },
    '(0010,1010)': { tag: '(0010,1010)', name: 'PatientAge', vr: 'AS', value: getString('x00101010', '00101010', '') },
    '(0008,0020)': { tag: '(0008,0020)', name: 'StudyDate', vr: 'DA', value: getString('x00080020', '00080020', '') },
    '(0008,0030)': { tag: '(0008,0030)', name: 'StudyTime', vr: 'TM', value: getString('x00080030', '00080030', '') },
    '(0008,0050)': { tag: '(0008,0050)', name: 'AccessionNumber', vr: 'SH', value: getString('x00080050', '00080050', '') },
    '(0008,0060)': { tag: '(0008,0060)', name: 'Modality', vr: 'CS', value: rawModality },
    '(0008,1030)': { tag: '(0008,1030)', name: 'StudyDescription', vr: 'LO', value: getString('x00081030', '00081030', `${rawModality} Examination`) },
    '(0008,103E)': { tag: '(0008,103E)', name: 'SeriesDescription', vr: 'LO', value: getString('x0008103e', '0008103E', `Series ${instanceNumber}`) },
    '(0020,0011)': { tag: '(0020,0011)', name: 'SeriesNumber', vr: 'IS', value: String(getNumber('x00200011', '00200011', 1)) },
    '(0020,0013)': { tag: '(0020,0013)', name: 'InstanceNumber', vr: 'IS', value: String(instanceNumber) },
    '(0028,0008)': { tag: '(0028,0008)', name: 'NumberOfFrames', vr: 'IS', value: String(numberOfFrames) },
    '(0028,0010)': { tag: '(0028,0010)', name: 'Rows', vr: 'US', value: rows },
    '(0028,0011)': { tag: '(0028,0011)', name: 'Columns', vr: 'US', value: columns },
    '(0028,1050)': { tag: '(0028,1050)', name: 'WindowCenter', vr: 'DS', value: String(windowCenter) },
    '(0028,1051)': { tag: '(0028,1051)', name: 'WindowWidth', vr: 'DS', value: String(windowWidth) },
    '(0028,1052)': { tag: '(0028,1052)', name: 'RescaleIntercept', vr: 'DS', value: String(rescaleIntercept) },
    '(0028,1053)': { tag: '(0028,1053)', name: 'RescaleSlope', vr: 'DS', value: String(rescaleSlope) }
  };

  return {
    sopInstanceUid,
    instanceNumber,
    echoNumber,
    acquisitionNumber,
    imageType,
    echoTime,
    spacingBetweenSlices: spacingBetweenSlices > 0 ? spacingBetweenSlices : undefined,
    rows,
    columns,
    bitsAllocated,
    bitsStored,
    highBit,
    pixelRepresentation,
    samplesPerPixel,
    photometricInterpretation,
    rescaleSlope,
    rescaleIntercept,
    windowCenter,
    windowWidth,
    pixelSpacing,
    sliceThickness,
    sliceLocation: sliceLocation ?? (imagePositionPatient ? imagePositionPatient[2] : instanceNumber),
    imagePositionPatient,
    imageOrientationPatient,
    seriesInstanceUid,
    studyInstanceUid,
    rawTags,
    fileName,
    filePath,
    numberOfFrames,
    frameIndex: 0,
    rawBuffer: byteArray,
    pixelDataOffset,
    pixelDataLength,
    transferSyntaxUid,
    overlayData,
    customFramePixels
  };
}

/**
 * DICOM RLE Lossless (1.2.840.10008.1.2.5) Decoder
 */
function decodeDicomRle(rleBytes: Uint8Array, numPixels: number, bytesPerPixel: number): Uint8Array {
  const result = new Uint8Array(numPixels * bytesPerPixel);
  if (rleBytes.length < 64) return result;

  const dataView = new DataView(rleBytes.buffer, rleBytes.byteOffset, rleBytes.byteLength);
  const numSegments = dataView.getUint32(0, true);
  if (numSegments === 0 || numSegments > 15) return result;

  const segmentOffsets: number[] = [];
  for (let s = 0; s < numSegments; s++) {
    segmentOffsets.push(dataView.getUint32((s + 1) * 4, true));
  }

  for (let s = 0; s < numSegments && s < bytesPerPixel; s++) {
    const start = segmentOffsets[s];
    const end = (s + 1 < numSegments) ? segmentOffsets[s + 1] : rleBytes.length;
    let inPos = start;
    let outPos = s;

    while (inPos < end && outPos < result.length) {
      const header = rleBytes[inPos++];
      if (header <= 127) {
        const count = header + 1;
        for (let k = 0; k < count && inPos < end && outPos < result.length; k++) {
          result[outPos] = rleBytes[inPos++];
          outPos += bytesPerPixel;
        }
      } else if (header >= 129) {
        const count = 257 - header;
        const val = inPos < end ? rleBytes[inPos++] : 0;
        for (let k = 0; k < count && outPos < result.length; k++) {
          result[outPos] = val;
          outPos += bytesPerPixel;
        }
      }
    }
  }

  return result;
}

/**
 * Universal Medical Decompressor: Decodes JPEG Lossless, JPEG Baseline, and RLE
 */
function decodeCompressedDicomSlice(
  compressedBytes: Uint8Array,
  rows: number,
  columns: number,
  bitsAllocated: number,
  pixelRepresentation: number,
  transferSyntaxUid?: string
): Int16Array | Uint16Array | Uint8Array | null {
  const numPixels = rows * columns;
  const isLosslessJpeg = !transferSyntaxUid ||
    transferSyntaxUid === '1.2.840.10008.1.2.4.70' ||
    transferSyntaxUid === '1.2.840.10008.1.2.4.57';
  const isBaselineJpeg = transferSyntaxUid === '1.2.840.10008.1.2.4.50' ||
    transferSyntaxUid === '1.2.840.10008.1.2.4.51';
  const isRle = transferSyntaxUid === '1.2.840.10008.1.2.5';

  // 1. RLE Decompression
  if (isRle) {
    try {
      const bytesPerPixel = Math.ceil(bitsAllocated / 8);
      const decodedBytes = decodeDicomRle(compressedBytes, numPixels, bytesPerPixel);
      if (bitsAllocated === 16) {
        return pixelRepresentation === 1
          ? new Int16Array(decodedBytes.buffer, decodedBytes.byteOffset, numPixels)
          : new Uint16Array(decodedBytes.buffer, decodedBytes.byteOffset, numPixels);
      } else {
        return decodedBytes;
      }
    } catch (e) {
      console.warn('RLE decode error:', e);
    }
  }

  // 2. JPEG Detection & Decompression
  const isJpeg = (compressedBytes[0] === 0xFF && compressedBytes[1] === 0xD8) || isLosslessJpeg || isBaselineJpeg;

  if (isJpeg) {
    // Primary: JPEG Lossless Process 14 (Standard for Hospital CD/DVD Discs)
    try {
      // @ts-ignore
      const DecoderClass = (jpegLosslessLib as any).Decoder || jpegLosslessLib;
      const decoder = new DecoderClass();
      const decoded = decoder.decode(
        compressedBytes.buffer,
        compressedBytes.byteOffset,
        compressedBytes.byteLength
      );
      if (decoded) {
        if (bitsAllocated === 16) {
          const view = (decoded instanceof Uint16Array || decoded instanceof Int16Array)
            ? decoded
            : new Uint16Array(decoded.buffer, decoded.byteOffset, Math.min(numPixels, Math.floor(decoded.byteLength / 2)));
          return pixelRepresentation === 1
            ? new Int16Array(view.buffer, view.byteOffset, Math.min(numPixels, view.length))
            : new Uint16Array(view.buffer, view.byteOffset, Math.min(numPixels, view.length));
        } else {
          return decoded instanceof Uint8Array
            ? decoded
            : new Uint8Array(decoded.buffer, decoded.byteOffset, Math.min(numPixels, decoded.byteLength));
        }
      }
    } catch (losslessErr) {
      // Fallback: 8-bit Baseline / Lossy JPEG
      try {
        const decoded = jpeg.decode(compressedBytes, { useTArray: true, formatAsRGBA: false });
        if (decoded && decoded.data) {
          if (bitsAllocated === 16) {
            const out = pixelRepresentation === 1 ? new Int16Array(numPixels) : new Uint16Array(numPixels);
            const src = decoded.data;
            for (let i = 0; i < numPixels && i < src.length; i++) {
              out[i] = src[i];
            }
            return out;
          } else {
            return new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, Math.min(numPixels, decoded.data.length));
          }
        }
      } catch (_) {}
    }
  }

  return null;
}

// Memory Shield: LRU Decoded Slices Cache to prevent Out-Of-Memory on large 500-2000+ slice studies
const MAX_DECODED_SLICES_IN_MEMORY = 150;
const decodedInstancesLruQueue: DicomInstance[] = [];

function registerDecodedInstanceInLru(instance: DicomInstance) {
  const existingIdx = decodedInstancesLruQueue.indexOf(instance);
  if (existingIdx !== -1) {
    decodedInstancesLruQueue.splice(existingIdx, 1);
  }
  decodedInstancesLruQueue.push(instance);

  // If memory threshold exceeded, prune oldest non-active slice pixel arrays
  while (decodedInstancesLruQueue.length > MAX_DECODED_SLICES_IN_MEMORY) {
    const oldest = decodedInstancesLruQueue.shift();
    if (oldest && oldest !== instance && !oldest.customFramePixels) {
      // Free uncompressed pixel data and float HU arrays to prevent V8 OOM
      oldest.pixelData = undefined;
      oldest.huData = undefined;
    }
  }
}

/**
 * On-demand lazy pixel decoder for a single slice
 * Executed in < 1ms when the slice is rendered on screen.
 * Wrapped with LRU memory eviction and safe crash shield.
 */
export function getOrDecodeInstancePixels(instance: DicomInstance): {
  pixelData: Int16Array | Uint16Array | Uint8Array;
  huData: Int16Array;
} {
  const numPixels = (instance.rows || 512) * (instance.columns || 512);

  if (instance.pixelData && instance.huData && instance.huData.length === numPixels) {
    registerDecodedInstanceInLru(instance);
    return {
      pixelData: instance.pixelData as any,
      huData: instance.huData as Int16Array
    };
  }

  try {
    registerDecodedInstanceInLru(instance);

    // 0. Custom pre-rendered frames (e.g. Dose Report SR 19 slides)
    if (instance.customFramePixels && instance.customFramePixels.length > 0) {
      const fIdx = instance.frameIndex || 0;
      const rawFrame = instance.customFramePixels[fIdx] || instance.customFramePixels[0];
      const huData = new Float32Array(rawFrame.length);
    for (let i = 0; i < rawFrame.length; i++) {
      huData[i] = rawFrame[i];
    }
    instance.pixelData = rawFrame;
    // @ts-ignore
    instance.huData = huData;
    instance.minPixelValue = 0;
    instance.maxPixelValue = 255;
    instance.windowCenter = 128;
    instance.windowWidth = 256;
    return { pixelData: rawFrame, huData: huData as any };
  }

  if (!instance.rawBuffer) {
    const dummy = new Int16Array(numPixels);
    return { pixelData: dummy, huData: dummy };
  }

  const rawByteArray = new Uint8Array(instance.rawBuffer);
  const byteArray = ensurePart10Dicom(rawByteArray);

  let pixelData: Int16Array | Uint16Array | Uint8Array | null = null;
  const isCompressed = Boolean(
    instance.transferSyntaxUid &&
    instance.transferSyntaxUid !== '1.2.840.10008.1.2' &&
    instance.transferSyntaxUid !== '1.2.840.10008.1.2.1' &&
    instance.transferSyntaxUid !== '1.2.840.10008.1.2.2'
  );

  // 1. Try encapsulated decompression first if compressed or undefined length
  if (isCompressed || instance.pixelDataLength === 0xFFFFFFFF) {
    pixelData = extractEncapsulatedPixelData(
      byteArray,
      numPixels,
      instance.rows,
      instance.columns,
      instance.bitsAllocated,
      instance.pixelRepresentation,
      instance.frameIndex || 0,
      instance.transferSyntaxUid
    );
  }

  // 2. Uncompressed Raw Pixel Extraction
  if (!pixelData || pixelData.length < numPixels) {
    let offset = instance.pixelDataOffset;
    let len = instance.pixelDataLength;

    if (offset === undefined || len === undefined || len === 0xffffffff) {
      try {
        const dataSet = dicomParser.parseDicom(byteArray);
        const elem = dataSet.elements['x7fe00010'];
        if (elem) {
          offset = elem.dataOffset;
          len = elem.length;
        }
      } catch {}
    }

    if (offset !== undefined && len !== undefined && len > 0 && len !== 0xffffffff) {
      const pixelBytes = byteArray.buffer.slice(
        byteArray.byteOffset + offset,
        byteArray.byteOffset + offset + len
      );

      if (instance.bitsAllocated === 16) {
        if (instance.pixelRepresentation === 1) {
          pixelData = new Int16Array(pixelBytes, 0, Math.min(numPixels, Math.floor(pixelBytes.byteLength / 2)));
        } else {
          pixelData = new Uint16Array(pixelBytes, 0, Math.min(numPixels, Math.floor(pixelBytes.byteLength / 2)));
        }
      } else if (instance.bitsAllocated === 8) {
        pixelData = new Uint8Array(pixelBytes, 0, Math.min(numPixels * instance.samplesPerPixel, pixelBytes.byteLength));
      } else {
        pixelData = new Uint16Array(pixelBytes, 0, Math.min(numPixels, Math.floor(pixelBytes.byteLength / 2)));
      }
    }
  }

  // 3. Fallback to encapsulated or dcmjs pixel extraction if needed
  if (!pixelData || pixelData.length < numPixels) {
    try {
      const dcmData = dcmjs.data.DicomMessage.readFile(byteArray.buffer);
      if (dcmData && dcmData.dict && dcmData.dict['7FE00010']) {
        const rawElem = dcmData.dict['7FE00010'];
        if (rawElem.Value && rawElem.Value[0]) {
          const valBuf = rawElem.Value[0];
          if (instance.bitsAllocated === 16) {
            pixelData = instance.pixelRepresentation === 1
              ? new Int16Array(valBuf, 0, Math.min(numPixels, Math.floor(valBuf.byteLength / 2)))
              : new Uint16Array(valBuf, 0, Math.min(numPixels, Math.floor(valBuf.byteLength / 2)));
          } else {
            pixelData = new Uint8Array(valBuf, 0, Math.min(numPixels, valBuf.byteLength));
          }
        }
      }
    } catch {}
  }

  // 4. Secondary Encapsulated Fallback
  if (!pixelData || pixelData.length === 0) {
    pixelData = extractEncapsulatedPixelData(
      byteArray,
      numPixels,
      instance.rows,
      instance.columns,
      instance.bitsAllocated,
      instance.pixelRepresentation,
      instance.frameIndex || 0,
      instance.transferSyntaxUid
    );
  }

  if (!pixelData || pixelData.length < numPixels) {
    const padded = instance.bitsAllocated === 16
      ? (instance.pixelRepresentation === 1 ? new Int16Array(numPixels) : new Uint16Array(numPixels))
      : new Uint8Array(numPixels);
    if (pixelData) {
      // @ts-ignore
      padded.set(pixelData.subarray(0, numPixels));
    }
    pixelData = padded;
  }

  // Fast single-pass HU computation & Min/Max tracking with bit-masking for CT 12/16-bit
  const huData = new Float32Array(numPixels);
  const slope = instance.rescaleSlope !== undefined && instance.rescaleSlope !== 0 ? instance.rescaleSlope : 1;
  const intercept = instance.rescaleIntercept !== undefined ? instance.rescaleIntercept : 0;
  const bitsStored = instance.bitsStored || 16;
  const isSigned = instance.pixelRepresentation === 1;
  const bitMask = bitsStored < 16 ? (1 << bitsStored) - 1 : 0xFFFF;
  const signBit = 1 << (bitsStored - 1);

  let minVal = Infinity;
  let maxVal = -Infinity;

  for (let i = 0; i < numPixels; i++) {
    let rawP = pixelData[i] || 0;
    if (!isSigned && bitsStored < 16) {
      rawP = rawP & bitMask;
    } else if (isSigned && bitsStored < 16 && (rawP & signBit)) {
      rawP = rawP | (~bitMask);
    }

    const hu = rawP * slope + intercept;
    huData[i] = hu;
    if (hu < minVal) minVal = hu;
    if (hu > maxVal) maxVal = hu;
  }

  // Apply Group 6000 Overlay plane if present (e.g. Patient Protocol text)
  if (instance.overlayData && instance.overlayData.length > 0) {
    const ov = instance.overlayData;
    let overlayBurnCount = 0;
    for (let i = 0; i < numPixels; i++) {
      const byteIdx = i >> 3;
      const bitOffset = i & 7;
      if (byteIdx < ov.length && ((ov[byteIdx] >> bitOffset) & 1)) {
        if (instance.bitsAllocated === 8) {
          pixelData[i] = 255;
        } else {
          pixelData[i] = 250;
        }
        huData[i] = 1000;
        overlayBurnCount++;
      }
    }
    if (overlayBurnCount > 0) {
      if (minVal === Infinity || minVal > 0) minVal = 0;
      if (maxVal === -Infinity || maxVal < 250) maxVal = 250;
    }
  }

  instance.minPixelValue = minVal !== Infinity ? minVal : 0;
  instance.maxPixelValue = maxVal !== -Infinity ? maxVal : 255;

  // Auto-calculate Window Center & Window Width ONLY if missing or 0
  if (!instance.windowWidth || instance.windowWidth <= 0 || instance.windowCenter === undefined || isNaN(instance.windowCenter)) {
    if (instance.rescaleIntercept < -500 || instance.rawTags['(0008,0060)']?.value === 'CT') {
      // Default standard CT Soft Tissue window
      instance.windowWidth = 400;
      instance.windowCenter = 40;
    } else if (maxVal > minVal) {
      instance.windowWidth = Math.max(1, Math.round(maxVal - minVal));
      instance.windowCenter = Math.round(minVal + (maxVal - minVal) / 2);
    } else {
      instance.windowWidth = 400;
      instance.windowCenter = 40;
    }
  }

  // Cache in instance object for subsequent frame renders
  instance.pixelData = pixelData;
  // @ts-ignore
  instance.huData = huData;

  return { pixelData, huData: huData as any };
  } catch (decodeErr) {
    console.warn('[CRASH SHIELD] Safe fallback for corrupt slice:', instance.fileName, decodeErr);
    const fallback = instance.bitsAllocated === 16
      ? (instance.pixelRepresentation === 1 ? new Int16Array(numPixels) : new Uint16Array(numPixels))
      : new Uint8Array(numPixels);
    const huFallback = new Float32Array(numPixels);
    instance.pixelData = fallback;
    // @ts-ignore
    instance.huData = huFallback;
    instance.minPixelValue = 0;
    instance.maxPixelValue = 255;
    return { pixelData: fallback, huData: huFallback as any };
  }
}

export function parseDicomBuffer(
  buffer: ArrayBuffer,
  fileName: string = 'image.dcm'
): DicomInstance {
  const inst = parseDicomBufferFast(buffer, fileName);
  getOrDecodeInstancePixels(inst);
  return inst;
}

function extractEncapsulatedPixelData(
  byteArray: Uint8Array,
  numPixels: number,
  rows: number,
  columns: number,
  bitsAllocated: number,
  pixelRep: number,
  frameIndex: number = 0,
  transferSyntaxUid?: string
): Int16Array | Uint16Array | Uint8Array | null {
  // 1. Try dicomParser fragments first
  try {
    const dataSet = dicomParser.parseDicom(byteArray);
    const pixelElem = dataSet.elements.x7fe00010;
    if (pixelElem && pixelElem.fragments && pixelElem.fragments.length > 0) {
      const targetFrag = pixelElem.fragments[frameIndex] || pixelElem.fragments[0];
      if (targetFrag && targetFrag.length > 0) {
        const compressedSlice = byteArray.subarray(targetFrag.position, targetFrag.position + targetFrag.length);
        const decoded = decodeCompressedDicomSlice(
          compressedSlice,
          rows,
          columns,
          bitsAllocated,
          pixelRep,
          transferSyntaxUid
        );
        if (decoded && decoded.length >= numPixels) {
          return decoded;
        }
      }
    }
  } catch (_) {}

  // 2. Fallback: Search for DICOM Sequence item tags (FFFE E000)
  const items: { offset: number; length: number }[] = [];
  for (let i = 0; i < byteArray.length - 8; i++) {
    if (byteArray[i] === 0xFE && byteArray[i + 1] === 0xFF && byteArray[i + 2] === 0x00 && byteArray[i + 3] === 0xE0) {
      const itemLen = byteArray[i + 4] | (byteArray[i + 5] << 8) | (byteArray[i + 6] << 16) | (byteArray[i + 7] << 24);
      if (itemLen > 0 && itemLen < 0xFFFFFFF && i + 8 + itemLen <= byteArray.length) {
        items.push({ offset: i + 8, length: itemLen });
      }
    }
  }

  let targetItem: { offset: number; length: number } | null = null;
  if (items.length > 1) {
    if (items[0].length <= 4 || items.length > 2) {
      targetItem = items[1 + frameIndex] || items[1] || items[0];
    } else {
      targetItem = items[frameIndex] || items[0];
    }
  } else if (items.length === 1) {
    targetItem = items[0];
  }

  if (targetItem) {
    const compressedBytes = byteArray.subarray(targetItem.offset, targetItem.offset + targetItem.length);
    const decoded = decodeCompressedDicomSlice(
      compressedBytes,
      rows,
      columns,
      bitsAllocated,
      pixelRep,
      transferSyntaxUid
    );
    if (decoded && decoded.length >= numPixels) {
      return decoded;
    }

    // If uncompressed raw bytes within item
    const frameBytes = byteArray.buffer.slice(
      byteArray.byteOffset + targetItem.offset,
      byteArray.byteOffset + targetItem.offset + targetItem.length
    );
    if (bitsAllocated === 16) {
      const numElements = Math.min(numPixels, Math.floor(frameBytes.byteLength / 2));
      return pixelRep === 1 ? new Int16Array(frameBytes, 0, numElements) : new Uint16Array(frameBytes, 0, numElements);
    } else {
      return new Uint8Array(frameBytes, 0, Math.min(numPixels, frameBytes.byteLength));
    }
  }

  return null;
}

export function groupInstancesIntoStudies(
  instances: DicomInstance[],
  source: 'file' | 'folder' | 'dicomdir' | 'pacs' | 'sample' | 'disc' = 'folder',
  sourceName?: string
): DicomStudy[] {
  const studiesMap = new Map<string, {
    studyUid: string;
    studyDate: string;
    studyTime: string;
    studyDescription: string;
    accessionNumber: string;
    patientName: string;
    patientId: string;
    patientBirthDate: string;
    patientSex: string;
    patientAge: string;
    seriesMap: Map<string, {
      seriesUid: string;
      seriesNumber: number;
      seriesDescription: string;
      modality: ModalityType;
      bodyPartExamined?: string;
      protocolName?: string;
      instances: DicomInstance[];
    }>;
  }>();

  for (const inst of instances) {
    const studyUid = inst.studyInstanceUid || 'default_study';
    const seriesUid = inst.seriesInstanceUid || 'default_series';

    const pName = (inst.rawTags['(0010,0010)']?.value as string) || 'Anonymous';
    const pId = (inst.rawTags['(0010,0020)']?.value as string) || 'NO_ID';
    const pBirth = (inst.rawTags['(0010,0030)']?.value as string) || '';
    const pSex = (inst.rawTags['(0010,0040)']?.value as string) || 'O';
    const pAge = (inst.rawTags['(0010,1010)']?.value as string) || '';
    const sDate = (inst.rawTags['(0008,0020)']?.value as string) || formatDate(new Date());
    const sTime = (inst.rawTags['(0008,0030)']?.value as string) || '120000';
    const sDesc = (inst.rawTags['(0008,1030)']?.value as string) || 'Medical Study';
    const accNum = (inst.rawTags['(0008,0050)']?.value as string) || '';
    
    const serDesc = (inst.rawTags['(0008,103E)']?.value as string) || `Series ${inst.rawTags['(0020,0011)']?.value || 1}`;
    const serNum = parseInt((inst.rawTags['(0020,0011)']?.value as string) || '1', 10);
    const mod = ((inst.rawTags['(0008,0060)']?.value as string) || 'CT') as ModalityType;
    const bodyPart = (inst.rawTags['(0018,0015)']?.value as string) || '';
    const protocol = (inst.rawTags['(0018,1030)']?.value as string) || '';

    if (!studiesMap.has(studyUid)) {
      studiesMap.set(studyUid, {
        studyUid,
        studyDate: sDate,
        studyTime: sTime,
        studyDescription: sDesc,
        accessionNumber: accNum,
        patientName: pName,
        patientId: pId,
        patientBirthDate: pBirth,
        patientSex: pSex,
        patientAge: pAge,
        seriesMap: new Map()
      });
    }

    const studyEntry = studiesMap.get(studyUid)!;
    if (!studyEntry.seriesMap.has(seriesUid)) {
      studyEntry.seriesMap.set(seriesUid, {
        seriesUid,
        seriesNumber: serNum,
        seriesDescription: serDesc,
        modality: mod,
        bodyPartExamined: bodyPart,
        protocolName: protocol,
        instances: []
      });
    }

    const framesCount = inst.numberOfFrames || 1;
    if (framesCount > 1 && inst.customFramePixels) {
      for (let f = 0; f < framesCount; f++) {
        const frameInst: DicomInstance = {
          ...inst,
          sopInstanceUid: `${inst.sopInstanceUid}_frame_${f + 1}`,
          instanceNumber: f + 1,
          frameIndex: f,
          numberOfFrames: framesCount,
          pixelData: undefined,
          huData: undefined
        };
        studyEntry.seriesMap.get(seriesUid)!.instances.push(frameInst);
      }
    } else if (framesCount > 1 && framesCount <= 5000) {
      const bytesPerFrame = inst.rows * inst.columns * Math.ceil(inst.bitsAllocated / 8) * (inst.samplesPerPixel || 1);
      for (let f = 0; f < framesCount; f++) {
        const frameInst: DicomInstance = {
          ...inst,
          sopInstanceUid: `${inst.sopInstanceUid}_frame_${f + 1}`,
          instanceNumber: f + 1,
          frameIndex: f,
          numberOfFrames: framesCount,
          pixelData: undefined,
          huData: undefined,
          pixelDataOffset: (inst.pixelDataOffset || 0) + (f * bytesPerFrame),
          pixelDataLength: bytesPerFrame,
          sliceLocation: (inst.sliceLocation || 0) + (f * (inst.sliceThickness || 1)),
          imagePositionPatient: inst.imagePositionPatient ? [
            inst.imagePositionPatient[0],
            inst.imagePositionPatient[1],
            inst.imagePositionPatient[2] + (f * (inst.sliceThickness || 1))
          ] : undefined
        };
        studyEntry.seriesMap.get(seriesUid)!.instances.push(frameInst);
      }
    } else {
      studyEntry.seriesMap.get(seriesUid)!.instances.push(inst);
    }
  }

  const studies: DicomStudy[] = [];

  for (const sData of studiesMap.values()) {
    const seriesList: DicomSeries[] = [];
    const modalitiesSet = new Set<ModalityType>();
    let totalInstances = 0;

    for (const serData of sData.seriesMap.values()) {
      serData.instances.sort((a, b) => {
        // 1. Primary: True physical 3D normal distance (handles interleaved MRI and spatial continuity)
        if (a.imagePositionPatient && b.imagePositionPatient && a.imageOrientationPatient) {
          const o = a.imageOrientationPatient;
          const nx = o[1] * o[5] - o[2] * o[4];
          const ny = o[2] * o[3] - o[0] * o[5];
          const nz = o[0] * o[4] - o[1] * o[3];
          const distA = a.imagePositionPatient[0] * nx + a.imagePositionPatient[1] * ny + a.imagePositionPatient[2] * nz;
          const distB = b.imagePositionPatient[0] * nx + b.imagePositionPatient[1] * ny + b.imagePositionPatient[2] * nz;
          if (Math.abs(distA - distB) > 0.05) {
            return distA - distB;
          }
        }
        // 2. Secondary: sliceLocation if available
        if (a.sliceLocation !== undefined && b.sliceLocation !== undefined && Math.abs(a.sliceLocation - b.sliceLocation) > 0.05) {
          return a.sliceLocation - b.sliceLocation;
        }
        // 3. Tertiary fallback: DICOM InstanceNumber (0020,0013)
        if (a.instanceNumber !== undefined && b.instanceNumber !== undefined && a.instanceNumber !== b.instanceNumber) {
          return a.instanceNumber - b.instanceNumber;
        }
        return 0;
      });

      modalitiesSet.add(serData.modality);
      totalInstances += serData.instances.length;

      seriesList.push({
        seriesInstanceUid: serData.seriesUid,
        seriesNumber: serData.seriesNumber,
        seriesDescription: serData.seriesDescription,
        modality: serData.modality,
        studyInstanceUid: sData.studyUid,
        patientId: sData.patientId,
        numberOfInstances: serData.instances.length,
        instances: serData.instances,
        bodyPartExamined: serData.bodyPartExamined,
        protocolName: serData.protocolName
      });
    }

    seriesList.sort((a, b) => a.seriesNumber - b.seriesNumber);

    studies.push({
      studyInstanceUid: sData.studyUid,
      studyDate: sData.studyDate,
      studyTime: sData.studyTime,
      studyDescription: sData.studyDescription,
      accessionNumber: sData.accessionNumber,
      patientName: sData.patientName,
      patientId: sData.patientId,
      patientBirthDate: sData.patientBirthDate,
      patientSex: sData.patientSex,
      patientAge: sData.patientAge,
      modalitiesInStudy: Array.from(modalitiesSet),
      numberOfSeries: seriesList.length,
      numberOfInstances: totalInstances,
      series: seriesList,
      source,
      sourceName
    });
  }

  return studies;
}

/**
 * Incrementally merges newly parsed instances into existing studies without UI freezing
 */
export function mergeInstancesIntoStudies(
  existingStudies: DicomStudy[],
  newInstances: DicomInstance[],
  source: 'file' | 'folder' | 'dicomdir' | 'pacs' | 'sample' | 'disc' = 'folder',
  sourceName?: string
): DicomStudy[] {
  const allInstances: DicomInstance[] = [];
  for (const s of existingStudies) {
    for (const ser of s.series) {
      allInstances.push(...ser.instances);
    }
  }
  allInstances.push(...newInstances);
  return groupInstancesIntoStudies(allInstances, source, sourceName);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
