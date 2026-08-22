import * as dicomParser from 'dicom-parser';
import { DicomDirRecord } from '../types/dicom';

export interface ParsedDicomDir {
  patients: {
    patientName: string;
    patientId: string;
    studies: {
      studyInstanceUid: string;
      studyDate: string;
      studyDescription: string;
      series: {
        seriesInstanceUid: string;
        seriesNumber: number;
        modality: string;
        seriesDescription: string;
        images: {
          sopInstanceUid: string;
          instanceNumber: number;
          referencedFileId: string;
        }[];
      }[];
    }[];
  }[];
  allFilePaths: string[];
}

export function parseDicomDirBuffer(buffer: ArrayBuffer): ParsedDicomDir {
  const byteArray = new Uint8Array(buffer);
  const dataSet = dicomParser.parseDicom(byteArray);

  const parsed: ParsedDicomDir = {
    patients: [],
    allFilePaths: []
  };

  try {
    // Directory Record Sequence (0004,1220)
    const seqElem = dataSet.elements['x00041220'];
    if (!seqElem || !seqElem.items) {
      return parsed;
    }

    let currentPatient: any = null;
    let currentStudy: any = null;
    let currentSeries: any = null;

    for (const item of seqElem.items) {
      if (!item.dataSet) continue;
      const ds = item.dataSet;

      const recordType = ds.string('x00041430') || ''; // Directory Record Type

      if (recordType === 'PATIENT') {
        const patientName = ds.string('x00100010') || 'Anonymous Patient';
        const patientId = ds.string('x00100020') || 'ID_UNKNOWN';
        
        currentPatient = {
          patientName,
          patientId,
          studies: []
        };
        parsed.patients.push(currentPatient);
        currentStudy = null;
        currentSeries = null;
      } else if (recordType === 'STUDY') {
        const studyInstanceUid = ds.string('x0020000d') || `study_${Date.now()}`;
        const studyDate = ds.string('x00080020') || '';
        const studyDescription = ds.string('x00081030') || 'DICOMDIR Study';

        currentStudy = {
          studyInstanceUid,
          studyDate,
          studyDescription,
          series: []
        };

        if (currentPatient) {
          currentPatient.studies.push(currentStudy);
        }
        currentSeries = null;
      } else if (recordType === 'SERIES') {
        const seriesInstanceUid = ds.string('x0020000e') || `series_${Date.now()}`;
        const modality = ds.string('x00080060') || 'OT';
        const seriesDescription = ds.string('x0008103e') || `Series ${modality}`;
        const seriesNumber = parseInt(ds.string('x00200011') || '1', 10);

        currentSeries = {
          seriesInstanceUid,
          seriesNumber,
          modality,
          seriesDescription,
          images: []
        };

        if (currentStudy) {
          currentStudy.series.push(currentSeries);
        }
      } else if (recordType === 'IMAGE') {
        const sopInstanceUid = ds.string('x00041511') || ds.string('x00080018') || `sop_${Date.now()}`;
        const instanceNumber = parseInt(ds.string('x00200013') || '1', 10);
        
        // Referenced File ID (0004,1500) can have multiple path components separated by backslash
        let referencedFileId = '';
        try {
          const fileIdElem = ds.elements['x00041500'];
          if (fileIdElem) {
            referencedFileId = ds.string('x00041500') || '';
          }
        } catch {
          // ignore
        }

        // Normalize path
        const normalizedPath = referencedFileId.replace(/\\/g, '/');

        if (currentSeries) {
          currentSeries.images.push({
            sopInstanceUid,
            instanceNumber,
            referencedFileId: normalizedPath
          });
        }

        if (normalizedPath) {
          parsed.allFilePaths.push(normalizedPath);
        }
      }
    }
  } catch (err) {
    console.warn('Error reading DICOMDIR sequence:', err);
  }

  return parsed;
}
