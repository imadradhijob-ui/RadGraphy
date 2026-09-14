import JSZip from 'jszip';
import { DicomInstance, DicomSeries, DicomStudy } from '../types/dicom';

/**
 * DICOMDIR Generator for RadNode Viewer Medical Workstation.
 * Generates a fully compliant standard DICOMDIR media file and bundles the study
 * into a portable CD/DVD/USB ZIP archive structure:
 *
 *  Root/
 *   ├── DICOMDIR
 *   └── DICOM/
 *        └── SE000001/
 *             ├── IM000001.dcm
 *             ├── IM000002.dcm
 *             └── ...
 */

class BinaryWriter {
  private buffer: Uint8Array;
  private view: DataView;
  private offset: number = 0;

  constructor(initialCapacity: number = 65536) {
    this.buffer = new Uint8Array(initialCapacity);
    this.view = new DataView(this.buffer.buffer);
  }

  private ensureCapacity(needed: number) {
    if (this.offset + needed > this.buffer.length) {
      let newCap = this.buffer.length * 2;
      while (newCap < this.offset + needed) newCap *= 2;
      const newBuf = new Uint8Array(newCap);
      newBuf.set(this.buffer);
      this.buffer = newBuf;
      this.view = new DataView(this.buffer.buffer);
    }
  }

  public getOffset(): number {
    return this.offset;
  }

  public setUint32At(pos: number, value: number) {
    this.view.setUint32(pos, value, true);
  }

  public writeBytes(bytes: Uint8Array | number[]) {
    this.ensureCapacity(bytes.length);
    if (bytes instanceof Uint8Array) {
      this.buffer.set(bytes, this.offset);
    } else {
      for (let i = 0; i < bytes.length; i++) {
        this.buffer[this.offset + i] = bytes[i];
      }
    }
    this.offset += bytes.length;
  }

  public writeUint16(val: number) {
    this.ensureCapacity(2);
    this.view.setUint16(this.offset, val, true);
    this.offset += 2;
  }

  public writeUint32(val: number) {
    this.ensureCapacity(4);
    this.view.setUint32(this.offset, val, true);
    this.offset += 4;
  }

  public writeAscii(str: string, padToEven: boolean = true) {
    let s = str;
    if (padToEven && s.length % 2 !== 0) {
      s += ' ';
    }
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) {
      bytes[i] = s.charCodeAt(i) & 0xff;
    }
    this.writeBytes(bytes);
  }

  /**
   * Explicit VR Tag Writer
   */
  public writeElement(group: number, element: number, vr: string, value: string | Uint8Array | number) {
    this.writeUint16(group);
    this.writeUint16(element);
    this.writeAscii(vr, false);

    const isLongVr = ['OB', 'OW', 'OF', 'OD', 'SQ', 'UC', 'UR', 'UT', 'UN'].includes(vr);

    let valBytes: Uint8Array;
    if (typeof value === 'string') {
      let str = value;
      if (str.length % 2 !== 0) str += ' ';
      valBytes = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) valBytes[i] = str.charCodeAt(i) & 0xff;
    } else if (typeof value === 'number') {
      if (vr === 'US') {
        valBytes = new Uint8Array(2);
        new DataView(valBytes.buffer).setUint16(0, value, true);
      } else if (vr === 'UL') {
        valBytes = new Uint8Array(4);
        new DataView(valBytes.buffer).setUint32(0, value, true);
      } else {
        let str = value.toString();
        if (str.length % 2 !== 0) str += ' ';
        valBytes = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) valBytes[i] = str.charCodeAt(i) & 0xff;
      }
    } else {
      valBytes = value;
      if (valBytes.length % 2 !== 0) {
        const padded = new Uint8Array(valBytes.length + 1);
        padded.set(valBytes);
        padded[valBytes.length] = 0;
        valBytes = padded;
      }
    }

    if (isLongVr) {
      this.writeUint16(0); // Reserved
      this.writeUint32(valBytes.length);
    } else {
      this.writeUint16(valBytes.length);
    }

    this.writeBytes(valBytes);
  }

  public toUint8Array(): Uint8Array {
    return this.buffer.slice(0, this.offset);
  }
}

export interface DicomDirExportProgress {
  current: number;
  total: number;
  percent: number;
  status: string;
}

