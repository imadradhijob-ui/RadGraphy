import { Volume3D } from './mprEngine';

export type Volume3dPresetId =
  | 'cinematic_bone'
  | 'bone'
  | 'bone_tissue'
  | 'angio'
  | 'skin'
  | 'dental'
  | 'pulmonary'
  | 'brain'
  | 'mip3d'
  | 'endo';

export interface Volume3dPreset {
  id: Volume3dPresetId;
  name: string;
  category: string;
  minThreshold: number;
  maxThreshold: number;
  specularPower: number;
  specularIntensity?: number;
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
    name: 'RadiAnt Bone & Skeleton (Ivory & Gold)',
    category: 'Orthopedic / Skeletal',
    minThreshold: 140,
    maxThreshold: 1300,
    specularPower: 48,
    specularIntensity: 0.80,
    ambient: 0.22,
    diffuse: 0.82,
    opacityMultiplier: 0.90,
    colorGrad: { r: 245, g: 235, b: 215 }
  },
  {
    id: 'bone_tissue',
    name: 'RadiAnt Bone + Soft Tissue (Composite)',
    category: 'Full Anatomy / Skin Envelope',
    minThreshold: -250,
    maxThreshold: 1200,
    specularPower: 40,
    specularIntensity: 0.65,
    ambient: 0.26,
    diffuse: 0.76,
    opacityMultiplier: 0.88,
    colorGrad: { r: 235, g: 185, b: 160 }
  },
  {
    id: 'angio',
    name: 'RadiAnt CT Angiography (Vascular Contrast)',
    category: 'Cardiovascular & Vessels',
    minThreshold: 90,
    maxThreshold: 550,
    specularPower: 42,
    specularIntensity: 0.85,
    ambient: 0.24,
    diffuse: 0.78,
    opacityMultiplier: 0.95,
    colorGrad: { r: 245, g: 35, b: 45 }
  },
  {
    id: 'cinematic_bone',
    name: 'Cinematic Skull & Bone (Ultra-HD)',
    category: 'Cinematic Skeletal (Porcelain)',
    minThreshold: 180,
    maxThreshold: 1600,
    specularPower: 64,
    specularIntensity: 0.90,
    ambient: 0.20,
    diffuse: 0.85,
    opacityMultiplier: 0.96,
    colorGrad: { r: 250, g: 245, b: 238 }
  },
  {
    id: 'skin',
    name: 'RadiAnt Skin & Facial Anatomy',
    category: 'Facial & Superficial Anatomy',
    minThreshold: -260,
    maxThreshold: 180,
    specularPower: 16,
    specularIntensity: 0.35,
    ambient: 0.32,
    diffuse: 0.68,
    opacityMultiplier: 0.82,
    colorGrad: { r: 228, g: 172, b: 146 }
  },
  {
    id: 'dental',
    name: 'RadiAnt Dental & Maxillofacial',
    category: 'Maxillofacial / Teeth & Enamel',
    minThreshold: 240,
    maxThreshold: 1800,
    specularPower: 60,
    specularIntensity: 0.88,
    ambient: 0.18,
    diffuse: 0.84,
    opacityMultiplier: 0.96,
    colorGrad: { r: 250, g: 246, b: 236 }
  },
  {
    id: 'pulmonary',
    name: 'RadiAnt Pulmonary & Airway',
    category: 'Thoracic / Trachea & Bronchi',
    minThreshold: -950,
    maxThreshold: -200,
    specularPower: 32,
    specularIntensity: 0.65,
    ambient: 0.30,
    diffuse: 0.70,
    opacityMultiplier: 0.85,
    colorGrad: { r: 60, g: 210, b: 245 }
  },
  {
    id: 'brain',
    name: 'RadiAnt Brain & Parenchyma (Neuro)',
    category: 'Neuro / Brain Soft Tissue',
    minThreshold: 20,
    maxThreshold: 120,
    specularPower: 22,
    specularIntensity: 0.40,
    ambient: 0.30,
    diffuse: 0.72,
    opacityMultiplier: 0.90,
    colorGrad: { r: 235, g: 198, b: 184 }
  },
  {
    id: 'mip3d',
    name: 'RadiAnt 3D MIP (Maximum Intensity)',
    category: 'Vascular & Contrast 360° MIP',
    minThreshold: -100,
    maxThreshold: 1200,
    specularPower: 0,
    specularIntensity: 0,
    ambient: 1.0,
    diffuse: 0.0,
    opacityMultiplier: 1.0,
    colorGrad: { r: 255, g: 225, b: 185 }
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
  clipMin?: [number, number, number]; // [x, y, z] 0.0 to 1.0
  clipMax?: [number, number, number]; // [x, y, z] 0.0 to 1.0
  clipPlaneZ?: number; // legacy 0.0 to 1.0
  enableAmbientOcclusion?: boolean;
  specularPower?: number;
  specularIntensity?: number;
  gamma?: number;
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
      clipMin = [0, 0, 0],
      clipMax = [1, 1, 1],
      clipPlaneZ = 1.0,
      enableAmbientOcclusion = true,
      specularPower = preset.specularPower,
      specularIntensity = preset.specularIntensity ?? 0.75,
      gamma = 2.2,
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
    const isBoneTissue = preset.id === 'bone_tissue';
    const isPulmonary = preset.id === 'pulmonary';

    // 6-axis crop limits
    const effClipZMax = Math.min(clipMax[2], clipPlaneZ);
    const minXLimit = Math.floor(dimX * clipMin[0]);
    const maxXLimit = Math.floor(dimX * clipMax[0]);
    const minYLimit = Math.floor(dimY * clipMin[1]);
    const maxYLimit = Math.floor(dimY * clipMax[1]);
    const minZLimit = Math.floor(dimZ * clipMin[2]);
    const maxZLimit = Math.floor(dimZ * effClipZMax);

    const skipStep = isFast ? 2 : 1;
    const sliceSize = dimX * dimY;

    // Precomputed transfer constants
    const tfRange = Math.max(1, thresholdMax - thresholdMin);
    const tfMult = preset.opacityMultiplier;
    const minScreenDim = Math.min(width, height);
    const baseScale = (minScreenDim * 0.82) * zoom;
    const invGamma = 1.0 / (gamma || 2.2);

    for (let py = 0; py < height; py += skipStep) {
      // Millimeters along screen Y from center
      const sy = ((py - height / 2 - panY) / baseScale) * maxPhysDim;

      for (let px = 0; px < width; px += skipStep) {
        // Millimeters along screen X from center
        const sx = ((px - width / 2 - panX) / baseScale) * maxPhysDim;

        let accumR = 0;
        let accumG = 0;
        let accumB = 0;
        let accumA = 0;

        let maxHuMip = -1000;

        // Pseudo-random jitter offset along ray depth to eradicate woodgrain banding rings
        const jitter = (((px * 12.9898 + py * 78.233) * 43758.5453) % 1.0 + 1.0) % 1.0;

        for (let s = -maxSteps / 2; s < maxSteps / 2; s += 1) {
          const sz = (s + jitter * 0.9) * stepSize; // Millimeters along ray depth

          // Camera Space: +X is Right, +Y is Up (-sy), +Z is Forward (sz)
          const camX = sx;
          const camY = -sy;
          const camZ = sz;

          // Transform by canonical M = M_base * R_cam
          const rx = cosY * camX + (sinY * sinP) * camY + (sinY * cosP) * camZ;
          const ry = -sinY * camX + (cosY * sinP) * camY + (cosY * cosP) * camZ;
          const rz = (-cosP) * camY + sinP * camZ;

          // Convert rotated physical millimeter position to voxel indices
          const vx = rx / spacingX + cx;
          const vy = ry / spacingY + cy;
          const vz = rz / spacingZ + cz;

          if (
            vx >= Math.max(1, minXLimit) && vx < Math.min(dimX - 2, maxXLimit) &&
            vy >= Math.max(1, minYLimit) && vy < Math.min(dimY - 2, maxYLimit) &&
            vz >= Math.max(0, minZLimit) && vz < Math.min(dimZ - 1, maxZLimit)
          ) {
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
            } else {
              let sampleAlpha = 0;
              let baseR = preset.colorGrad.r;
              let baseG = preset.colorGrad.g;
              let baseB = preset.colorGrad.b;
              let localSpecPower = specularPower;
              let localSpecIntensity = specularIntensity;

              if (isBoneTissue) {
                if (hu >= -250) {
                  if (hu < 120) {
                    const stRaw = Math.min(1.0, Math.max(0.0, (hu + 250) / 370));
                    sampleAlpha = stRaw * stRaw * 0.08 * tfMult * (isUltra ? 0.35 : 0.45);
                    baseR = 225; baseG = 158; baseB = 132;
                    localSpecPower = 18; localSpecIntensity = 0.35;
                  } else if (hu < 240) {
                    const mRaw = Math.min(1.0, Math.max(0.0, (hu - 120) / 120));
                    sampleAlpha = (0.05 + mRaw * 0.18) * tfMult * (isUltra ? 0.35 : 0.45);
                    baseR = 198; baseG = 108; baseB = 92;
                    localSpecPower = 24; localSpecIntensity = 0.45;
                  } else {
                    const bRaw = Math.min(1.0, Math.max(0.0, (hu - 240) / tfRange));
                    const sCurve = bRaw * bRaw * (3 - 2 * bRaw);
                    sampleAlpha = (0.35 + sCurve * 0.65) * tfMult * (isUltra ? 0.35 : 0.45);
                    baseR = 245; baseG = 236; baseB = 222;
                    localSpecPower = 56; localSpecIntensity = 0.80;
                  }
                }
              } else if (isAngio) {
                if (hu >= thresholdMin) {
                  if (hu > 260) {
                    const bRaw = Math.min(1.0, Math.max(0.0, (hu - 260) / 600));
                    sampleAlpha = (0.15 + bRaw * 0.35) * tfMult * (isUltra ? 0.35 : 0.45);
                    baseR = 220; baseG = 222; baseB = 226;
                    localSpecPower = 32; localSpecIntensity = 0.50;
                  } else {
                    const aRaw = Math.min(1.0, Math.max(0.0, (hu - thresholdMin) / (260 - thresholdMin)));
                    const sCurve = aRaw * aRaw * (3 - 2 * aRaw);
                    sampleAlpha = sCurve * 0.95 * tfMult * (isUltra ? 0.35 : 0.45);
                    baseR = 245; baseG = 35; baseB = 45;
                    localSpecPower = 48; localSpecIntensity = 0.85;
                  }
                }
              } else if (isPulmonary) {
                if (hu >= -950 && hu <= -200) {
                  const airRaw = Math.min(1.0, Math.max(0.0, (-200 - hu) / 750));
                  sampleAlpha = airRaw * airRaw * tfMult * (isUltra ? 0.35 : 0.45);
                  if (hu > -550) {
                    baseR = 50; baseG = 215; baseB = 245;
                    localSpecPower = 36; localSpecIntensity = 0.70;
                  } else {
                    baseR = 90; baseG = 65; baseB = 165;
                    localSpecPower = 12; localSpecIntensity = 0.20;
                  }
                }
              } else if (hu >= thresholdMin) {
                const tRaw = Math.min(1.0, Math.max(0.0, (hu - thresholdMin) / tfRange));
                const t = tRaw * tRaw * (3 - 2 * tRaw);
                sampleAlpha = t * tfMult * (isUltra ? 0.35 : (isFast ? 0.6 : 0.45));

                if (isSkin) {
                  baseR = Math.round(218 + t * 25);
                  baseG = Math.round(155 + t * 25);
                  baseB = Math.round(128 + t * 25);
                  localSpecPower = 16; localSpecIntensity = 0.35;
                } else if (isDental) {
                  if (hu > 900) {
                    baseR = 252; baseG = 250; baseB = 244;
                    localSpecPower = 75; localSpecIntensity = 0.95;
                  } else {
                    baseR = Math.round(240 + t * 10);
                    baseG = Math.round(230 + t * 15);
                    baseB = Math.round(215 + t * 20);
                    localSpecPower = 45; localSpecIntensity = 0.65;
                  }
                } else if (preset.id === 'brain') {
                  baseR = Math.round(232 - (1 - t) * 18);
                  baseG = Math.round(196 - (1 - t) * 22);
                  baseB = Math.round(182 - (1 - t) * 25);
                  localSpecPower = 22; localSpecIntensity = 0.40;
                } else if (preset.id === 'cinematic_bone') {
                  baseR = Math.round(248 - (1 - t) * 12);
                  baseG = Math.round(242 - (1 - t) * 16);
                  baseB = Math.round(235 - (1 - t) * 20);
                  localSpecPower = 64; localSpecIntensity = 0.90;
                } else {
                  // RadiAnt Bone Gold & Ivory
                  const boneFactor = Math.min(1.0, Math.max(0.0, (hu - thresholdMin) / 500));
                  baseR = Math.round(215 + boneFactor * 32);
                  baseG = Math.round(160 + boneFactor * 78);
                  baseB = Math.round(102 + boneFactor * 125);
                  localSpecPower = 48; localSpecIntensity = 0.80;
                }
              }

              if (sampleAlpha > 0.008) {
                // Spacing-compensated central difference gradient for true surface normal
                const vIdx = ivz * sliceSize + ivy * dimX + ivx;
                const nx = (voxels[vIdx + 1] - voxels[vIdx - 1]) / (2 * spacingX);
                const ny = (voxels[vIdx + dimX] - voxels[vIdx - dimX]) / (2 * spacingY);
                const nz = (voxels[vIdx + sliceSize] - voxels[vIdx - sliceSize]) / (2 * spacingZ);

                const gradLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
                let diffuse = preset.diffuse;
                let specular = 0;
                let aoFactor = 1.0;

                if (gradLen > 4) {
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

                  // 1. Key Light (Warm)
                  const nDotKey = Math.max(0, cnx * kLx + cny * kLy + cnz * kLz);
                  // 2. Soft Fill Light (Cool)
                  const nDotFill = Math.max(0, cnx * fLx + cny * fLy + cnz * fLz);
                  // 3. Rim Light (Edge)
                  const nDotRim = Math.max(0, cnx * rLx + cny * rLy + cnz * rLz);

                  diffuse = preset.ambient + preset.diffuse * (nDotKey * 0.85 + nDotFill * 0.28 + nDotRim * 0.22);

                  if (localSpecPower > 0 && nDotKey > 0) {
                    const hx = kLx;
                    const hy = kLy;
                    const hz = kLz + 1.0;
                    const hLen = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
                    const nDotH = Math.max(0, (cnx * hx + cny * hy + cnz * hz) / hLen);
                    specular = Math.pow(nDotH, localSpecPower) * localSpecIntensity;
                  }

                  // Ambient Occlusion
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
                        aoFactor = 0.72;
                      }
                    }
                  }
                }

                const cr = Math.min(255, Math.round(baseR * diffuse * aoFactor + specular * 255));
                const cg = Math.min(255, Math.round(baseG * diffuse * aoFactor + specular * 255));
                const cb = Math.min(255, Math.round(baseB * diffuse * aoFactor + specular * 255));

                const weight = (1.0 - accumA) * sampleAlpha;
                accumR += cr * weight;
                accumG += cg * weight;
                accumB += cb * weight;
                accumA += weight;

                if (accumA >= 0.98) {
                  break;
                }
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
            outG = Math.round(225 * norm);
            outB = Math.round(185 * norm);
            outA = 255;
          } else {
            outR = 0; outG = 0; outB = 0; outA = 0;
          }
        } else if (accumA > 0) {
          // Perceptual Gamma Correction
          outR = Math.min(255, Math.round(Math.pow(outR / 255, invGamma) * 255));
          outG = Math.min(255, Math.round(Math.pow(outG / 255, invGamma) * 255));
          outB = Math.min(255, Math.round(Math.pow(outB / 255, invGamma) * 255));
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
