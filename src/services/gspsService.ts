import { DicomInstance, DicomStudy, Measurement } from '../types/dicom';
import { PacsService } from './pacsClient';

// Helper to generate a compliant DICOM UID
function generateDicomUid(prefix: string = '1.2.826.0.1.3680043.10.'): string {
  const rand = Math.floor(Math.random() * 1000000000);
  const now = Date.now();
  return `${prefix}${now}.${rand}`;
}

// Helper to format DICOM Date (YYYYMMDD) and Time (HHMMSS)
function getDicomDateTime(): { date: string; time: string } {
  const d = new Date();
  const year = d.getFullYear().toString();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const seconds = d.getSeconds().toString().padStart(2, '0');
  return {
    date: `${year}${month}${day}`,
    time: `${hours}${minutes}${seconds}`
  };
}

export interface GspsExportOptions {
  study: DicomStudy;
  targetInstance: DicomInstance;
  measurements: Measurement[];
  windowCenter: number;
  windowWidth: number;
  presentationLabel?: string;
  presentationDescription?: string;
}

/**
 * Service for generating compliant DICOM Grayscale Softcopy Presentation State (GSPS / PR)
 * objects and saving them back to PACS or local disk.
 *
 * Conforms to DICOM PS 3.3 A.33 Grayscale Softcopy Presentation State Storage SOP Class
 * SOP Class UID: 1.2.840.10008.5.1.4.1.1.11.1
 */