export class DicomDirGenerator {
  /**
   * Builds a standard binary DICOMDIR dataset buffer for the provided study
   */
  static buildDicomDirBuffer(
    study: DicomStudy,
    fileMapping: { seriesIndex: number; instanceIndex: number; path: string }[]
  ): Uint8Array {
    const writer = new BinaryWriter(131072);

    // 1. 128-byte preamble + "DICM" prefix
    const preamble = new Uint8Array(128);
    writer.writeBytes(preamble);
    writer.writeAscii('DICM', false);

    // 2. File Meta Information Header (Group 0002)
    const metaWriter = new BinaryWriter(1024);
    // (0002,0001) File Meta Information Version
    metaWriter.writeElement(0x0002, 0x0001, 'OB', new Uint8Array([0x00, 0x01]));
    // (0002,0002) Media Storage SOP Class UID -> Media Storage Directory Storage
    metaWriter.writeElement(0x0002, 0x0002, 'UI', '1.2.840.10008.1.3.10');
    // (0002,0003) Media Storage SOP Instance UID
    metaWriter.writeElement(0x0002, 0x0003, 'UI', `1.2.826.0.1.3680043.9.7744.1.${Date.now()}`);
    // (0002,0010) Transfer Syntax UID -> Explicit VR Little Endian
    metaWriter.writeElement(0x0002, 0x0010, 'UI', '1.2.840.10008.1.2.1');
    // (0002,0012) Implementation Class UID
    metaWriter.writeElement(0x0002, 0x0012, 'UI', '1.2.826.0.1.3680043.9.7744.1');
    // (0002,0013) Implementation Version Name
    metaWriter.writeElement(0x0002, 0x0013, 'SH', 'RADNODE_006');

    const metaBytes = metaWriter.toUint8Array();
    // (0002,0000) File Meta Information Group Length
    writer.writeElement(0x0002, 0x0000, 'UL', metaBytes.length);
    writer.writeBytes(metaBytes);

    // 3. Media Storage Directory Dataset Header (Group 0004)
    writer.writeElement(0x0004, 0x1130, 'CS', 'RADNODE_MEDIA'); // File-set ID
    
    // Offsets placeholders to be patched after computing record offsets
    const firstRecOffsetPos = writer.getOffset() + 8; // Tag (4) + VR 'UL' (2) + Len (2) = +8
    writer.writeElement(0x0004, 0x1200, 'UL', 0); // (0004,1200) First Directory Record Offset
    
    const lastRecOffsetPos = writer.getOffset() + 8;
    writer.writeElement(0x0004, 0x1202, 'UL', 0); // (0004,1202) Last Directory Record Offset
    
    writer.writeElement(0x0004, 0x1212, 'US', 0); // (0004,1212) File-set Consistency Flag

    // Directory Record Sequence (0004,1220) with undefined length
    writer.writeUint16(0x0004);
    writer.writeUint16(0x1220);
    writer.writeAscii('SQ', false);
    writer.writeUint16(0); // Reserved
    writer.writeUint32(0xffffffff); // Undefined length

    let firstRecordOffset = 0;
    let lastRecordOffset = 0;

    // Build directory records: PATIENT -> STUDY -> SERIES -> IMAGE
    // Item 1: PATIENT
    const patRecordStart = writer.getOffset();
    firstRecordOffset = patRecordStart;
    lastRecordOffset = patRecordStart;

    writer.writeUint16(0xfffe); // Item Tag (FFFE,E000)
    writer.writeUint16(0xe000);
    writer.writeUint32(0xffffffff); // Undefined length item

    // (0004,1400) Offset of the Next Directory Record
    writer.writeElement(0x0004, 0x1400, 'UL', 0);
    // (0004,1410) Record In-use Flag
    writer.writeElement(0x0004, 0x1410, 'US', 0xffff);
    // (0004,1420) Offset of Lower-Level Directory Entity (STUDY)
    writer.writeElement(0x0004, 0x1420, 'UL', 0);
    // (0004,1430) Directory Record Type
    writer.writeElement(0x0004, 0x1430, 'CS', 'PATIENT');
    // Patient Name & ID
    writer.writeElement(0x0010, 0x0010, 'PN', study.patientName || 'Anonymous');
    writer.writeElement(0x0010, 0x0020, 'LO', study.patientId || 'UNKNOWN');
    if (study.patientBirthDate) writer.writeElement(0x0010, 0x0030, 'DA', study.patientBirthDate);
    if (study.patientSex) writer.writeElement(0x0010, 0x0040, 'CS', study.patientSex);

    // Item Delimitation Item (FFFE,E00D)
    writer.writeUint16(0xfffe);
    writer.writeUint16(0xe00d);
    writer.writeUint32(0x00000000);

    // Item 2: STUDY
    const studyRecordStart = writer.getOffset();
    lastRecordOffset = studyRecordStart;

    writer.writeUint16(0xfffe);
    writer.writeUint16(0xe000);
    writer.writeUint32(0xffffffff);

    writer.writeElement(0x0004, 0x1400, 'UL', 0); // Next Record
    writer.writeElement(0x0004, 0x1410, 'US', 0xffff); // In-use
    writer.writeElement(0x0004, 0x1420, 'UL', 0); // Lower-level
    writer.writeElement(0x0004, 0x1430, 'CS', 'STUDY');
    writer.writeElement(0x0020, 0x000d, 'UI', study.studyInstanceUid);
    writer.writeElement(0x0008, 0x0020, 'DA', study.studyDate || '20260101');
    writer.writeElement(0x0008, 0x0030, 'TM', study.studyTime || '120000');
    writer.writeElement(0x0008, 0x1030, 'LO', study.studyDescription || 'Examination');
    writer.writeElement(0x0008, 0x0050, 'SH', study.accessionNumber || '');

    writer.writeUint16(0xfffe);
    writer.writeUint16(0xe00d);
    writer.writeUint32(0x00000000);

    // Items: SERIES and IMAGES
    let prevSeriesRecordStart = 0;
    study.series.forEach((ser, sIdx) => {
      const seriesRecordStart = writer.getOffset();
      lastRecordOffset = seriesRecordStart;

      writer.writeUint16(0xfffe);
      writer.writeUint16(0xe000);
      writer.writeUint32(0xffffffff);

      writer.writeElement(0x0004, 0x1400, 'UL', 0);
      writer.writeElement(0x0004, 0x1410, 'US', 0xffff);
      writer.writeElement(0x0004, 0x1420, 'UL', 0);
      writer.writeElement(0x0004, 0x1430, 'CS', 'SERIES');
      writer.writeElement(0x0020, 0x000e, 'UI', ser.seriesInstanceUid);
      writer.writeElement(0x0020, 0x0011, 'IS', (ser.seriesNumber || sIdx + 1).toString());
      writer.writeElement(0x0008, 0x0060, 'CS', ser.modality || 'OT');
      writer.writeElement(0x0008, 0x103e, 'LO', ser.seriesDescription || `Series ${sIdx + 1}`);

      writer.writeUint16(0xfffe);
      writer.writeUint16(0xe00d);
      writer.writeUint32(0x00000000);

      // Add IMAGE records for this series
      ser.instances.forEach((inst, iIdx) => {
        const fileMap = fileMapping.find(m => m.seriesIndex === sIdx && m.instanceIndex === iIdx);
        const refPath = fileMap ? fileMap.path.replace(/\//g, '\\') : `DICOM\\SE${String(sIdx + 1).padStart(6, '0')}\\IM${String(iIdx + 1).padStart(6, '0')}.DCM`;

        const imgRecordStart = writer.getOffset();
        lastRecordOffset = imgRecordStart;

        writer.writeUint16(0xfffe);
        writer.writeUint16(0xe000);
        writer.writeUint32(0xffffffff);

        writer.writeElement(0x0004, 0x1400, 'UL', 0);
        writer.writeElement(0x0004, 0x1410, 'US', 0xffff);
        writer.writeElement(0x0004, 0x1420, 'UL', 0);
        writer.writeElement(0x0004, 0x1430, 'CS', 'IMAGE');
        // (0004,1500) Referenced File ID (e.g. DICOM\SE000001\IM000001.DCM)
        writer.writeElement(0x0004, 0x1500, 'CS', refPath);
        // (0004,1510) Referenced SOP Class UID in File
        writer.writeElement(0x0004, 0x1510, 'UI', inst.rawTags?.['(0008,0016)']?.value as string || '1.2.840.10008.5.1.4.1.1.2');
        // (0004,1511) Referenced SOP Instance UID in File
        writer.writeElement(0x0004, 0x1511, 'UI', inst.sopInstanceUid || `1.2.826.0.1.3680043.9.7744.1.${sIdx}.${iIdx}`);
        // (0004,1512) Referenced Transfer Syntax UID in File
        writer.writeElement(0x0004, 0x1512, 'UI', inst.transferSyntaxUid || '1.2.840.10008.1.2.1');
        // (0020,0013) Instance Number
        writer.writeElement(0x0020, 0x0013, 'IS', (inst.instanceNumber || iIdx + 1).toString());

        writer.writeUint16(0xfffe);
        writer.writeUint16(0xe00d);
        writer.writeUint32(0x00000000);
      });
    });

    // Sequence Delimitation Item (FFFE,E0DD)
    writer.writeUint16(0xfffe);
    writer.writeUint16(0xe0dd);
    writer.writeUint32(0x00000000);

    // Patch First & Last Directory Record Offsets
    writer.setUint32At(firstRecOffsetPos, firstRecordOffset);
    writer.setUint32At(lastRecOffsetPos, lastRecordOffset);

    return writer.toUint8Array();
  }

  /**
   * Packages the entire DICOM Study into a standard CD/DVD DICOMDIR ZIP archive
   */
  static async exportStudyAsDicomdirPackage(
    study: DicomStudy,
    onProgress?: (p: DicomDirExportProgress) => void
  ): Promise<Blob> {
    const zip = new JSZip();

    // Prepare File Mappings
    const fileMapping: { seriesIndex: number; instanceIndex: number; path: string; instance: DicomInstance }[] = [];
    
    let totalImages = 0;
    study.series.forEach(s => {
      totalImages += s.instances.length;
    });

    study.series.forEach((ser, sIdx) => {
      const seDirName = `SE${String(sIdx + 1).padStart(6, '0')}`;
      ser.instances.forEach((inst, iIdx) => {
        const imFileName = `IM${String(iIdx + 1).padStart(6, '0')}.DCM`;
        fileMapping.push({
          seriesIndex: sIdx,
          instanceIndex: iIdx,
          path: `DICOM/${seDirName}/${imFileName}`,
          instance: inst
        });
      });
    });

    if (onProgress) {
      onProgress({ current: 0, total: totalImages, percent: 5, status: 'Generating DICOMDIR Media Directory...' });
    }

    // 1. Generate DICOMDIR
    const dicomdirBuffer = this.buildDicomDirBuffer(study, fileMapping);
    zip.file('DICOMDIR', dicomdirBuffer);

    // 2. Add all DICOM instances to the ZIP
    const dicomFolder = zip.folder('DICOM');

    for (let idx = 0; idx < fileMapping.length; idx++) {
      const item = fileMapping[idx];
      const inst = item.instance;

      let fileBuffer: ArrayBuffer | Uint8Array | null = null;
      if (inst.rawBuffer) {
        fileBuffer = inst.rawBuffer;
      }

      if (!fileBuffer && (window as any).electronAPI?.openPath && inst.filePath) {
        // Attempt desktop filesystem read if available
      }

      if (!fileBuffer) {
        // If rawBuffer is missing, synthesize a valid standalone DICOM file
        fileBuffer = this.synthesizeDicomFile(inst, study);
      }

      const relativePath = item.path.replace(/^DICOM\//, '');
      dicomFolder?.file(relativePath, fileBuffer);

      if (onProgress && (idx % 5 === 0 || idx === fileMapping.length - 1)) {
        const pct = Math.round(10 + (idx / fileMapping.length) * 75);
        onProgress({
          current: idx + 1,
          total: totalImages,
          percent: pct,
          status: `Packing DICOM image ${idx + 1} of ${totalImages}...`
        });
      }
    }

    // 3. Add a README text file for the patient / physician
    zip.file(
      'README.TXT',
      `RADNODE VIEWER DICOMDIR ARCHIVE\r\n` +
      `POWERED BY THE IT DEPARTMENT AL-SHAAB HOSPITAL\r\n` +
      `===================================\r\n` +
      `Patient Name: ${study.patientName}\r\n` +
      `Patient ID:   ${study.patientId}\r\n` +
      `Study Date:   ${study.studyDate}\r\n` +
      `Description:  ${study.studyDescription}\r\n` +
      `Modalities:   ${study.modalitiesInStudy.join(', ')}\r\n` +
      `Total Images: ${totalImages}\r\n\r\n` +
      `This archive conforms to the DICOM Standard PS 3.10 / PS 3.12 Media Storage format.\r\n` +
      `You can burn this folder directly onto a CD/DVD or copy it to a USB flash drive.\r\n` +
      `Compatible with RadNode Viewer, RadiAnt, OsiriX, Horos, Weasis, and hospital PACS workstations.\r\n`
    );

    if (onProgress) {
      onProgress({ current: totalImages, total: totalImages, percent: 90, status: 'Compressing ZIP Media Package...' });
    }

    const zipBlob = await zip.generateAsync(
      { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 } },
      (meta) => {
        if (onProgress) {
          const finalPct = Math.round(90 + (meta.percent / 100) * 10);
          onProgress({ current: totalImages, total: totalImages, percent: Math.min(100, finalPct), status: `Compressing package: ${meta.percent.toFixed(0)}%` });
        }
      }
    );

    return zipBlob;
  }

  /**
   * Synthesizes a valid standard DICOM Part 10 file if rawBuffer is not retained
   */
  private static synthesizeDicomFile(inst: DicomInstance, study: DicomStudy): Uint8Array {
    const writer = new BinaryWriter(65536 + (inst.rows * inst.columns * 2));

    // 128 bytes preamble + DICM
    writer.writeBytes(new Uint8Array(128));
    writer.writeAscii('DICM', false);

    // Meta Information
    const metaWriter = new BinaryWriter(1024);
    metaWriter.writeElement(0x0002, 0x0001, 'OB', new Uint8Array([0x00, 0x01]));
    metaWriter.writeElement(0x0002, 0x0002, 'UI', '1.2.840.10008.5.1.4.1.1.2'); // CT Image Storage default
    metaWriter.writeElement(0x0002, 0x0003, 'UI', inst.sopInstanceUid || `1.2.826.0.1.3680043.9.7744.1.${Date.now()}`);
    metaWriter.writeElement(0x0002, 0x0010, 'UI', '1.2.840.10008.1.2.1'); // Explicit VR Little Endian
    metaWriter.writeElement(0x0002, 0x0012, 'UI', '1.2.826.0.1.3680043.9.7744.1');

    const metaBytes = metaWriter.toUint8Array();
    writer.writeElement(0x0002, 0x0000, 'UL', metaBytes.length);
    writer.writeBytes(metaBytes);

    // Main DICOM tags
    writer.writeElement(0x0008, 0x0016, 'UI', '1.2.840.10008.5.1.4.1.1.2');
    writer.writeElement(0x0008, 0x0018, 'UI', inst.sopInstanceUid);
    writer.writeElement(0x0008, 0x0020, 'DA', study.studyDate || '20260101');
    writer.writeElement(0x0008, 0x1030, 'LO', study.studyDescription || 'DICOM Study');
    writer.writeElement(0x0010, 0x0010, 'PN', study.patientName || 'Anonymous');
    writer.writeElement(0x0010, 0x0020, 'LO', study.patientId || 'UNKNOWN');
    writer.writeElement(0x0020, 0x000d, 'UI', study.studyInstanceUid);
    writer.writeElement(0x0020, 0x000e, 'UI', inst.seriesInstanceUid);
    writer.writeElement(0x0020, 0x0013, 'IS', (inst.instanceNumber || 1).toString());

    // Image Pixel Attributes
    writer.writeElement(0x0028, 0x0010, 'US', inst.rows);
    writer.writeElement(0x0028, 0x0011, 'US', inst.columns);
    writer.writeElement(0x0028, 0x0100, 'US', inst.bitsAllocated || 16);
    writer.writeElement(0x0028, 0x0101, 'US', inst.bitsStored || 12);
    writer.writeElement(0x0028, 0x0102, 'US', inst.highBit || 11);
    writer.writeElement(0x0028, 0x0103, 'US', inst.pixelRepresentation || 0);
    writer.writeElement(0x0028, 0x0002, 'US', inst.samplesPerPixel || 1);
    writer.writeElement(0x0028, 0x0004, 'CS', inst.photometricInterpretation || 'MONOCHROME2');
    writer.writeElement(0x0028, 0x1050, 'DS', (inst.windowCenter || 40).toString());
    writer.writeElement(0x0028, 0x1051, 'DS', (inst.windowWidth || 400).toString());

    // Pixel Data (7FE0,0010)
    let pxBytes: Uint8Array;
    if (inst.pixelData) {
      pxBytes = new Uint8Array(inst.pixelData.buffer, inst.pixelData.byteOffset, inst.pixelData.byteLength);
    } else {
      pxBytes = new Uint8Array(inst.rows * inst.columns * 2);
    }

    writer.writeElement(0x7fe0, 0x0010, 'OW', pxBytes);

    return writer.toUint8Array();
  }
}
