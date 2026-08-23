export type ModalityType = 'CT' | 'MR' | 'CR' | 'DX' | 'XA' | 'US' | 'NM' | 'PT' | 'MG' | 'SC' | 'OT';

export interface DicomTag {
  tag: string; // e.g. "(0010,0010)"
  name: string; // e.g. "PatientName"
  vr: string; // e.g. "PN"
  value: string | number | number[] | string[];
}

export interface DicomInstance {
  sopInstanceUid: string;
  instanceNumber: number;
  rows: number;
  columns: number;
  bitsAllocated: number;
  bitsStored: number;
  highBit: number;
  pixelRepresentation: number; // 0 = unsigned, 1 = 2's complement signed
  samplesPerPixel: number;
  photometricInterpretation: string; // 'MONOCHROME1' | 'MONOCHROME2' | 'RGB'
  rescaleSlope: number;
  rescaleIntercept: number;
  windowCenter: number;
  windowWidth: number;
  pixelSpacing: [number, number]; // [rowSpacing, colSpacing] in mm
  sliceThickness?: number;
  sliceLocation?: number;
  imagePositionPatient?: [number, number, number];
  imageOrientationPatient?: [number, number, number, number, number, number];
  seriesInstanceUid: string;
  studyInstanceUid: string;
  rawTags: Record<string, DicomTag>;
  // Pixel Data (can be lazily decoded on demand)
  pixelData?: Int16Array | Uint16Array | Uint8Array | Uint8ClampedArray;
  // Calibrated HU values cached for fast probing and measurements
  huData?: Int16Array | Float32Array;
  minPixelValue?: number;
  maxPixelValue?: number;
  fileName?: string;
  filePath?: string;
  // Multi-frame DICOM support (Enhanced CT / MR / US)
  numberOfFrames?: number;
  frameIndex?: number;
  // Lazy buffer storage for zero-freeze streaming
  rawBuffer?: ArrayBuffer | Uint8Array;
  pixelDataOffset?: number;
  pixelDataLength?: number;
  transferSyntaxUid?: string;
}

export interface DicomSeries {
  seriesInstanceUid: string;
  seriesNumber: number;
  seriesDescription: string;
  modality: ModalityType;
  studyInstanceUid: string;
  patientId: string;
  numberOfInstances: number;
  instances: DicomInstance[];
  thumbnailUrl?: string;
  bodyPartExamined?: string;
  protocolName?: string;
}

export interface DicomStudy {
  studyInstanceUid: string;
  studyDate: string;
  studyTime: string;
  studyDescription: string;
  accessionNumber: string;
  patientName: string;
  patientId: string;
  patientBirthDate?: string;
  patientSex?: string;
  patientAge?: string;
  modalitiesInStudy: ModalityType[];
  numberOfSeries: number;
  numberOfInstances: number;
  series: DicomSeries[];
  source: 'file' | 'folder' | 'dicomdir' | 'pacs' | 'sample' | 'disc';
  sourceName?: string;
}

export interface DicomDirRecord {
  recordType: 'PATIENT' | 'STUDY' | 'SERIES' | 'IMAGE';
  offset: number;
  nextRecordOffset: number;
  childRecordOffset: number;
  referencedFileId?: string;
  patientName?: string;
  patientId?: string;
  studyInstanceUid?: string;
  studyDate?: string;
  studyDescription?: string;
  seriesInstanceUid?: string;
  seriesNumber?: number;
  modality?: string;
  sopInstanceUid?: string;
  instanceNumber?: number;
}

export type ToolType =
  | 'ww_wl'
  | 'pan'
  | 'zoom'
  | 'loupe'
  | 'rotate'
  | 'scroll'
  | 'distance'
  | 'angle'
  | 'cobb_angle'
  | 'ctr'
  | 'rectangle_roi'
  | 'ellipse_roi'
  | 'hu_probe';

export type ColorLutType =
  | 'grayscale'
  | 'hot_iron'
  | 'pet_rainbow'
  | 'bone'
  | 'angio'
  | 'cool_blue'
  | 'inverted';

export type ImageFilterType = 'none' | 'sharpen' | 'smooth' | 'edge' | 'bone';

export type SyncMode = 'none' | 'index' | 'location';

export type MipMode = 'none' | 'mip' | 'minip' | 'average';

export type GridLayout = '1x1' | '1x2' | '2x1' | '2x2' | '1x3' | '3x1' | '3x3';

export interface Point2D {
  x: number;
  y: number;
}

export interface RoiStatistics {
  areaMm2: number;
  areaCm2: number;
  meanHu: number;
  minHu: number;
  maxHu: number;
  stdDevHu: number;
  histogram?: { bins: number[]; minHu: number; maxHu: number; count: number };
}

export interface CtrStatistics {
  cardiacDiameterMm: number;
  thoracicDiameterMm: number;
  ratio: number;
  isCardiomegaly: boolean;
}

export interface Measurement {
  id: string;
  instanceIndex?: number;
  type: ToolType;
  points: Point2D[];
  color?: string;
  distanceMm?: number;
  angleDeg?: number;
  cobbDeg?: number;
  roiValues?: RoiStatistics;
  ctrValues?: CtrStatistics;
  probeHu?: number;
  probeCoord?: Point2D;
  tissueName?: string;
  isFinished: boolean;
}

export interface KeyImageBookmark {
  id: string;
  studyInstanceUid: string;
  seriesInstanceUid: string;
  instanceIndex: number;
  sopInstanceUid?: string;
  patientName: string;
  patientId: string;
  studyDescription: string;
  seriesDescription: string;
  sliceLocation?: number;
  timestamp: number;
  notes: string;
  snapshotDataUrl: string;
  measurementsCount: number;
}

export interface ViewportState {
  id: string;
  studyUid: string | null;
  seriesUid: string | null;
  instanceIndex: number;
  windowCenter: number;
  windowWidth: number;
  zoom: number;
  pan: Point2D;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  invert: boolean;
  lut: ColorLutType;
  filter?: ImageFilterType;
  loupeScale?: number;
  loupeRadius?: number;
  mipMode: MipMode;
  mipSlabThickness: number; // 1 = standard single slice, 3, 5, 10, 20 = slab thickness
  cinePlaying: boolean;
  cineFps: number;
  measurements: Measurement[];
}

export interface WindowPreset {
  id: string;
  name: string;
  arabicName: string;
  windowCenter: number;
  windowWidth: number;
  modality: ModalityType | 'ALL';
  shortcut?: string;
}

export type MprPlane = 'axial' | 'coronal' | 'sagittal';

export interface PacsServerConfig {
  id: string;
  name: string;
  aeTitle: string;
  callingAeTitle: string;
  host: string;
  port: number;
  protocol: 'dimse' | 'dicomweb';
  cStorePort?: number;
  retrieveMethod?: 'c-move' | 'c-get' | 'auto';
  wadoUrl?: string;
  qidoUrl?: string;
  isDefault?: boolean;
}

export interface PacsSearchResult {
  patientId: string;
  patientName: string;
  patientSex?: string;
  patientBirthDate?: string;
  studyInstanceUid: string;
  studyDate: string;
  studyTime?: string;
  studyDescription: string;
  accessionNumber: string;
  modalities: string;
  numberOfInstances: number;
  serverConfigId: string;
}
