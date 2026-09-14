import { DicomInstance, DicomSeries, DicomStudy, MprPlane } from '../types/dicom';
import { getOrDecodeInstancePixels } from './dicomParser';

export type ProjectionMode = 'none' | 'mip' | 'minip' | 'avg';

export interface Volume3D {
  data: Int16Array;
  dimX: number;
  dimY: number;
  dimZ: number;
  spacingX: number; // mm
  spacingY: number; // mm
  spacingZ: number; // mm
  minHu: number;
  maxHu: number;
  windowCenter: number;
  windowWidth: number;
  instances: DicomInstance[];
}

export interface MprSliceResult {
  width: number;
  height: number;
  huData: Int16Array;
  pixelSpacing: [number, number]; // [rowSpacing, colSpacing]
  scaleY: number; // Aspect ratio correction scale
  aspectRatio: number;
}

/**
 * Helper to identify anatomical acquisition plane (Axial, Coronal, Sagittal) from series description or IOP.
 * Prioritizes explicit series description naming as designated by the radiologist/technician.
 */
export function detectAnatomicalPlane(
  description: string = '',
  iop?: [number, number, number, number, number, number]
): 'AXIAL' | 'CORONAL' | 'SAGITTAL' | null {
  const d = (description || '').toLowerCase().trim();

  // 1. Primary: Series Description parsing (Always respects human naming by radiologist / scanner)
  if (
    /(?:^|[^a-z0-9])(coronal|cor)(?:[^a-z0-9]|$)/i.test(d) ||
    d.includes('coronal') ||
    d.startsWith('cor ') ||
    d.endsWith(' cor') ||
    d.includes('_cor') ||
    d.includes('cor_') ||
    d.includes('-cor') ||
    d.includes('cor-')
  ) {
    return 'CORONAL';
  }

  if (
    /(?:^|[^a-z0-9])(sagittal|sag)(?:[^a-z0-9]|$)/i.test(d) ||
    d.includes('sagittal') ||
    d.startsWith('sag ') ||
    d.endsWith(' sag') ||
    d.includes('_sag') ||
    d.includes('sag_') ||
    d.includes('-sag') ||
    d.includes('sag-')
  ) {
    return 'SAGITTAL';
  }

  if (
    /(?:^|[^a-z0-9])(axial|axi|ax|transverse|tra)(?:[^a-z0-9]|$)/i.test(d) ||
    d.includes('axial') ||
    d.includes('transverse') ||
    d.startsWith('ax ') ||
    d.endsWith(' ax') ||
    d.includes('_ax') ||
    d.includes('ax_') ||
    d.includes('-ax') ||
    d.includes('ax-') ||
    d.startsWith('tra ') ||
    d.endsWith(' tra') ||
    d.includes('_tra') ||
    d.includes('tra_')
  ) {
    return 'AXIAL';
  }

  // 2. Secondary: Image Orientation Patient (0020,0037) fallback when description is generic
  if (iop && iop.length >= 6) {
    const nx = iop[1] * iop[5] - iop[2] * iop[4];
    const ny = iop[2] * iop[3] - iop[0] * iop[5];
    const nz = iop[0] * iop[4] - iop[1] * iop[3];
    const absX = Math.abs(nx);
    const absY = Math.abs(ny);
    const absZ = Math.abs(nz);
    const maxNorm = Math.max(absX, absY, absZ);
    if (maxNorm > 0.4) {
      if (absZ >= absX && absZ >= absY) return 'AXIAL';
      if (absY >= absX && absY >= absZ) return 'CORONAL';
      if (absX >= absY && absX >= absZ) return 'SAGITTAL';
    }
  }

  return null;
}

/**
 * Detects if a series is a Topogram / Scout / Localizer or single-slice reference image
 * which should NEVER be used as a 3D volumetric series or selected for MPR planes.
 */
export function isTopogramOrSingleSlice(series?: DicomSeries | null): boolean {
  if (!series || !series.instances || series.instances.length <= 1) return true;
  const d = (series.seriesDescription || '').toLowerCase().trim();
  return (
    d.includes('topogram') ||
    d.includes('scout') ||
    d.includes('localizer') ||
    d.includes('survey') ||
    d.includes('surv') ||
    d.includes('scanogram') ||
    d.includes('pilot') ||
    d.includes('topo')
  );
}

/**
 * Finds the primary 3D volumetric series of a study (e.g. 770-slice Axial CT scan),
 * strictly ignoring topograms, scouts, and single-slice images.
 * Prefers the multi-slice AXIAL acquisition with the highest instance count.
 */
