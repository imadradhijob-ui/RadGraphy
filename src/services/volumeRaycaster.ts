import { Volume3D } from './mprEngine';

export type Volume3dPresetId = 'bone' | 'angio' | 'skin' | 'mip3d' | 'dental' | 'endo';

export interface Volume3dPreset {
  id: Volume3dPresetId;
  name: string;
  category: string;
  minThreshold: number;
  maxThreshold: number;
  specularPower: number;
  ambient: number;
  diffuse: number;
  opacityMultiplier: number;
  colorGrad: {
    r: number;
    g: number;
    b: number;
  };
}

export const VOLUME_3D_PRESETS: Volume3dPreset[] = [
  {
    id: 'bone',
    name: '3D Bone & Skeleton (Ivory / Gold)',
    category: 'Orthopedic / Skeletal',
    minThreshold: 140,
    maxThreshold: 1300,
    specularPower: 32,
    ambient: 0.22,
    diffuse: 0.78,
    opacityMultiplier: 0.85,
    colorGrad: { r: 235, g: 215, b: 175 }
  },
  {
    id: 'angio',
    name: '3D CT Angiography (Vascular Red)',
    category: 'Cardiovascular & Vessels',
    minThreshold: 90,
    maxThreshold: 550,
    specularPower: 24,
    ambient: 0.28,
    diffuse: 0.72,
    opacityMultiplier: 0.9,
    colorGrad: { r: 245, g: 45, b: 55 }
  },
  {
    id: 'skin',
    name: '3D Soft Tissue & Skin Surface',
    category: 'Facial & Superficial Anatomy',
    minThreshold: -250,
    maxThreshold: 180,
    specularPower: 12,
    ambient: 0.35,
    diffuse: 0.65,
    opacityMultiplier: 0.75,
    colorGrad: { r: 225, g: 175, b: 145 }
  },
  {
    id: 'dental',
    name: '3D Dental & Mandible High-Density',
    category: 'Maxillofacial / Teeth & Implants',
    minThreshold: 260,
    maxThreshold: 1800,
    specularPower: 40,
    ambient: 0.18,
    diffuse: 0.82,
    opacityMultiplier: 0.95,
    colorGrad: { r: 245, g: 240, b: 225 }
  },
  {
    id: 'mip3d',
    name: '3D MIP (Maximum Intensity Projection)',
    category: 'Vascular & Contrast 360° MIP',
    minThreshold: -100,
    maxThreshold: 1200,
    specularPower: 0,
    ambient: 1.0,
    diffuse: 0.0,
    opacityMultiplier: 1.0,
    colorGrad: { r: 255, g: 220, b: 180 }
  }
];

export interface Render3dOptions {
  yawDeg: number;
  pitchDeg: number;
  rollDeg?: number;
  zoom?: number;
  panX?: number;
  panY?: number;
  preset: Volume3dPreset;
  thresholdMin?: number;
  thresholdMax?: number;
  clipPlaneZ?: number; // 0.0 to 1.0 (clipping from top or bottom)
  enableAmbientOcclusion?: boolean;
  quality: 'fast' | 'high' | 'ultra';
}

/**
 * Ultra-High-Performance Cinematic 3D Volume Raycasting Engine
 * Features Trilinear Voxel Interpolation, Multi-Source Studio Lighting (Key, Fill, Rim),
 * Smoothstep S-Curve Opacity, Ambient Occlusion, and Early Ray Termination.
 */
