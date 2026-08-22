import { DicomInstance, DicomSeries, DicomStudy, DicomTag } from '../types/dicom';

export function generateSampleStudies(): DicomStudy[] {
  return [
    createCtChestStudy(),
    createCtBrainStudy(),
    createMriSpineStudy(),
    createChestXRayStudy(),
  ];
}

function createCtChestStudy(): DicomStudy {
  const patientId = 'PAT-CT-2026-8831';
  const patientName = 'AL-SAADI^AHMED^M';
  const studyUid = '1.2.840.113619.2.55.3.2831154.20260819.1001';
  const seriesUid = '1.2.840.113619.2.55.3.2831154.20260819.1002';
  const numSlices = 28;
  const rows = 256;
  const cols = 256;
  const pixelSpacing: [number, number] = [0.78, 0.78];
  const sliceThickness = 2.5;

  const instances: DicomInstance[] = [];

  for (let s = 0; s < numSlices; s++) {
    const sliceLocation = -140 + s * sliceThickness;
    const zNorm = s / (numSlices - 1);
    const sopUid = `${seriesUid}.${s + 1}`;

    const numPixels = rows * cols;
    const pixelData = new Int16Array(numPixels);
    const huData = new Int16Array(numPixels);

    const cx = cols / 2;
    const cy = rows / 2;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x;
        const dx = (x - cx) / (cols * 0.44);
        const dy = (y - cy) / (rows * 0.40);
        const r2 = dx * dx + dy * dy;

        let hu = -1000;

        if (r2 <= 1.0) {
          hu = -90;

          if (r2 > 0.90) {
            hu = 35;
          } else if (r2 <= 0.85) {
            hu = 45;

            const spineDx = (x - cx) / 16;
            const spineDy = (y - (cy + 65)) / 14;
            const spineR2 = spineDx * spineDx + spineDy * spineDy;
            if (spineR2 <= 1.0) {
              hu = 750;
              const canalR2 = spineDx * spineDx + (spineDy + 0.3) * (spineDy + 0.3);
              if (canalR2 <= 0.25) {
                hu = 15;
              }
            }

            const sternumDx = (x - cx) / 18;
            const sternumDy = (y - (cy - 75)) / 7;
            if (sternumDx * sternumDx + sternumDy * sternumDy <= 1.0) {
              hu = 600;
            }

            const ribAngle = Math.atan2(dy, dx);
            const ribRing = Math.abs(Math.sqrt(r2) - 0.78);
            if (ribRing < 0.05 && Math.sin(ribAngle * 6 + s * 0.3) > 0.4) {
              hu = 850;
            }

            const leftLungDx = (x - (cx - 48)) / (38 + zNorm * 8);
            const leftLungDy = (y - (cy - 5)) / (50 + zNorm * 10);
            const leftLungR2 = leftLungDx * leftLungDx + leftLungDy * leftLungDy;

            const rightLungDx = (x - (cx + 48)) / (38 + zNorm * 8);
            const rightLungDy = (y - (cy - 5)) / (50 + zNorm * 10);
            const rightLungR2 = rightLungDx * rightLungDx + rightLungDy * rightLungDy;

            const diaphragmCut = 0.85 - (1.0 - zNorm) * 0.2;
            const isLungLevel = zNorm < diaphragmCut;

            if (isLungLevel) {
              if (leftLungR2 <= 1.0) {
                hu = -720 + Math.floor(Math.sin(x * 0.2) * 40 + Math.cos(y * 0.2) * 30);
                const vesselNoise = Math.sin(x * 0.4 + y * 0.5) * Math.cos(x * 0.3 - y * 0.4);
                if (vesselNoise > 0.6) hu = 60;
              } else if (rightLungR2 <= 1.0) {
                hu = -730 + Math.floor(Math.cos(x * 0.25) * 40 + Math.sin(y * 0.2) * 30);
                const vesselNoise = Math.sin(x * 0.35 - y * 0.45) * Math.cos(x * 0.25 + y * 0.3);
                if (vesselNoise > 0.65) hu = 60;
              }
            }

            if (zNorm > 0.35 && zNorm < 0.90) {
              const heartDx = (x - (cx + 12)) / 36;
              const heartDy = (y - (cy + 15)) / 32;
              if (heartDx * heartDx + heartDy * heartDy <= 1.0) {
                hu = 48 + Math.floor(Math.sin(x * 0.15) * 8);
                const aortaDx = (x - (cx - 10)) / 10;
                const aortaDy = (y - (cy + 25)) / 10;
                if (aortaDx * aortaDx + aortaDy * aortaDy <= 1.0) {
                  hu = 120;
                }
              }
            }

            if (zNorm < 0.45) {
              const trachDx = (x - cx) / 8;
              const trachDy = (y - (cy + 10)) / 7;
              if (trachDx * trachDx + trachDy * trachDy <= 1.0) {
                hu = -950;
              }
            }
          }
        }

        const noise = Math.floor((Math.random() - 0.5) * 12);
        const finalHu = Math.max(-1024, Math.min(3071, hu + noise));

        huData[idx] = finalHu;
        pixelData[idx] = finalHu + 1024;
      }
    }

    const rawTags: Record<string, DicomTag> = {
      '(0010,0010)': { tag: '(0010,0010)', name: 'PatientName', vr: 'PN', value: patientName },
      '(0010,0020)': { tag: '(0010,0020)', name: 'PatientID', vr: 'LO', value: patientId },
      '(0010,0030)': { tag: '(0010,0030)', name: 'PatientBirthDate', vr: 'DA', value: '19820514' },
      '(0010,0040)': { tag: '(0010,0040)', name: 'PatientSex', vr: 'CS', value: 'M' },
      '(0010,1010)': { tag: '(0010,1010)', name: 'PatientAge', vr: 'AS', value: '044Y' },
      '(0008,0020)': { tag: '(0008,0020)', name: 'StudyDate', vr: 'DA', value: '20260819' },
      '(0008,0030)': { tag: '(0008,0030)', name: 'StudyTime', vr: 'TM', value: '101530' },
      '(0008,0060)': { tag: '(0008,0060)', name: 'Modality', vr: 'CS', value: 'CT' },
      '(0008,1030)': { tag: '(0008,1030)', name: 'StudyDescription', vr: 'LO', value: 'CT CHEST WITH CONTRAST' },
      '(0008,103E)': { tag: '(0008,103E)', name: 'SeriesDescription', vr: 'LO', value: 'Axial 2.5mm Mediastinum / Lung' },
      '(0018,0015)': { tag: '(0018,0015)', name: 'BodyPartExamined', vr: 'CS', value: 'CHEST' },
      '(0018,0050)': { tag: '(0018,0050)', name: 'SliceThickness', vr: 'DS', value: sliceThickness.toString() },
      '(0020,0011)': { tag: '(0020,0011)', name: 'SeriesNumber', vr: 'IS', value: '2' },
      '(0020,0013)': { tag: '(0020,0013)', name: 'InstanceNumber', vr: 'IS', value: (s + 1).toString() },
      '(0020,1041)': { tag: '(0020,1041)', name: 'SliceLocation', vr: 'DS', value: sliceLocation.toFixed(2) },
      '(0028,0010)': { tag: '(0028,0010)', name: 'Rows', vr: 'US', value: rows },
      '(0028,0011)': { tag: '(0028,0011)', name: 'Columns', vr: 'US', value: cols },
      '(0028,0030)': { tag: '(0028,0030)', name: 'PixelSpacing', vr: 'DS', value: `${pixelSpacing[0]}\\${pixelSpacing[1]}` },
      '(0028,1050)': { tag: '(0028,1050)', name: 'WindowCenter', vr: 'DS', value: '-600' },
      '(0028,1051)': { tag: '(0028,1051)', name: 'WindowWidth', vr: 'DS', value: '1500' },
      '(0028,1052)': { tag: '(0028,1052)', name: 'RescaleIntercept', vr: 'DS', value: '-1024' },
      '(0028,1053)': { tag: '(0028,1053)', name: 'RescaleSlope', vr: 'DS', value: '1' }
    };

    instances.push({
      sopInstanceUid: sopUid,
      instanceNumber: s + 1,
      rows,
      columns: cols,
      bitsAllocated: 16,
      bitsStored: 12,
      highBit: 11,
      pixelRepresentation: 0,
      samplesPerPixel: 1,
      photometricInterpretation: 'MONOCHROME2',
      rescaleSlope: 1,
      rescaleIntercept: -1024,
      windowCenter: -600,
      windowWidth: 1500,
      pixelSpacing,
      sliceThickness,
      sliceLocation,
      imagePositionPatient: [-190, -190, sliceLocation],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      seriesInstanceUid: seriesUid,
      studyInstanceUid: studyUid,
      rawTags,
      pixelData,
      huData,
      minPixelValue: -1000,
      maxPixelValue: 1200,
      fileName: `CT_CHEST_IM${String(s + 1).padStart(3, '0')}.dcm`
    });
  }

  const series: DicomSeries = {
    seriesInstanceUid: seriesUid,
    seriesNumber: 2,
    seriesDescription: 'Axial 2.5mm Chest',
    modality: 'CT',
    studyInstanceUid: studyUid,
    patientId,
    numberOfInstances: instances.length,
    instances,
    bodyPartExamined: 'CHEST',
    protocolName: 'CHEST ROUTINE'
  };

  return {
    studyInstanceUid: studyUid,
    studyDate: '20260819',
    studyTime: '101530',
    studyDescription: 'CT CHEST WITH CONTRAST',
    accessionNumber: 'ACC-89104',
    patientName,
    patientId,
    patientBirthDate: '19820514',
    patientSex: 'M',
    patientAge: '044Y',
    modalitiesInStudy: ['CT'],
    numberOfSeries: 1,
    numberOfInstances: instances.length,
    series: [series],
    source: 'sample',
    sourceName: 'Sample: CT Thorax'
  };
}