export function findMainVolumetricSeries(study?: DicomStudy | null): DicomSeries | null {
  if (!study || !study.series || study.series.length === 0) return null;

  // 1. Filter out topograms, scouts, and series with <= 1 slice
  const candidates = study.series.filter(
    (s) => !isTopogramOrSingleSlice(s) && s.instances && s.instances.length >= 2
  );

  if (candidates.length === 0) {
    // Fallback if every series is small or single-slice: pick series with highest instances
    return [...study.series].sort((a, b) => (b.instances?.length || 0) - (a.instances?.length || 0))[0] || null;
  }

  // 2. Sort by number of slices descending
  candidates.sort((a, b) => b.instances.length - a.instances.length);

  // 3. Prefer AXIAL multi-slice acquisition (standard CT/MRI volume)
  const bestAxial = candidates.find((s) => {
    const rep = s.instances[Math.floor(s.instances.length / 2)] || s.instances[0];
    return detectAnatomicalPlane(s.seriesDescription, rep?.imageOrientationPatient) === 'AXIAL';
  });

  return bestAxial || candidates[0];
}

export class MprEngine {
  /**
   * Constructs a contiguous 3D voxel volume from a sorted series of DICOM instances,
   * canonicalizing axes so:
   *   dimX = Right-to-Left (Lateral)
   *   dimY = Anterior-to-Posterior (Frontal)
   *   dimZ = Superior-to-Inferior (Head-to-Feet)
   * regardless of whether the source series was acquired in Axial, Coronal, or Sagittal.
   */
  static buildVolume(series: DicomSeries): Volume3D | null {
    if (!series.instances || series.instances.length < 2) {
      return null;
    }

    const firstRep = series.instances[0];
    const repIop = firstRep.imageOrientationPatient;
    const detectedPlane = detectAnatomicalPlane(series.seriesDescription, repIop) || 'AXIAL';

    // Sort instances to match natural acquisition sequence (1..N) or anatomical ordering
    const instances = [...series.instances].sort((a, b) => {
      // Primary: standard instanceNumber acquisition order
      if (a.instanceNumber !== undefined && b.instanceNumber !== undefined && a.instanceNumber !== b.instanceNumber) {
        return a.instanceNumber - b.instanceNumber;
      }
      if (detectedPlane === 'CORONAL') {
        const yA = a.imagePositionPatient?.[1];
        const yB = b.imagePositionPatient?.[1];
        if (yA !== undefined && yB !== undefined) return yA - yB;
      } else if (detectedPlane === 'SAGITTAL') {
        const xA = a.imagePositionPatient?.[0];
        const xB = b.imagePositionPatient?.[0];
        if (xA !== undefined && xB !== undefined) return xA - xB;
      } else {
        // Fallback: anatomical Head to Feet (Superior to Inferior)
        const zA = a.imagePositionPatient?.[2] ?? a.sliceLocation;
        const zB = b.imagePositionPatient?.[2] ?? b.sliceLocation;
        if (zA !== undefined && zB !== undefined && Math.abs(zA - zB) > 0.001) {
          return zB - zA; // Higher Z (Head) to lower Z (Feet)
        }
      }
      return 0;
    });

    // Ensure slice orientation matches standard LPS coordinates:
    if (instances.length >= 2) {
      if (detectedPlane === 'AXIAL') {
        const z0 = instances[0].imagePositionPatient?.[2] ?? instances[0].sliceLocation;
        const zN = instances[instances.length - 1].imagePositionPatient?.[2] ?? instances[instances.length - 1].sliceLocation;
        if (z0 !== undefined && zN !== undefined && z0 < zN) {
          instances.reverse();
        }
      } else if (detectedPlane === 'CORONAL') {
        const y0 = instances[0].imagePositionPatient?.[1];
        const yN = instances[instances.length - 1].imagePositionPatient?.[1];
        if (y0 !== undefined && yN !== undefined && y0 > yN) {
          instances.reverse();
        }
      } else if (detectedPlane === 'SAGITTAL') {
        const x0 = instances[0].imagePositionPatient?.[0];
        const xN = instances[instances.length - 1].imagePositionPatient?.[0];
        if (x0 !== undefined && xN !== undefined && x0 > xN) {
          instances.reverse();
        }
      }
    }

    const firstInst = instances[0];
    const rawCols = firstInst.columns;
    const rawRows = firstInst.rows;
    const rawSlices = instances.length;

    const rawPixelSpacingX = firstInst.pixelSpacing?.[1] || 1.0;
    const rawPixelSpacingY = firstInst.pixelSpacing?.[0] || 1.0;
    
    // Accurate physical slice spacing calculation
    let sliceSpacing = firstInst.sliceThickness || 1.0;
    if (instances.length >= 2) {
      if (instances[0].imagePositionPatient && instances[instances.length - 1].imagePositionPatient) {
        const p0 = instances[0].imagePositionPatient;
        const pN = instances[instances.length - 1].imagePositionPatient;
        const totalDist = Math.sqrt(
          Math.pow(pN[0] - p0[0], 2) +
          Math.pow(pN[1] - p0[1], 2) +
          Math.pow(pN[2] - p0[2], 2)
        );
        if (totalDist > 0.05) {
          sliceSpacing = totalDist / (instances.length - 1);
        }
      } else if (instances[0].sliceLocation !== undefined && instances[instances.length - 1].sliceLocation !== undefined) {
        const p0 = instances[0].sliceLocation;
        const pN = instances[instances.length - 1].sliceLocation;
        const totalDist = Math.abs(pN - p0);
        if (totalDist > 0.05) {
          sliceSpacing = totalDist / (instances.length - 1);
        }
      } else if (firstInst.rawTags?.['(0018,0088)']?.value) {
        const val = parseFloat(String(firstInst.rawTags['(0018,0088)'].value));
        if (!isNaN(val) && val > 0.05) sliceSpacing = val;
      }
    }

    const dimX = rawCols;
    const dimY = rawRows;
    const dimZ = rawSlices;
    const spacingX = rawPixelSpacingX;
    const spacingY = rawPixelSpacingY;
    const spacingZ = sliceSpacing;

    const totalVoxels = dimX * dimY * dimZ;
    const volumeData = new Int16Array(totalVoxels);

    let globalMin = Infinity;
    let globalMax = -Infinity;

    for (let z = 0; z < dimZ; z++) {
      const inst = instances[z];
      const sliceOffset = z * dimX * dimY;
      const { huData } = getOrDecodeInstancePixels(inst);

      for (let i = 0; i < dimX * dimY; i++) {
        const val = huData[i] !== undefined ? huData[i] : -1000;
        volumeData[sliceOffset + i] = val;
        if (val < globalMin) globalMin = val;
        if (val > globalMax) globalMax = val;
      }
    }

    return {
      data: volumeData,
      dimX,
      dimY,
      dimZ,
      spacingX,
      spacingY,
      spacingZ,
      minHu: globalMin === Infinity ? -1000 : globalMin,
      maxHu: globalMax === -Infinity ? 1000 : globalMax,
      windowCenter: firstInst.windowCenter || 40,
      windowWidth: firstInst.windowWidth || 400,
      instances
    };
  }