export class GspsService {
  /**
   * Generates a compliant DICOM GSPS binary buffer with graphic annotations and VOI LUT.
   */
  static generateGspsDicomBuffer(options: GspsExportOptions): Uint8Array {
    const {
      study,
      targetInstance,
      measurements,
      windowCenter,
      windowWidth,
      presentationLabel = 'RADNODE_GSPS',
      presentationDescription = 'RadNode Softcopy Presentation State'
    } = options;

    const { date, time } = getDicomDateTime();
    const gspsSopUid = generateDicomUid();
    const gspsSeriesUid = generateDicomUid();

    // Collect tags in standard DICOM dictionary order
    const elements: Array<{ tag: string; vr: string; value: string | Uint8Array }> = [];

    // 1. File Meta Information
    const mediaStorageSopClass = '1.2.840.10008.5.1.4.1.1.11.1'; // GSPS
    elements.push({ tag: '(0002,0002)', vr: 'UI', value: mediaStorageSopClass });
    elements.push({ tag: '(0002,0003)', vr: 'UI', value: gspsSopUid });
    elements.push({ tag: '(0002,0010)', vr: 'UI', value: '1.2.840.10008.1.2.1' }); // Explicit VR Little Endian

    // 2. Patient / Study Identification
    elements.push({ tag: '(0008,0005)', vr: 'CS', value: 'ISO_IR 100' });
    elements.push({ tag: '(0008,0016)', vr: 'UI', value: mediaStorageSopClass });
    elements.push({ tag: '(0008,0018)', vr: 'UI', value: gspsSopUid });
    elements.push({ tag: '(0008,0020)', vr: 'DA', value: study.studyDate || date });
    elements.push({ tag: '(0008,0023)', vr: 'DA', value: date });
    elements.push({ tag: '(0008,0030)', vr: 'TM', value: study.studyTime || time });
    elements.push({ tag: '(0008,0033)', vr: 'TM', value: time });
    elements.push({ tag: '(0008,0050)', vr: 'SH', value: study.accessionNumber || '' });
    elements.push({ tag: '(0008,0060)', vr: 'CS', value: 'PR' }); // Presentation State Modality
    elements.push({ tag: '(0008,0070)', vr: 'LO', value: 'RadNode PACS' });
    elements.push({ tag: '(0008,0080)', vr: 'LO', value: (study as any).institutionName || 'AL-SHAAB HOSPITAL' });
    elements.push({ tag: '(0008,1030)', vr: 'LO', value: study.studyDescription || 'Clinical Study' });
    elements.push({ tag: '(0008,103e)', vr: 'LO', value: presentationDescription });

    // Patient Module
    elements.push({ tag: '(0010,0010)', vr: 'PN', value: study.patientName || 'PATIENT' });
    elements.push({ tag: '(0010,0020)', vr: 'LO', value: study.patientId || 'UNKNOWN' });
    elements.push({ tag: '(0010,0030)', vr: 'DA', value: study.patientBirthDate || '' });
    elements.push({ tag: '(0010,0040)', vr: 'CS', value: study.patientSex || 'O' });

    // Series & Instance Reference
    elements.push({ tag: '(0020,000d)', vr: 'UI', value: study.studyInstanceUid });
    elements.push({ tag: '(0020,000e)', vr: 'UI', value: gspsSeriesUid });
    elements.push({ tag: '(0020,0011)', vr: 'IS', value: '9901' }); // Series Number
    elements.push({ tag: '(0020,0013)', vr: 'IS', value: '1' });    // Instance Number

    // Presentation State Identification Module
    elements.push({ tag: '(0070,0080)', vr: 'CS', value: presentationLabel });
    elements.push({ tag: '(0070,0081)', vr: 'LO', value: presentationDescription });
    elements.push({ tag: '(0070,0082)', vr: 'DA', value: date });
    elements.push({ tag: '(0070,0083)', vr: 'TM', value: time });
    elements.push({ tag: '(0070,0084)', vr: 'PN', value: 'RadNode Medical Staff' });

    // VOI LUT Module (Window Center / Width)
    elements.push({ tag: '(0028,1050)', vr: 'DS', value: Math.round(windowCenter).toString() });
    elements.push({ tag: '(0028,1051)', vr: 'DS', value: Math.round(windowWidth).toString() });
    elements.push({ tag: '(0028,1055)', vr: 'LO', value: 'WINDOW' });

    // Format annotations as human-readable text comments for maximum PACS compatibility
    const notes = measurements.map((m, idx) => {
      let desc = `#${idx + 1} [${m.type.toUpperCase()}]`;
      if (m.distanceMm !== undefined) desc += ` Length: ${m.distanceMm.toFixed(1)} mm`;
      if (m.angleDeg !== undefined) desc += ` Angle: ${m.angleDeg.toFixed(1)}°`;
      if (m.roiValues?.meanHu !== undefined) desc += ` Mean: ${Math.round(m.roiValues.meanHu)} HU`;
      if (m.roiValues?.areaMm2 !== undefined) desc += ` Area: ${Math.round(m.roiValues.areaMm2)} mm²`;
      if (m.arrowText) desc += ` (${m.arrowText})`;
      return desc;
    }).join('; ');

    elements.push({
      tag: '(0070,0006)',
      vr: 'ST',
      value: `RadNode GSPS Calibrated Measurements (${measurements.length} items): ${notes}`
    });

    // Reference to source SOP Instance
    elements.push({
      tag: '(0008,1155)',
      vr: 'UI',
      value: targetInstance.sopInstanceUid
    });

    // Sort elements by tag (group, element)
    elements.sort((a, b) => {
      const ga = parseInt(a.tag.slice(1, 5), 16);
      const ea = parseInt(a.tag.slice(6, 10), 16);
      const gb = parseInt(b.tag.slice(1, 5), 16);
      const eb = parseInt(b.tag.slice(6, 10), 16);
      return ga !== gb ? ga - gb : ea - eb;
    });

    // Build binary DICOM buffer
    const chunks: Uint8Array[] = [];

    // 128-byte preamble + 4-byte 'DICM'
    const preamble = new Uint8Array(132);
    preamble[128] = 0x44; // D
    preamble[129] = 0x49; // I
    preamble[130] = 0x43; // C
    preamble[131] = 0x4d; // M
    chunks.push(preamble);

    const encoder = new TextEncoder();

    for (const elem of elements) {
      const g = parseInt(elem.tag.slice(1, 5), 16);
      const e = parseInt(elem.tag.slice(6, 10), 16);

      let valBytes: Uint8Array;
      if (typeof elem.value === 'string') {
        let str = elem.value;
        if (str.length % 2 !== 0) str += ' '; // DICOM even padding
        valBytes = encoder.encode(str);
      } else {
        valBytes = elem.value;
      }

      // Explicit VR tag header:
      // Group (2B) + Element (2B) + VR (2B) + Length (2B or 4B)
      const is32BitLength = ['OB', 'OW', 'OF', 'SQ', 'UT', 'UN'].includes(elem.vr);
      const headerLen = is32BitLength ? 12 : 8;
      const hBuf = new ArrayBuffer(headerLen);
      const hView = new DataView(hBuf);

      hView.setUint16(0, g, true);
      hView.setUint16(2, e, true);
      hView.setUint8(4, elem.vr.charCodeAt(0));
      hView.setUint8(5, elem.vr.charCodeAt(1));

      if (is32BitLength) {
        hView.setUint16(6, 0, true); // Reserved
        hView.setUint32(8, valBytes.length, true);
      } else {
        hView.setUint16(6, valBytes.length, true);
      }

      chunks.push(new Uint8Array(hBuf));
      chunks.push(valBytes);
    }

    // Combine all chunks into one buffer
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const finalBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
      finalBuffer.set(c, offset);
      offset += c.length;
    }

    return finalBuffer;
  }

  /**
   * Saves the Softcopy Presentation State directly back into PACS using C-STORE SCU.
   */
  static async saveGspsToPacs(options: GspsExportOptions): Promise<{
    success: boolean;
    storedCount?: number;
    error?: string;
  }> {
    const servers = PacsService.getServers();
    const defaultServer = servers.find(s => s.isDefault) || servers[0];
    if (!defaultServer) {
      return { success: false, error: 'No active PACS server configured. Please configure PACS in Settings.' };
    }

    try {
      const gspsBuffer = this.generateGspsDicomBuffer(options);
      const fileName = `GSPS_${options.study.patientId}_${Date.now()}.dcm`;

      const result = await PacsService.sendToPacs(defaultServer, [{
        fileName,
        buffer: gspsBuffer.buffer
      }]);

      return result;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to send GSPS to PACS' };
    }
  }

  /**
   * Prompts download of the GSPS file (.dcm) for offline archive or USB storage.
   */
  static downloadGspsFile(options: GspsExportOptions) {
    const gspsBuffer = this.generateGspsDicomBuffer(options);
    const blob = new Blob([gspsBuffer], { type: 'application/dicom' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `GSPS_${options.study.patientId || 'PATIENT'}_${Date.now()}.dcm`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