function createCtBrainStudy(): DicomStudy {
  const patientId = 'PAT-CT-2026-9912';
  const patientName = 'KHALID^FATIMA^Z';
  const studyUid = '1.2.840.113619.2.55.3.9912001.20260819.1101';
  const seriesUid = '1.2.840.113619.2.55.3.9912001.20260819.1102';
  const numSlices = 24;
  const rows = 256;
  const cols = 256;
  const pixelSpacing: [number, number] = [0.45, 0.45];
  const sliceThickness = 4.0;

  const instances: DicomInstance[] = [];

  for (let s = 0; s < numSlices; s++) {
    const sliceLocation = -40 + s * sliceThickness;
    const zNorm = s / (numSlices - 1);
    const sopUid = `${seriesUid}.${s + 1}`;

    const numPixels = rows * cols;
    const pixelData = new Int16Array(numPixels);
    const huData = new Int16Array(numPixels);

    const cx = cols / 2;
    const cy = rows / 2;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x;
        const headRadiusX = cols * (0.34 + Math.sin(zNorm * Math.PI) * 0.06);
        const headRadiusY = rows * (0.40 + Math.sin(zNorm * Math.PI) * 0.05);

        const dx = (x - cx) / headRadiusX;
        const dy = (y - cy) / headRadiusY;
        const r2 = dx * dx + dy * dy;

        let hu = -1000;

        if (r2 <= 1.15 && r2 > 1.0) {
          hu = 35;
        } else if (r2 <= 1.0 && r2 > 0.88) {
          hu = 1450;
        } else if (r2 <= 0.88) {
          hu = 32;

          if (r2 > 0.72) {
            hu = 42;
          }

          if (Math.abs(x - cx) < 2) {
            hu = 45;
          }

          if (zNorm > 0.35 && zNorm < 0.75) {
            const ventLeft = Math.pow((x - (cx - 10)) / 6, 2) + Math.pow((y - (cy - 5)) / 22, 2);
            const ventRight = Math.pow((x - (cx + 10)) / 6, 2) + Math.pow((y - (cy - 5)) / 22, 2);
            if (ventLeft <= 1.0 || ventRight <= 1.0) {
              hu = 6;
            }
          }

          if (zNorm > 0.40 && zNorm < 0.65) {
            const bgLeft = Math.pow((x - (cx - 22)) / 8, 2) + Math.pow((y - (cy + 2)) / 10, 2);
            const bgRight = Math.pow((x - (cx + 22)) / 8, 2) + Math.pow((y - (cy + 2)) / 10, 2);
            if (bgLeft <= 1.0 || bgRight <= 1.0) {
              hu = 38;
            }
          }

          if (zNorm > 0.45 && zNorm < 0.68) {
            const strokeDx = (x - (cx + 38)) / 16;
            const strokeDy = (y - (cy - 12)) / 16;
            if (strokeDx * strokeDx + strokeDy * strokeDy <= 1.0) {
              hu = 22;
            }
          }
        }

        const noise = Math.floor((Math.random() - 0.5) * 8);
        const finalHu = Math.max(-1024, Math.min(3071, hu + noise));

        huData[idx] = finalHu;
        pixelData[idx] = finalHu + 1024;
      }
    }

    const rawTags: Record<string, DicomTag> = {
      '(0010,0010)': { tag: '(0010,0010)', name: 'PatientName', vr: 'PN', value: patientName },
      '(0010,0020)': { tag: '(0010,0020)', name: 'PatientID', vr: 'LO', value: patientId },
      '(0010,0030)': { tag: '(0010,0030)', name: 'PatientBirthDate', vr: 'DA', value: '19701103' },
      '(0010,0040)': { tag: '(0010,0040)', name: 'PatientSex', vr: 'CS', value: 'F' },
      '(0010,1010)': { tag: '(0010,1010)', name: 'PatientAge', vr: 'AS', value: '056Y' },
      '(0008,0020)': { tag: '(0008,0020)', name: 'StudyDate', vr: 'DA', value: '20260819' },
      '(0008,0030)': { tag: '(0008,0030)', name: 'StudyTime', vr: 'TM', value: '110500' },
      '(0008,0060)': { tag: '(0008,0060)', name: 'Modality', vr: 'CS', value: 'CT' },
      '(0008,1030)': { tag: '(0008,1030)', name: 'StudyDescription', vr: 'LO', value: 'CT BRAIN NON-CONTRAST' },
      '(0008,103E)': { tag: '(0008,103E)', name: 'SeriesDescription', vr: 'LO', value: 'Head Axial 4mm' },
      '(0018,0015)': { tag: '(0018,0015)', name: 'BodyPartExamined', vr: 'CS', value: 'HEAD' },
      '(0018,0050)': { tag: '(0018,0050)', name: 'SliceThickness', vr: 'DS', value: sliceThickness.toString() },
      '(0020,0011)': { tag: '(0020,0011)', name: 'SeriesNumber', vr: 'IS', value: '1' },
      '(0020,0013)': { tag: '(0020,0013)', name: 'InstanceNumber', vr: 'IS', value: (s + 1).toString() },
      '(0020,1041)': { tag: '(0020,1041)', name: 'SliceLocation', vr: 'DS', value: sliceLocation.toFixed(2) },
      '(0028,0010)': { tag: '(0028,0010)', name: 'Rows', vr: 'US', value: rows },
      '(0028,0011)': { tag: '(0028,0011)', name: 'Columns', vr: 'US', value: cols },
      '(0028,0030)': { tag: '(0028,0030)', name: 'PixelSpacing', vr: 'DS', value: `${pixelSpacing[0]}\\${pixelSpacing[1]}` },
      '(0028,1050)': { tag: '(0028,1050)', name: 'WindowCenter', vr: 'DS', value: '40' },
      '(0028,1051)': { tag: '(0028,1051)', name: 'WindowWidth', vr: 'DS', value: '80' },
      '(0028,1052)': { tag: '(0028,1052)', name: 'RescaleIntercept', vr: 'DS', value: '-1024' },
      '(0028,1053)': { tag: '(0028,1053)', name: 'RescaleSlope', vr: 'DS', value: '1' }
    };

    instances.push({
      sopInstanceUid: sopUid,
      instanceNumber: s + 1,
      rows,
      columns: cols,
      bitsAllocated: 16,
      bitsStored: 12,
      highBit: 11,
      pixelRepresentation: 0,
      samplesPerPixel: 1,
      photometricInterpretation: 'MONOCHROME2',
      rescaleSlope: 1,
      rescaleIntercept: -1024,
      windowCenter: 40,
      windowWidth: 80,
      pixelSpacing,
      sliceThickness,
      sliceLocation,
      imagePositionPatient: [-120, -120, sliceLocation],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      seriesInstanceUid: seriesUid,
      studyInstanceUid: studyUid,
      rawTags,
      pixelData,
      huData,
      minPixelValue: -1000,
      maxPixelValue: 1500,
      fileName: `CT_BRAIN_IM${String(s + 1).padStart(3, '0')}.dcm`
    });
  }

  const series: DicomSeries = {
    seriesInstanceUid: seriesUid,
    seriesNumber: 1,
    seriesDescription: 'Head 4mm Brain Window',
    modality: 'CT',
    studyInstanceUid: studyUid,
    patientId,
    numberOfInstances: instances.length,
    instances,
    bodyPartExamined: 'HEAD',
    protocolName: 'HEAD STROKE'
  };

  return {
    studyInstanceUid: studyUid,
    studyDate: '20260819',
    studyTime: '110500',
    studyDescription: 'CT BRAIN NON-CONTRAST',
    accessionNumber: 'ACC-89105',
    patientName,
    patientId,
    patientBirthDate: '19701103',
    patientSex: 'F',
    patientAge: '056Y',
    modalitiesInStudy: ['CT'],
    numberOfSeries: 1,
    numberOfInstances: instances.length,
    series: [series],
    source: 'sample',
    sourceName: 'Sample: CT Brain'
  };
}