  /**
   * Extracts a 2D resampled slice from the 3D volume with Projection Modes (MIP, MinIP, Average)
   * and aspect ratio preservation.
   */
  static getSlice(
    volume: Volume3D,
    plane: MprPlane,
    crosshair: { x: number; y: number; z: number },
    projectionMode: ProjectionMode = 'none',
    slabThicknessMm: number = 2.5
  ): MprSliceResult {
    const { dimX, dimY, dimZ, spacingX, spacingY, spacingZ, data } = volume;

    if (plane === 'axial') {
      // Axial: Slice along Z (dimension: dimX x dimY)
      const targetZ = Math.max(0, Math.min(dimZ - 1, Math.round(crosshair.z)));
      const sliceSize = dimX * dimY;
      const sliceHu = new Int16Array(sliceSize);

      const slabSlices = Math.max(1, Math.round(slabThicknessMm / spacingZ));

      if (projectionMode === 'mip' && slabSlices > 1) {
        const minZ = Math.max(0, targetZ - Math.floor(slabSlices / 2));
        const maxZ = Math.min(dimZ - 1, targetZ + Math.floor(slabSlices / 2));
        for (let i = 0; i < sliceSize; i++) {
          let maxVal = -Infinity;
          for (let z = minZ; z <= maxZ; z++) {
            const v = data[z * sliceSize + i];
            if (v > maxVal) maxVal = v;
          }
          sliceHu[i] = maxVal;
        }
      } else if (projectionMode === 'minip' && slabSlices > 1) {
        const minZ = Math.max(0, targetZ - Math.floor(slabSlices / 2));
        const maxZ = Math.min(dimZ - 1, targetZ + Math.floor(slabSlices / 2));
        for (let i = 0; i < sliceSize; i++) {
          let minVal = Infinity;
          for (let z = minZ; z <= maxZ; z++) {
            const v = data[z * sliceSize + i];
            if (v < minVal) minVal = v;
          }
          sliceHu[i] = minVal;
        }
      } else if (projectionMode === 'avg' && slabSlices > 1) {
        const minZ = Math.max(0, targetZ - Math.floor(slabSlices / 2));
        const maxZ = Math.min(dimZ - 1, targetZ + Math.floor(slabSlices / 2));
        const count = maxZ - minZ + 1;
        for (let i = 0; i < sliceSize; i++) {
          let sum = 0;
          for (let z = minZ; z <= maxZ; z++) {
            sum += data[z * sliceSize + i];
          }
          sliceHu[i] = Math.round(sum / count);
        }
      } else {
        const offset = targetZ * sliceSize;
        sliceHu.set(data.subarray(offset, offset + sliceSize));
      }

      return {
        width: dimX,
        height: dimY,
        huData: sliceHu,
        pixelSpacing: [spacingY, spacingX],
        scaleY: spacingX > 0 ? (spacingY / spacingX) : 1.0,
        aspectRatio: (dimY * spacingY) / (dimX * spacingX)
      };
    } else if (plane === 'coronal') {
      // Coronal: Slice along Y (Frontal view: width=dimX, height=dimZ)
      const targetY = Math.max(0, Math.min(dimY - 1, Math.round(crosshair.y)));
      const width = dimX;
      const height = dimZ;
      const sliceHu = new Int16Array(width * height);

      const slabSlices = Math.max(1, Math.round(slabThicknessMm / spacingY));

      for (let z = 0; z < dimZ; z++) {
        const zOffset = z * dimX * dimY; // Superior (Head) is at z=0 (top of image)
        for (let x = 0; x < dimX; x++) {
          const outIdx = z * width + x;

          if (projectionMode === 'mip' && slabSlices > 1) {
            const minY = Math.max(0, targetY - Math.floor(slabSlices / 2));
            const maxY = Math.min(dimY - 1, targetY + Math.floor(slabSlices / 2));
            let maxVal = -Infinity;
            for (let y = minY; y <= maxY; y++) {
              const v = data[zOffset + y * dimX + x];
              if (v > maxVal) maxVal = v;
            }
            sliceHu[outIdx] = maxVal;
          } else if (projectionMode === 'minip' && slabSlices > 1) {
            const minY = Math.max(0, targetY - Math.floor(slabSlices / 2));
            const maxY = Math.min(dimY - 1, targetY + Math.floor(slabSlices / 2));
            let minVal = Infinity;
            for (let y = minY; y <= maxY; y++) {
              const v = data[zOffset + y * dimX + x];
              if (v < minVal) minVal = v;
            }
            sliceHu[outIdx] = minVal;
          } else if (projectionMode === 'avg' && slabSlices > 1) {
            const minY = Math.max(0, targetY - Math.floor(slabSlices / 2));
            const maxY = Math.min(dimY - 1, targetY + Math.floor(slabSlices / 2));
            let sum = 0;
            const count = maxY - minY + 1;
            for (let y = minY; y <= maxY; y++) {
              sum += data[zOffset + y * dimX + x];
            }
            sliceHu[outIdx] = Math.round(sum / count);
          } else {
            sliceHu[outIdx] = data[zOffset + targetY * dimX + x];
          }
        }
      }

      const scaleY = spacingZ / spacingX;

      return {
        width,
        height,
        huData: sliceHu,
        pixelSpacing: [spacingZ, spacingX],
        scaleY,
        aspectRatio: (height * spacingZ) / (width * spacingX)
      };
    } else {
      // Sagittal: Slice along X (Lateral view: width=dimY, height=dimZ)
      const targetX = Math.max(0, Math.min(dimX - 1, Math.round(crosshair.x)));
      const width = dimY;
      const height = dimZ;
      const sliceHu = new Int16Array(width * height);

      const slabSlices = Math.max(1, Math.round(slabThicknessMm / spacingX));

      for (let z = 0; z < dimZ; z++) {
        const zOffset = z * dimX * dimY; // Superior (Head) is at z=0 (top of image)
        for (let y = 0; y < dimY; y++) {
          const outIdx = z * width + y;

          if (projectionMode === 'mip' && slabSlices > 1) {
            const minX = Math.max(0, targetX - Math.floor(slabSlices / 2));
            const maxX = Math.min(dimX - 1, targetX + Math.floor(slabSlices / 2));
            let maxVal = -Infinity;
            for (let x = minX; x <= maxX; x++) {
              const v = data[zOffset + y * dimX + x];
              if (v > maxVal) maxVal = v;
            }
            sliceHu[outIdx] = maxVal;
          } else if (projectionMode === 'minip' && slabSlices > 1) {
            const minX = Math.max(0, targetX - Math.floor(slabSlices / 2));
            const maxX = Math.min(dimX - 1, targetX + Math.floor(slabSlices / 2));
            let minVal = Infinity;
            for (let x = minX; x <= maxX; x++) {
              const v = data[zOffset + y * dimX + x];
              if (v < minVal) minVal = v;
            }
            sliceHu[outIdx] = minVal;
          } else if (projectionMode === 'avg' && slabSlices > 1) {
            const minX = Math.max(0, targetX - Math.floor(slabSlices / 2));
            const maxX = Math.min(dimX - 1, targetX + Math.floor(slabSlices / 2));
            let sum = 0;
            const count = maxX - minX + 1;
            for (let x = minX; x <= maxX; x++) {
              sum += data[zOffset + y * dimX + x];
            }
            sliceHu[outIdx] = Math.round(sum / count);
          } else {
            sliceHu[outIdx] = data[zOffset + y * dimX + targetX];
          }
        }
      }

      const scaleY = spacingZ / spacingY;

      return {
        width,
        height,
        huData: sliceHu,
        pixelSpacing: [spacingZ, spacingY],
        scaleY,
        aspectRatio: (height * spacingZ) / (width * spacingY)
      };
    }
  }

