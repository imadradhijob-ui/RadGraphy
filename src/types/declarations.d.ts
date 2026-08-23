declare module 'dicom-parser' {
  export interface Element {
    tag: string;
    vr?: string;
    length: number;
    dataOffset: number;
  }

  export interface DataSet {
    byteArray: Uint8Array;
    elements: Record<string, Element>;
    string(tag: string): string | undefined;
    text(tag: string): string | undefined;
    int16(tag: string): number | undefined;
    uint16(tag: string): number | undefined;
    int32(tag: string): number | undefined;
    uint32(tag: string): number | undefined;
    float(tag: string): number | undefined;
    double(tag: string): number | undefined;
    numStringValues(tag: string): number;
  }

  export interface ParseOptions {
    untilTag?: string;
    maxBytesToRead?: number;
    inflightDatasetCallback?: (dataSet: DataSet) => void;
  }

  export function parseDicom(byteArray: Uint8Array, options?: ParseOptions): DataSet;
  export function explicitElementToString(dataSet: DataSet, element: Element): string;
}

declare module 'dcmjs' {
  export const data: any;
  export const utilities: any;
  export const adapters: any;
}

declare module 'jpeg-lossless-decoder-js' {
  export class Decoder {
    constructor();
    decode(buffer: ArrayBuffer | Uint8Array, offset?: number, length?: number): Uint8Array | Uint16Array | Int16Array;
  }
}

declare module 'jpeg-js' {
  export function decode(
    jpegData: Buffer | Uint8Array | ArrayBuffer,
    options?: { useTArray?: boolean; colorTransform?: boolean; formatAsRGBA?: boolean; maxMemoryUsageInMB?: number; maxResolutionInMP?: number }
  ): { width: number; height: number; data: Uint8Array };
}

interface Window {
  electronAPI?: {
    openDicomFiles: () => Promise<Array<{ fileName: string; filePath: string; buffer: ArrayBuffer }>>;
    openDicomDirectory: () => Promise<Array<{ fileName: string; filePath: string; buffer: ArrayBuffer }>>;
    openPath: (targetPath: string) => Promise<Array<{ fileName: string; filePath: string; buffer: ArrayBuffer }>>;
    detectOpticalDrives: () => Promise<Array<{ driveLetter: string; name: string; volumeName: string }>>;
    readOpticalDisc: () => Promise<{ success: boolean; detected: boolean; driveLetter?: string; volumeName?: string; count?: number; files?: Array<{ fileName: string; filePath: string; buffer: ArrayBuffer }>; message?: string }>;
    pacsEcho: (serverConfig: any) => Promise<{ success: boolean; message: string; responseTimeMs: number }>;
    pacsSearch: (serverConfig: any, filters: any) => Promise<any[]>;
    pacsRetrieve: (serverConfig: any, studyInstanceUid: string) => Promise<{ success: boolean; count: number; files: Array<{ fileName: string; buffer: string; size: number }> }>;
    onPacsSlice?: (callback: (slice: { fileName: string; buffer: string; size: number; index: number }) => void) => () => void;
  };
}