function createMriSpineStudy(): DicomStudy {
  const patientId = 'PAT-MR-2026-3021';
  const patientName = 'HUSSEIN^ALI^K';
  const studyUid = '1.2.840.113619.2.55.3.3021001.20260819.1201';
  const seriesT2Uid = '1.2.840.113619.2.55.3.3021001.20260819.1202';
  const seriesT1Uid = '1.2.840.113619.2.55.3.3021001.20260819.1203';
  const numSlices = 14;
  const rows = 256;
  const cols = 256;
  const pixelSpacing: [number, number] = [0.85, 0.85];
  const sliceThickness = 4.0;

  const makeMriSeries = (isT2: boolean, sUid: string, sNum: number, sDesc: string): DicomSeries => {
    const instances: DicomInstance[] = [];

    for (let s = 0; s < numSlices; s++) {
      const sliceLocation = -28 + s * sliceThickness;
      const sopUid = `${sUid}.${s + 1}`;

      const numPixels = rows * cols;
      const pixelData = new Uint16Array(numPixels);
      const huData = new Int16Array(numPixels);

      const cx = cols * 0.42;
      const cy = rows * 0.50;

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const idx = y * cols + x;
          let val = 20;

          if (x > 18 && x < 230 && y > 25 && y < 235) {
            val = isT2 ? 150 : 250;

            if (x > 185) {
              val = isT2 ? 400 : 700;
            }

            for (let v = 0; v < 6; v++) {
              const vy = cy - 70 + v * 28;
              const vx = cx + Math.sin((v - 2.5) * 0.4) * 8;
              
              const vdx = Math.abs(x - vx);
              const vdy = Math.abs(y - vy);

              if (vdx <= 14 && vdy <= 9) {
                val = isT2 ? 320 : 550;
                if (vdx > 12 || vdy > 7) {
                  val = 50;
                }
              }

              if (v < 5) {
                const discY = vy + 14;
                const discX = vx + 1;
                const ddx = Math.abs(x - discX);
                const ddy = Math.abs(y - discY);

                if (ddx <= 13 && ddy <= 4) {
                  val = isT2 ? 780 : 220;
                  if (v === 3 && (x - discX) > 6) {
                    val = isT2 ? 650 : 260;
                  }
                }
              }
            }

            const canalX = cx + 22;
            if (x >= canalX && x <= canalX + 8 && y >= cy - 80 && y <= cy + 90) {
              val = isT2 ? 920 : 120;
              if (Math.abs(x - (canalX + 4)) < 2 && Math.sin(y * 0.6) > 0) {
                val = isT2 ? 350 : 200;
              }
            }

            if (x > canalX + 10 && x < canalX + 35) {
              const spAngle = Math.sin((y - 30) * 0.22);
              if (spAngle > 0.3) {
                val = isT2 ? 180 : 350;
              }
            }
          }

          const noise = Math.floor((Math.random() - 0.5) * 15);
          const finalVal = Math.max(0, Math.min(4095, val + noise));

          pixelData[idx] = finalVal;
          huData[idx] = finalVal;
        }
      }

      const rawTags: Record<string, DicomTag> = {
        '(0010,0010)': { tag: '(0010,0010)', name: 'PatientName', vr: 'PN', value: patientName },
        '(0010,0020)': { tag: '(0010,0020)', name: 'PatientID', vr: 'LO', value: patientId },
        '(0010,0030)': { tag: '(0010,0030)', name: 'PatientBirthDate', vr: 'DA', value: '19880922' },
        '(0010,0040)': { tag: '(0010,0040)', name: 'PatientSex', vr: 'CS', value: 'M' },
        '(0010,1010)': { tag: '(0010,1010)', name: 'PatientAge', vr: 'AS', value: '038Y' },
        '(0008,0020)': { tag: '(0008,0020)', name: 'StudyDate', vr: 'DA', value: '20260819' },
        '(0008,0030)': { tag: '(0008,0030)', name: 'StudyTime', vr: 'TM', value: '121000' },
        '(0008,0060)': { tag: '(0008,0060)', name: 'Modality', vr: 'CS', value: 'MR' },
        '(0008,1030)': { tag: '(0008,1030)', name: 'StudyDescription', vr: 'LO', value: 'MRI LUMBAR SPINE' },
        '(0008,103E)': { tag: '(0008,103E)', name: 'SeriesDescription', vr: 'LO', value: sDesc },
        '(0018,0015)': { tag: '(0018,0015)', name: 'BodyPartExamined', vr: 'CS', value: 'LSPINE' },
        '(0018,0050)': { tag: '(0018,0050)', name: 'SliceThickness', vr: 'DS', value: sliceThickness.toString() },
        '(0020,0011)': { tag: '(0020,0011)', name: 'SeriesNumber', vr: 'IS', value: sNum.toString() },
        '(0020,0013)': { tag: '(0020,0013)', name: 'InstanceNumber', vr: 'IS', value: (s + 1).toString() },
        '(0020,1041)': { tag: '(0020,1041)', name: 'SliceLocation', vr: 'DS', value: sliceLocation.toFixed(2) },
        '(0028,0010)': { tag: '(0028,0010)', name: 'Rows', vr: 'US', value: rows },
        '(0028,0011)': { tag: '(0028,0011)', name: 'Columns', vr: 'US', value: cols },
        '(0028,0030)': { tag: '(0028,0030)', name: 'PixelSpacing', vr: 'DS', value: `${pixelSpacing[0]}\\${pixelSpacing[1]}` },
        '(0028,1050)': { tag: '(0028,1050)', name: 'WindowCenter', vr: 'DS', value: isT2 ? '500' : '400' },
        '(0028,1051)': { tag: '(0028,1051)', name: 'WindowWidth', vr: 'DS', value: isT2 ? '1000' : '800' },
        '(0028,1052)': { tag: '(0028,1052)', name: 'RescaleIntercept', vr: 'DS', value: '0' },
        '(0028,1053)': { tag: '(0028,1053)', name: 'RescaleSlope', vr: 'DS', value: '1' }
      };

      instances.push({
        sopInstanceUid: sopUid,
        instanceNumber: s + 1,
        rows,
        columns: cols,
        bitsAllocated: 16,
        bitsStored: 12,
        highBit: 11,
        pixelRepresentation: 0,
        samplesPerPixel: 1,
        photometricInterpretation: 'MONOCHROME2',
        rescaleSlope: 1,
        rescaleIntercept: 0,
        windowCenter: isT2 ? 500 : 400,
        windowWidth: isT2 ? 1000 : 800,
        pixelSpacing,
        sliceThickness,
        sliceLocation,
        imagePositionPatient: [sliceLocation, -120, -120],
        imageOrientationPatient: [0, 1, 0, 0, 0, -1],
        seriesInstanceUid: sUid,
        studyInstanceUid: studyUid,
        rawTags,
        pixelData,
        huData,
        minPixelValue: 0,
        maxPixelValue: 1200,
        fileName: `MR_SPINE_${isT2 ? 'T2' : 'T1'}_IM${String(s + 1).padStart(3, '0')}.dcm`
      });
    }

    return {
      seriesInstanceUid: sUid,
      seriesNumber: sNum,
      seriesDescription: sDesc,
      modality: 'MR',
      studyInstanceUid: studyUid,
      patientId,
      numberOfInstances: instances.length,
      instances,
      bodyPartExamined: 'LSPINE',
      protocolName: isT2 ? 'SAG T2 FSE' : 'SAG T1 SE'
    };
  };

  const t2Series = makeMriSeries(true, seriesT2Uid, 1, 'Sagittal T2 FSE Lumbar');
  const t1Series = makeMriSeries(false, seriesT1Uid, 2, 'Sagittal T1 SE Lumbar');

  return {
    studyInstanceUid: studyUid,
    studyDate: '20260819',
    studyTime: '121000',
    studyDescription: 'MRI LUMBAR SPINE',
    accessionNumber: 'ACC-89106',
    patientName,
    patientId,
    patientBirthDate: '19880922',
    patientSex: 'M',
    patientAge: '038Y',
    modalitiesInStudy: ['MR'],
    numberOfSeries: 2,
    numberOfInstances: t2Series.instances.length + t1Series.instances.length,
    series: [t2Series, t1Series],
    source: 'sample',
    sourceName: 'Sample: MRI Spine'
  };
}

