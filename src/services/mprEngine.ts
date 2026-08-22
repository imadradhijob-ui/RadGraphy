import { DicomInstance, DicomSeries, MprPlane } from '../types/dicom';
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

export class MprEngine {
  /**
   * Constructs a contiguous 3D voxel volume from a sorted series of DICOM instances
   */
  static buildVolume(series: DicomSeries): Volume3D | null {
    if (!series.instances || series.instances.length < 2) {
      return null;
    }

    const instances = series.instances;
    const dimZ = instances.length;
    const firstInst = instances[0];
    const dimX = firstInst.columns;
    const dimY = firstInst.rows;

    const spacingX = firstInst.pixelSpacing?.[1] || 1.0;
    const spacingY = firstInst.pixelSpacing?.[0] || 1.0;
    
    // Accurate physical Z-spacing calculation from ImagePositionPatient or sliceLocation across full series
    let spacingZ = firstInst.sliceThickness || 1.0;
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
          spacingZ = totalDist / (instances.length - 1);
        }
      } else if (instances[0].sliceLocation !== undefined && instances[instances.length - 1].sliceLocation !== undefined) {
        const p0 = instances[0].sliceLocation;
        const pN = instances[instances.length - 1].sliceLocation;
        const totalDist = Math.abs(pN - p0);
        if (totalDist > 0.05) {
          spacingZ = totalDist / (instances.length - 1);
        }
      } else if (firstInst.rawTags?.['(0018,0088)']?.value) {
        const val = parseFloat(String(firstInst.rawTags['(0018,0088)'].value));
        if (!isNaN(val) && val > 0.05) spacingZ = val;
      }
    }

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
        scaleY: 1.0,
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
        const zOffset = (dimZ - 1 - z) * dimX * dimY; // Superior is up
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
        const zOffset = (dimZ - 1 - z) * dimX * dimY;
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
