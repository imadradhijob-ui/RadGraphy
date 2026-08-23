import { DicomStudy, DicomInstance } from '../types/dicom';
import { parseDicomBufferFast, groupInstancesIntoStudies, isDicomBuffer } from './dicomParser';
import { parseDicomDirBuffer } from './dicomdirParser';

export interface OpticalDriveResult {
  success: boolean;
  detected: boolean;
  driveLetter?: string;
  volumeName?: string;
  name?: string;
  message?: string;
  filesCount?: number;
  studies?: DicomStudy[];
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export class OpticalDriveService {
  /**
   * Scans and reads the connected optical CD/DVD drive directly.
   * If a disc is loaded, streams all patient DICOM studies.
   * If no disc is detected, returns detected = false.
   */
  static async readDisc(
    onProgress?: (progress: number, message: string) => void,
    onFirstBatch?: (study: DicomStudy) => void
  ): Promise<OpticalDriveResult> {
    if (onProgress) onProgress(5, '🔍 Searching for optical CD/DVD drives...');

    // 1. Electron Native Direct Drive Scanning
    if (window.electronAPI?.readOpticalDisc) {
      try {
        if (onProgress) onProgress(15, 'Scanning CD/DVD disc drive...');
        const res = await window.electronAPI.readOpticalDisc();

        if (!res.detected) {
          return {
            success: false,
            detected: false,
            message: res.message || 'No CD/DVD disc was detected in the drive.'
          };
        }

        const files = (res as any).files || [];
        if (onProgress) onProgress(40, `Reading ${files.length} files from CD/DVD (${res.driveLetter || 'D:'})...`);

        const allInstances: DicomInstance[] = [];
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          try {
            const buf = typeof f.buffer === 'string' ? base64ToArrayBuffer(f.buffer) : f.buffer;
            if (f.fileName.toUpperCase() === 'DICOMDIR') {
              try { parseDicomDirBuffer(buf); } catch (_) {}
            }
            if (isDicomBuffer(buf)) {
              const inst = parseDicomBufferFast(buf, f.fileName);
              if (inst) {
                inst.filePath = f.filePath || f.fileName;
                allInstances.push(inst);
              }
            }
          } catch (_) {}

          if (i % 20 === 0 && onProgress) {
            const pct = Math.round(40 + ((i + 1) / Math.max(1, files.length)) * 55);
            onProgress(pct, `Processed ${allInstances.length} slices (${pct}%)...`);
          }
        }

        if (allInstances.length > 0) {
          const grouped = groupInstancesIntoStudies(
            allInstances,
            'disc',
            `CD/DVD (${res.volumeName || res.driveLetter || 'Optical Disc'})`
          );
          if (onProgress) onProgress(100, `Loaded ${allInstances.length} slices successfully.`);
          return {
            success: true,
            detected: true,
            driveLetter: res.driveLetter,
            volumeName: res.volumeName,
            filesCount: allInstances.length,
            studies: grouped
          };
        } else {
          return {
            success: false,
            detected: true,
            driveLetter: res.driveLetter,
            message: 'CD/DVD disc detected, but no DICOM images were found on the disc.'
          };
        }
      } catch (err: any) {
        console.warn('Native readOpticalDisc error, trying stream API:', err);
      }
    }

    // 2. High-Speed SSE Stream from Dev / System Server
    try {
      if (onProgress) onProgress(10, 'Connecting to optical disc drive...');
      const response = await fetch('/api/system/read-optical-disc/stream');

      if (!response.ok || !response.body) {
        return {
          success: false,
          detected: false,
          message: 'Could not connect to CD/DVD drive service.'
        };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      const allInstances: DicomInstance[] = [];
      let detectedInfo: { driveLetter?: string; volumeName?: string; name?: string } | null = null;
      let firstBatchTriggered = false;
      let isNotDetected = false;
      let notDetectedMsg = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const msg = JSON.parse(trimmed.slice(6));
              if (msg.type === 'not_detected') {
                isNotDetected = true;
                notDetectedMsg = msg.message;
                break;
              } else if (msg.type === 'detected') {
                detectedInfo = {
                  driveLetter: msg.driveLetter,
                  volumeName: msg.volumeName,
                  name: msg.name
                };
                if (onProgress) {
                  onProgress(20, `Disc detected in Drive ${msg.driveLetter || 'D:'} (${msg.volumeName || 'Patient CD'}). Reading files...`);
                }
              } else if (msg.type === 'slice' && msg.file) {
                const rawBuf = base64ToArrayBuffer(msg.file.buffer);
                if (msg.file.fileName?.toUpperCase() === 'DICOMDIR') {
                  try { parseDicomDirBuffer(rawBuf); } catch (_) {}
                }
                if (isDicomBuffer(rawBuf)) {
                  const inst = parseDicomBufferFast(rawBuf, msg.file.fileName);
                  if (inst) {
                    inst.filePath = msg.file.filePath || msg.file.fileName;
                    allInstances.push(inst);

                    if (!firstBatchTriggered && allInstances.length >= 1 && onFirstBatch) {
                      firstBatchTriggered = true;
                      const initialGrouped = groupInstancesIntoStudies(
                        [...allInstances],
                        'disc',
                        `CD/DVD (${detectedInfo?.volumeName || detectedInfo?.driveLetter || 'Disc'})`
                      );
                      if (initialGrouped.length > 0) {
                        onFirstBatch(initialGrouped[0]);
                      }
                    }

                    if (allInstances.length % 10 === 0 && onProgress) {
                      const estimatedPct = Math.min(96, 20 + Math.round(allInstances.length * 0.25));
                      onProgress(
                        estimatedPct,
                        `Reading CD/DVD: ${allInstances.length} slices loaded...`
                      );
                    }
                  }
                }
              } else if (msg.type === 'done') {
                if (onProgress) onProgress(98, `Finishing indexing ${allInstances.length} slices...`);
              }
            } catch (_) {}
          }
        }

        if (isNotDetected) break;
      }

      if (isNotDetected) {
        return {
          success: false,
          detected: false,
          message: notDetectedMsg || 'No CD/DVD disc was detected in the drive.'
        };
      }

      if (allInstances.length > 0) {
        const grouped = groupInstancesIntoStudies(
          allInstances,
          'disc',
          `CD/DVD (${detectedInfo?.volumeName || detectedInfo?.driveLetter || 'Optical Disc'})`
        );
        if (onProgress) onProgress(100, `Loaded ${allInstances.length} slices from CD/DVD successfully!`);
        return {
          success: true,
          detected: true,
          driveLetter: detectedInfo?.driveLetter || 'D:',
          volumeName: detectedInfo?.volumeName,
          filesCount: allInstances.length,
          studies: grouped
        };
      } else {
        return {
          success: false,
          detected: true,
          driveLetter: detectedInfo?.driveLetter,
          message: 'CD/DVD disc detected, but no valid DICOM files were found on the disc.'
        };
      }
    } catch (err: any) {
      return {
        success: false,
        detected: false,
        message: err?.message || 'Failed to communicate with optical disc drive.'
      };
    }
  }
}