function createChestXRayStudy(): DicomStudy {
  const patientId = 'PAT-DX-2026-1082';
  const patientName = 'JABBAR^MARYAM^A';
  const studyUid = '1.2.840.113619.2.55.3.1082001.20260819.1301';
  const seriesUid = '1.2.840.113619.2.55.3.1082001.20260819.1302';
  const rows = 512;
  const cols = 512;
  const pixelSpacing: [number, number] = [0.28, 0.28];

  const numPixels = rows * cols;
  const pixelData = new Uint16Array(numPixels);
  const huData = new Int16Array(numPixels);

  const cx = cols / 2;
  const cy = rows * 0.48;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const idx = y * cols + x;
      const dx = (x - cx) / (cols * 0.42);
      const dy = (y - cy) / (rows * 0.46);
      const r2 = dx * dx + dy * dy;

      let val = 3800;

      if (r2 <= 1.0) {
        val = 1400;

        const spineDx = Math.abs(x - cx);
        if (spineDx < 28) {
          val = 650;
        }

        const clavicleY = cy - 110;
        const clavicleDx = Math.abs(x - cx);
        if (clavicleDx > 25 && clavicleDx < 160 && Math.abs(y - (clavicleY + (clavicleDx - 90) * 0.15)) < 10) {
          val = 450;
        }

        for (let r = 0; r < 9; r++) {
          const ry = cy - 90 + r * 26;
          const arc = Math.pow(x - cx, 2) / 2200;
          if (Math.abs(y - (ry + arc)) < 7 && spineDx > 25 && r2 < 0.85) {
            val = Math.max(300, val - 400);
          }
        }

        const leftLung = Math.pow((x - (cx - 95)) / 70, 2) + Math.pow((y - (cy - 10)) / 110, 2);
        const rightLung = Math.pow((x - (cx + 95)) / 70, 2) + Math.pow((y - (cy - 10)) / 110, 2);

        if (leftLung <= 1.0 && y < cy + 85) {
          val = 2600 - Math.floor(leftLung * 600);
          if (Math.sin(x * 0.15 + y * 0.1) * Math.cos(x * 0.2 - y * 0.15) > 0.5) {
            val -= 400;
          }
        } else if (rightLung <= 1.0 && y < cy + 85) {
          val = 2600 - Math.floor(rightLung * 600);
          if (Math.sin(x * 0.18 - y * 0.12) * Math.cos(x * 0.15 + y * 0.18) > 0.5) {
            val -= 400;
          }
        }

        const heartR = Math.pow((x - (cx + 35)) / 75, 2) + Math.pow((y - (cy + 40)) / 60, 2);
        if (heartR <= 1.0 && y > cy - 20) {
          val = 700;
        }

        if (y > cy + 85) {
          val = 400;
        }
      }

      const noise = Math.floor((Math.random() - 0.5) * 20);
      const finalVal = Math.max(0, Math.min(4095, val + noise));

      pixelData[idx] = finalVal;
      huData[idx] = finalVal;
    }
  }

  const rawTags: Record<string, DicomTag> = {
    '(0010,0010)': { tag: '(0010,0010)', name: 'PatientName', vr: 'PN', value: patientName },
    '(0010,0020)': { tag: '(0010,0020)', name: 'PatientID', vr: 'LO', value: patientId },
    '(0010,0030)': { tag: '(0010,0030)', name: 'PatientBirthDate', vr: 'DA', value: '19950311' },
    '(0010,0040)': { tag: '(0010,0040)', name: 'PatientSex', vr: 'CS', value: 'F' },
    '(0010,1010)': { tag: '(0010,1010)', name: 'PatientAge', vr: 'AS', value: '031Y' },
    '(0008,0020)': { tag: '(0008,0020)', name: 'StudyDate', vr: 'DA', value: '20260819' },
    '(0008,0030)': { tag: '(0008,0030)', name: 'StudyTime', vr: 'TM', value: '130000' },
    '(0008,0060)': { tag: '(0008,0060)', name: 'Modality', vr: 'CS', value: 'DX' },
    '(0008,1030)': { tag: '(0008,1030)', name: 'StudyDescription', vr: 'LO', value: 'CHEST 1 VIEW PA' },
    '(0008,103E)': { tag: '(0008,103E)', name: 'SeriesDescription', vr: 'LO', value: 'Chest PA View 512x512' },
    '(0018,0015)': { tag: '(0018,0015)', name: 'BodyPartExamined', vr: 'CS', value: 'CHEST' },
    '(0020,0011)': { tag: '(0020,0011)', name: 'SeriesNumber', vr: 'IS', value: '1' },
    '(0020,0013)': { tag: '(0020,0013)', name: 'InstanceNumber', vr: 'IS', value: '1' },
    '(0028,0010)': { tag: '(0028,0010)', name: 'Rows', vr: 'US', value: rows },
    '(0028,0011)': { tag: '(0028,0011)', name: 'Columns', vr: 'US', value: cols },
    '(0028,0030)': { tag: '(0028,0030)', name: 'PixelSpacing', vr: 'DS', value: `${pixelSpacing[0]}\\${pixelSpacing[1]}` },
    '(0028,1050)': { tag: '(0028,1050)', name: 'WindowCenter', vr: 'DS', value: '2048' },
    '(0028,1051)': { tag: '(0028,1051)', name: 'WindowWidth', vr: 'DS', value: '3500' },
    '(0028,1052)': { tag: '(0028,1052)', name: 'RescaleIntercept', vr: 'DS', value: '0' },
    '(0028,1053)': { tag: '(0028,1053)', name: 'RescaleSlope', vr: 'DS', value: '1' }
  };

  const instance: DicomInstance = {
    sopInstanceUid: `${seriesUid}.1`,
    instanceNumber: 1,
    rows,
    columns: cols,
    bitsAllocated: 16,
    bitsStored: 12,
    highBit: 11,
    pixelRepresentation: 0,
    samplesPerPixel: 1,
    photometricInterpretation: 'MONOCHROME2',
    rescaleSlope: 1,
    rescaleIntercept: 0,
    windowCenter: 2048,
    windowWidth: 3500,
    pixelSpacing,
    seriesInstanceUid: seriesUid,
    studyInstanceUid: studyUid,
    rawTags,
    pixelData,
    huData,
    minPixelValue: 300,
    maxPixelValue: 4000,
    fileName: 'DX_CHEST_PA.dcm'
  };

  const series: DicomSeries = {
    seriesInstanceUid: seriesUid,
    seriesNumber: 1,
    seriesDescription: 'Chest PA Digital Radiography',
    modality: 'DX',
    studyInstanceUid: studyUid,
    patientId,
    numberOfInstances: 1,
    instances: [instance],
    bodyPartExamined: 'CHEST',
    protocolName: 'CHEST PA'
  };

  return {
    studyInstanceUid: studyUid,
    studyDate: '20260819',
    studyTime: '130000',
    studyDescription: 'CHEST 1 VIEW PA',
    accessionNumber: 'ACC-89107',
    patientName,
    patientId,
    patientBirthDate: '19950311',
    patientSex: 'F',
    patientAge: '031Y',
    modalitiesInStudy: ['DX'],
    numberOfSeries: 1,
    numberOfInstances: 1,
    series: [series],
    source: 'sample',
    sourceName: 'Sample: Chest X-Ray'
  };
}