  /**
   * Generates a 3D Volume Raymarching / 3D MIP preview
   */
  static render3dVolumeMIP(
    volume: Volume3D,
    angleYawDeg: number,
    anglePitchDeg: number,
    outWidth: number,
    outHeight: number
  ): ImageData {
    const imgData = new ImageData(outWidth, outHeight);
    const data = imgData.data;
    const { dimX, dimY, dimZ, data: voxels } = volume;

    const radYaw = (angleYawDeg * Math.PI) / 180;
    const radPitch = (anglePitchDeg * Math.PI) / 180;

    const cosY = Math.cos(radYaw);
    const sinY = Math.sin(radYaw);
    const cosP = Math.cos(radPitch);
    const sinP = Math.sin(radPitch);

    const cx = dimX / 2;
    const cy = dimY / 2;
    const cz = dimZ / 2;

    const numSteps = 50;
    const maxDim = Math.max(dimX, dimY, dimZ);

    for (let py = 0; py < outHeight; py += 2) {
      const sy = (py / outHeight - 0.5) * maxDim;
      for (let px = 0; px < outWidth; px += 2) {
        const sx = (px / outWidth - 0.5) * maxDim;

        let maxHu = -1000;

        for (let s = -numSteps / 2; s < numSteps / 2; s++) {
          const sz = (s / numSteps) * maxDim;

          // Rotate ray point
          const rx1 = sx * cosY - sz * sinY;
          const rz1 = sx * sinY + sz * cosY;

          const ry = sy * cosP - rz1 * sinP;
          const rz = sy * sinP + rz1 * cosP;
          const rx = rx1;

          const vx = Math.floor(rx + cx);
          const vy = Math.floor(ry + cy);
          const vz = Math.floor(rz + cz);

          if (vx >= 0 && vx < dimX && vy >= 0 && vy < dimY && vz >= 0 && vz < dimZ) {
            const hu = voxels[vz * dimX * dimY + vy * dimX + vx];
            if (hu > maxHu) {
              maxHu = hu;
            }
          }
        }

        // Map HU to shading color
        let r = 0, g = 0, b = 0, a = 255;
        if (maxHu > 150) {
          // Bone / High density (Cream / Amber glow)
          const norm = Math.min(1.0, (maxHu - 150) / 1000);
          r = Math.round(200 + norm * 55);
          g = Math.round(180 + norm * 60);
          b = Math.round(150 + norm * 50);
        } else if (maxHu > -100) {
          // Soft tissue (Warm tint)
          const norm = Math.min(1.0, (maxHu + 100) / 250);
          r = Math.round(120 * norm);
          g = Math.round(80 * norm);
          b = Math.round(60 * norm);
        } else {
          a = 0; // Air transparent
        }

        // Fill 2x2 block
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const idx = ((py + dy) * outWidth + (px + dx)) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = a;
          }
        }
      }
    }

    return imgData;
  }
}
