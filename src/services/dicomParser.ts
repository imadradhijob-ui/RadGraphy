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

function findPixelDataOffsetAndLength(byteArray: Uint8Array): { offset: number; length: number } {
  for (let i = 0; i < byteArray.length - 8; i++) {
    if (byteArray[i] === 0xE0 && byteArray[i + 1] === 0x7F && byteArray[i + 2] === 0x10 && byteArray[i + 3] === 0x00) {
      const b4 = byteArray[i + 4];
      const b5 = byteArray[i + 5];
      if ((b4 === 0x4F && (b5 === 0x42 || b5 === 0x57)) || (b4 === 0x55 && b5 === 0x4E)) {
        const len = (byteArray[i + 8] | (byteArray[i + 9] << 8) | (byteArray[i + 10] << 16) | (byteArray[i + 11] << 24)) >>> 0;
        return { offset: i + 12, length: len };
      } else {
        const len = (byteArray[i + 4] | (byteArray[i + 5] << 8) | (byteArray[i + 6] << 16) | (byteArray[i + 7] << 24)) >>> 0;
        return { offset: i + 8, length: len };
      }
    }
  }
  return { offset: 128, length: byteArray.length - 128 };
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
    if (dcmjsDict && dcmjsKey && dcmjsDict[dcmjsKey]?.Value?.[0]) {
      const v = dcmjsDict[dcmjsKey].Value[0];
      return typeof v === 'object' && v.Alphabetic ? v.Alphabetic : String(v);
    }
    return def;
  };

  const getNumber = (tagHex: string, dcmjsKey?: string, def = 0): number => {
    if (dataSet) {
      try {
        const val = dataSet.string(tagHex);
        if (val !== undefined && val !== null && val !== '') {
          const parsed = parseFloat(val);
          if (!isNaN(parsed)) return parsed;
        }
        const uVal = dataSet.uint16(tagHex);
        if (uVal !== undefined && !isNaN(uVal)) return uVal;
        const iVal = dataSet.int16(tagHex);
        if (iVal !== undefined && !isNaN(iVal)) return iVal;
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

  const { offset: pixelDataOffset, length: rawPixelLen } = findPixelDataOffsetAndLength(byteArray);
  const pixelDataLength = (rawPixelLen === 0xFFFFFFFF || rawPixelLen === 0) ? (byteArray.length - pixelDataOffset) : rawPixelLen;

  const rows = getNumber('x00280010', '00280010', 512);
  const columns = getNumber('x00280011', '00280011', 512);
  const bitsAllocated = getNumber('x00280100', '00280100', 16);
  const bitsStored = getNumber('x00280101', '00280101', 12);
  const highBit = getNumber('x00280102', '00280102', bitsStored - 1);
  const pixelRepresentation = getNumber('x00280103', '00280103', 0);
  const samplesPerPixel = getNumber('x00280002', '00280002', 1);

  const explicitFrames = getNumber('x00280008', '00280008', 1);
  const bytesPerSingleFrame = rows * columns * Math.ceil(bitsAllocated / 8) * samplesPerPixel;
  let numberOfFrames = explicitFrames;

  if (numberOfFrames <= 1 && pixelDataLength && pixelDataLength !== 0xFFFFFFFF && bytesPerSingleFrame > 0 && pixelDataLength >= bytesPerSingleFrame * 2) {
    numberOfFrames = Math.floor(pixelDataLength / bytesPerSingleFrame);
  }

  // If pixel data is encapsulated (0xFFFFFFFF) or numberOfFrames is still 1, scan for Sequence Items (FFFE E000)
  if (numberOfFrames <= 1) {
    let itemCount = 0;
    const startScan = pixelDataOffset !== undefined ? pixelDataOffset : 128;
    for (let i = startScan; i < byteArray.length - 8; i++) {
      if (byteArray[i] === 0xFE && byteArray[i + 1] === 0xFF && byteArray[i + 2] === 0x00 && byteArray[i + 3] === 0xE0) {
        itemCount++;
      }
    }
    if (itemCount > 1) {
      numberOfFrames = itemCount - 1; // Exclude Basic Offset Table (BOT) item
    } else if (itemCount === 1) {
      numberOfFrames = 1;
    }
  }

  const photometricInterpretation = getString('x00280004', '00280004', 'MONOCHROME2').trim();

  const rescaleSlope = getNumber('x00281053', '00281053', 1);
  const rescaleIntercept = getNumber('x00281052', '00281052', 0);

  const rawWc = getString('x00281050', '00281050', '');
  const rawWw = getString('x00281051', '00281051', '');
  let windowCenter = rawWc ? parseFloat(rawWc.split('\\')[0]) : (rescaleIntercept < -500 ? 40 : 40);
  let windowWidth = rawWw ? parseFloat(rawWw.split('\\')[0]) : (rescaleIntercept < -500 ? 400 : 400);

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
  const rawModality = getString('x00080060', '00080060', rescaleIntercept < -500 ? 'CT' : 'CT').toUpperCase();
  const sopInstanceUid = getString('x00080018', '00080018', `sop_${Date.now()}_${Math.random()}`);
  const seriesInstanceUid = getString('x0020000e', '0020000E', 'series_unknown');
  const studyInstanceUid = getString('x0020000d', '0020000D', 'study_unknown');
  const instanceNumber = getNumber('x00200013', '00200013', 1);

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
    transferSyntaxUid
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

/**
 * On-demand lazy pixel decoder for a single slice
 * Executed in < 1ms when the slice is rendered on screen.
 */
export function getOrDecodeInstancePixels(instance: DicomInstance): {
  pixelData: Int16Array | Uint16Array | Uint8Array;
  huData: Int16Array;
} {
  const numPixels = instance.rows * instance.columns;

  if (instance.pixelData && instance.huData && instance.huData.length === numPixels) {
    return {
      pixelData: instance.pixelData as any,
      huData: instance.huData as Int16Array
    };
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
      return pixelRep === 1 ? new Int16Array(frameBytes) : new Uint16Array(frameBytes);
    } else {
      return new Uint8Array(frameBytes);
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
    if (framesCount > 1) {
      const bytesPerFrame = inst.rows * inst.columns * Math.ceil(inst.bitsAllocated / 8) * (inst.samplesPerPixel || 1);
      for (let f = 0; f < framesCount; f++) {
        const frameInst: DicomInstance = {
          ...inst,
          sopInstanceUid: `${inst.sopInstanceUid}_frame_${f + 1}`,
          instanceNumber: f + 1,
          frameIndex: f,
          numberOfFrames: framesCount,
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
        if (a.sliceLocation !== undefined && b.sliceLocation !== undefined && a.sliceLocation !== b.sliceLocation) {
          return a.sliceLocation - b.sliceLocation;
        }
        return a.instanceNumber - b.instanceNumber;
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