export class VolumeRaycaster {
  static render(
    volume: Volume3D,
    width: number,
    height: number,
    options: Render3dOptions
  ): ImageData {
    const imgData = new ImageData(width, height);
    const data = imgData.data;
    const { dimX, dimY, dimZ, data: voxels, spacingX, spacingY, spacingZ } = volume;

    const {
      yawDeg,
      pitchDeg,
      zoom = 1.0,
      panX = 0,
      panY = 0,
      preset,
      thresholdMin = preset.minThreshold,
      thresholdMax = preset.maxThreshold,
      clipPlaneZ = 1.0,
      enableAmbientOcclusion = true,
      quality = 'high'
    } = options;

    const radYaw = (yawDeg * Math.PI) / 180;
    const radPitch = (pitchDeg * Math.PI) / 180;

    const cosY = Math.cos(radYaw);
    const sinY = Math.sin(radYaw);
    const cosP = Math.cos(radPitch);
    const sinP = Math.sin(radPitch);

    // Studio Lighting Directions (in camera space)
    // 1. Key Light (Top-Right Front)
    const kLx = 0.577, kLy = -0.577, kLz = 0.577;
    // 2. Fill Light (Soft Cool Blue from Bottom-Left Front)
    const fLx = -0.577, fLy = 0.577, fLz = 0.4;
    // 3. Rim Light (Back-Top)
    const rLx = 0.0, rLy = -0.8, rLz = -0.6;

    const physDimX = dimX * spacingX;
    const physDimY = dimY * spacingY;
    const physDimZ = dimZ * spacingZ;
    const maxPhysDim = Math.max(physDimX, physDimY, physDimZ);

    const cx = dimX / 2;
    const cy = dimY / 2;
    const cz = dimZ / 2;

    const isFast = quality === 'fast';
    const isUltra = quality === 'ultra';
    const stepSize = isUltra ? 0.45 : (isFast ? 1.6 : 0.8);
    const maxSteps = Math.floor((maxPhysDim * 1.6) / stepSize);

    const isMip = preset.id === 'mip3d';
    const isAngio = preset.id === 'angio';
    const isSkin = preset.id === 'skin';
    const isDental = preset.id === 'dental';

    const maxZLimit = Math.floor(dimZ * clipPlaneZ);
    const skipStep = isFast ? 2 : 1;

    const sliceSize = dimX * dimY;

    // Precomputed transfer constants
    const tfRange = Math.max(1, thresholdMax - thresholdMin);
    const tfMult = preset.opacityMultiplier;
    const minScreenDim = Math.min(width, height);

    for (let py = 0; py < height; py += skipStep) {
      // Millimeters along screen Y from center
      const sy = (((py - height / 2 - panY) / (minScreenDim * zoom)) * maxPhysDim);

      for (let px = 0; px < width; px += skipStep) {
        // Millimeters along screen X from center
        const sx = (((px - width / 2 - panX) / (minScreenDim * zoom)) * maxPhysDim);

        let accumR = 0;
        let accumG = 0;
        let accumB = 0;
        let accumA = 0;

        let maxHuMip = -1000;

        for (let s = -maxSteps / 2; s < maxSteps / 2; s += 1) {
          const sz = s * stepSize; // Millimeters along ray depth

          // 3D rotation in TRUE ISOTROPIC MILLIMETER SPACE
          const rx1 = sx * cosY - sz * sinY;
          const rz1 = sx * sinY + sz * cosY;

          const ry = sy * cosP - rz1 * sinP;
          const rz = sy * sinP + rz1 * cosP;
          const rx = rx1;

          // Convert rotated physical millimeter position to voxel indices
          const vx = rx / spacingX + cx;
          const vy = ry / spacingY + cy;
          const vz = rz / spacingZ + cz;

          if (vx >= 1 && vx < dimX - 2 && vy >= 1 && vy < dimY - 2 && vz >= 0 && vz < maxZLimit - 1) {
            // High quality trilinear sampling
            let hu: number;
            const ivx = Math.floor(vx);
            const ivy = Math.floor(vy);
            const ivz = Math.floor(vz);

            if (isFast) {
              hu = voxels[ivz * sliceSize + ivy * dimX + ivx];
            } else {
              const fx = vx - ivx;
              const fy = vy - ivy;
              const fz = vz - ivz;

              const z0Off = ivz * sliceSize;
              const z1Off = (ivz + 1) * sliceSize;
              const y0Off = ivy * dimX;
              const y1Off = (ivy + 1) * dimX;

              const v000 = voxels[z0Off + y0Off + ivx];
              const v100 = voxels[z0Off + y0Off + ivx + 1];
              const v010 = voxels[z0Off + y1Off + ivx];
              const v110 = voxels[z0Off + y1Off + ivx + 1];

              const v001 = voxels[z1Off + y0Off + ivx];
              const v101 = voxels[z1Off + y0Off + ivx + 1];
              const v011 = voxels[z1Off + y1Off + ivx];
              const v111 = voxels[z1Off + y1Off + ivx + 1];

              const i1 = v000 + (v100 - v000) * fx;
              const i2 = v010 + (v110 - v010) * fx;
              const j1 = v001 + (v101 - v001) * fx;
              const j2 = v011 + (v111 - v011) * fx;

              const w1 = i1 + (i2 - i1) * fy;
              const w2 = j1 + (j2 - j1) * fy;

              hu = w1 + (w2 - w1) * fz;
            }

            if (isMip) {
              if (hu > maxHuMip) maxHuMip = hu;
            } else if (hu >= thresholdMin) {
              // Smoothstep S-Curve Opacity Function (3t^2 - 2t^3)
              const tRaw = Math.min(1.0, Math.max(0.0, (hu - thresholdMin) / tfRange));
              const t = tRaw * tRaw * (3 - 2 * tRaw);
              let sampleAlpha = t * tfMult * (isUltra ? 0.35 : (isFast ? 0.6 : 0.45));

              // Central difference 3D gradient for silky smooth surface normal
              const vIdx = ivz * sliceSize + ivy * dimX + ivx;
              const nx = (voxels[vIdx + 1] - voxels[vIdx - 1]) / (2 * spacingX);
              const ny = (voxels[vIdx + dimX] - voxels[vIdx - dimX]) / (2 * spacingY);
              const nz = (voxels[vIdx + sliceSize] - voxels[vIdx - sliceSize]) / (2 * spacingZ);

              const gradLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
              let diffuse = preset.diffuse;
              let specular = 0;
              let aoFactor = 1.0;

              if (gradLen > 6) {
                const invLen = 1.0 / gradLen;
                const nnx = nx * invLen;
                const nny = ny * invLen;
                const nnz = nz * invLen;

                // Rotate normal to camera space
                const cnx1 = nnx * cosY + nnz * sinY;
                const cnz1 = -nnx * sinY + nnz * cosY;
                const cny = nny * cosP + cnz1 * sinP;
                const cnz = -nny * sinP + cnz1 * cosP;
                const cnx = cnx1;

                // 1. Key Light
                const nDotKey = Math.max(0, cnx * kLx + cny * kLy + cnz * kLz);
                // 2. Soft Fill Light (cool blue)
                const nDotFill = Math.max(0, cnx * fLx + cny * fLy + cnz * fLz);
                // 3. Rim Light (silhouette highlight)
                const nDotRim = Math.max(0, cnx * rLx + cny * rLy + cnz * rLz);

                diffuse = preset.ambient + preset.diffuse * (nDotKey * 0.85 + nDotFill * 0.25 + nDotRim * 0.2);

                if (preset.specularPower > 0 && nDotKey > 0) {
                  // Blinn-Phong Half-Vector Specular
                  const hx = kLx;
                  const hy = kLy;
                  const hz = kLz + 1.0;
                  const hLen = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
                  const nDotH = Math.max(0, (cnx * hx + cny * hy + cnz * hz) / hLen);
                  specular = Math.pow(nDotH, preset.specularPower) * 0.55;
                }

                // Ambient Occlusion cavity darkening
                if (enableAmbientOcclusion && !isFast) {
                  const aoStepX = Math.round(nnx * 2.5);
                  const aoStepY = Math.round(nny * 2.5);
                  const aoStepZ = Math.round(nnz * 2.5);
                  const aoVx = ivx + aoStepX;
                  const aoVy = ivy + aoStepY;
                  const aoVz = ivz + aoStepZ;
                  if (aoVx >= 0 && aoVx < dimX && aoVy >= 0 && aoVy < dimY && aoVz >= 0 && aoVz < dimZ) {
                    const aoHu = voxels[aoVz * sliceSize + aoVy * dimX + aoVx];
                    if (aoHu > thresholdMin) {
                      aoFactor = 0.75; // Inside a cavity or joint groove
                    }
                  }
                }
              }

              let baseR = preset.colorGrad.r;
              let baseG = preset.colorGrad.g;
              let baseB = preset.colorGrad.b;

              if (isAngio) {
                if (hu > 240) {
                  // Bone in angio mode -> Soft Ivory Translucent
                  baseR = 220; baseG = 220; baseB = 210;
                  sampleAlpha *= 0.45;
                } else {
                  // Vessels / Contrast -> Crimson Red / Coral
                  baseR = 250; baseG = 30; baseB = 40;
                  sampleAlpha *= 0.95;
                }
              } else if (isSkin) {
                // Lifelike skin tones with warmth
                baseR = Math.round(220 + t * 30);
                baseG = Math.round(160 + t * 25);
                baseB = Math.round(135 + t * 25);
              } else if (isDental) {
                // High density dental enamel & gold
                baseR = Math.round(245 + t * 10);
                baseG = Math.round(235 + t * 15);
                baseB = Math.round(210 + t * 25);
              } else {
                // RadiAnt Bone Gold & Ivory
                baseR = Math.round(225 + t * 30);
                baseG = Math.round(195 + t * 40);
                baseB = Math.round(150 + t * 50);
              }

              const cr = Math.min(255, Math.round((baseR * diffuse * aoFactor + specular * 255)));
              const cg = Math.min(255, Math.round((baseG * diffuse * aoFactor + specular * 255)));
              const cb = Math.min(255, Math.round((baseB * diffuse * aoFactor + specular * 255)));

              // Front-to-Back Alpha Compositing
              const weight = (1.0 - accumA) * sampleAlpha;
              accumR += cr * weight;
              accumG += cg * weight;
              accumB += cb * weight;
              accumA += weight;

              if (accumA >= 0.97) {
                break; // Early Ray Termination
              }
            }
          }
        }

        let outR = Math.min(255, Math.round(accumR));
        let outG = Math.min(255, Math.round(accumG));
        let outB = Math.min(255, Math.round(accumB));
        let outA = Math.min(255, Math.round(accumA * 255));

        if (isMip) {
          if (maxHuMip >= thresholdMin) {
            const norm = Math.min(1.0, (maxHuMip - thresholdMin) / tfRange);
            outR = Math.round(255 * norm);
            outG = Math.round(220 * norm);
            outB = Math.round(180 * norm);
            outA = 255;
          } else {
            outR = 0; outG = 0; outB = 0; outA = 0;
          }
        }

        if (skipStep === 1) {
          const idx = (py * width + px) * 4;
          data[idx] = outR;
          data[idx + 1] = outG;
          data[idx + 2] = outB;
          data[idx + 3] = outA;
        } else {
          // Fill 2x2 block for 60 FPS fast preview
          for (let dy = 0; dy < skipStep; dy++) {
            for (let dx = 0; dx < skipStep; dx++) {
              const idx = ((py + dy) * width + (px + dx)) * 4;
              data[idx] = outR;
              data[idx + 1] = outG;
              data[idx + 2] = outB;
              data[idx + 3] = outA;
            }
          }
        }
      }
    }

    return imgData;
  }
}
