import { ColorLutType } from '../types/dicom';

/**
 * 256-level RGB Look-Up Table (LUT) Engine for Clinical DICOM Workstation
 * Provides fast 0ms array lookups for 60 FPS hardware-accelerated rendering.
 */

export interface LutColor {
  r: number;
  g: number;
  b: number;
}

export interface LutPreset {
  id: ColorLutType;
  name: string;
  category: string;
  description: string;
  previewColor: string;
}

export const LUT_PRESETS: LutPreset[] = [
  {
    id: 'grayscale',
    name: 'Grayscale (Default)',
    category: 'Standard Monochrome',
    description: 'Standard radiological linear grayscale',
    previewColor: 'from-black to-white'
  },
  {
    id: 'hot_iron',
    name: 'Hot Iron',
    category: 'Thermal Heatmap',
    description: 'Thermal progression: black -> red -> orange -> white',
    previewColor: 'from-purple-950 via-rose-600 to-yellow-300'
  },
  {
    id: 'pet_rainbow',
    name: 'PET Rainbow',
    category: 'Nuclear Medicine',
    description: 'Rainbow spectrum: blue -> cyan -> green -> yellow -> red',
    previewColor: 'from-blue-600 via-emerald-400 via-yellow-400 to-red-600'
  },
  {
    id: 'bone',
    name: 'Bone 3D / Amber',
    category: 'Orthopedic Skeletal',
    description: 'High-contrast golden amber for bone and fractures',
    previewColor: 'from-amber-950 via-amber-500 to-amber-100'
  },
  {
    id: 'angio',
    name: 'Angio Vascular',
    category: 'Angiography & Perfusion',
    description: 'Vascular contrast highlighting with red vessel perfusion',
    previewColor: 'from-slate-950 via-red-600 to-cyan-300'
  },
  {
    id: 'cool_blue',
    name: 'Cool Blue',
    category: 'MRI T2 / FLAIR',
    description: 'Deep navy to cyan highlight for neurological MRI',
    previewColor: 'from-slate-950 via-blue-600 to-cyan-200'
  },
  {
    id: 'inverted',
    name: 'Inverted (Negative)',
    category: 'Inverse Monochrome',
    description: 'Inverted grayscale for subtle fracture & air detection',
    previewColor: 'from-white to-black'
  }
];

// Precomputed 256-element RGB arrays for each LUT
const LUT_TABLES: Record<ColorLutType, Uint8Array> = {
  grayscale: generateGrayscaleLut(),
  hot_iron: generateHotIronLut(),
  pet_rainbow: generatePetRainbowLut(),
  bone: generateBoneLut(),
  angio: generateAngioLut(),
  cool_blue: generateCoolBlueLut(),
  inverted: generateInvertedLut()
};

function generateGrayscaleLut(): Uint8Array {
  const arr = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    arr[i * 3] = i;
    arr[i * 3 + 1] = i;
    arr[i * 3 + 2] = i;
  }
  return arr;
}

function generateInvertedLut(): Uint8Array {
  const arr = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const v = 255 - i;
    arr[i * 3] = v;
    arr[i * 3 + 1] = v;
    arr[i * 3 + 2] = v;
  }
  return arr;
}

function generateHotIronLut(): Uint8Array {
  const arr = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let r = 0, g = 0, b = 0;
    if (t < 0.25) {
      r = Math.round((t / 0.25) * 128);
      g = 0;
      b = Math.round((t / 0.25) * 64);
    } else if (t < 0.5) {
      const sub = (t - 0.25) / 0.25;
      r = Math.round(128 + sub * 127);
      g = Math.round(sub * 64);
      b = Math.round(64 * (1 - sub));
    } else if (t < 0.75) {
      const sub = (t - 0.5) / 0.25;
      r = 255;
      g = Math.round(64 + sub * 191);
      b = 0;
    } else {
      const sub = (t - 0.75) / 0.25;
      r = 255;
      g = 255;
      b = Math.round(sub * 255);
    }
    arr[i * 3] = r;
    arr[i * 3 + 1] = g;
    arr[i * 3 + 2] = b;
  }
  return arr;
}

function generatePetRainbowLut(): Uint8Array {
  const arr = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let r = 0, g = 0, b = 0;
    if (t < 0.2) {
      const sub = t / 0.2;
      r = 0;
      g = 0;
      b = Math.round(sub * 255);
    } else if (t < 0.4) {
      const sub = (t - 0.2) / 0.2;
      r = 0;
      g = Math.round(sub * 255);
      b = 255;
    } else if (t < 0.6) {
      const sub = (t - 0.4) / 0.2;
      r = 0;
      g = 255;
      b = Math.round((1 - sub) * 255);
    } else if (t < 0.8) {
      const sub = (t - 0.6) / 0.2;
      r = Math.round(sub * 255);
      g = 255;
      b = 0;
    } else {
      const sub = (t - 0.8) / 0.2;
      r = 255;
      g = Math.round((1 - sub) * 255);
      b = 0;
    }
    arr[i * 3] = r;
    arr[i * 3 + 1] = g;
    arr[i * 3 + 2] = b;
  }
  return arr;
}

function generateBoneLut(): Uint8Array {
  const arr = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const r = Math.min(255, Math.round(t * 270));
    const g = Math.min(255, Math.round(Math.pow(t, 1.2) * 230));
    const b = Math.min(255, Math.round(Math.pow(t, 2.0) * 180));
    arr[i * 3] = r;
    arr[i * 3 + 1] = g;
    arr[i * 3 + 2] = b;
  }
  return arr;
}

function generateAngioLut(): Uint8Array {
  const arr = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let r = 0, g = 0, b = 0;
    if (t < 0.35) {
      const sub = t / 0.35;
      r = Math.round(sub * 40);
      g = Math.round(sub * 50);
      b = Math.round(sub * 80);
    } else if (t < 0.7) {
      const sub = (t - 0.35) / 0.35;
      r = Math.round(40 + sub * 215);
      g = Math.round(50 * (1 - sub));
      b = Math.round(80 * (1 - sub));
    } else {
      const sub = (t - 0.7) / 0.3;
      r = 255;
      g = Math.round(sub * 220);
      b = Math.round(sub * 220);
    }
    arr[i * 3] = r;
    arr[i * 3 + 1] = g;
    arr[i * 3 + 2] = b;
  }
  return arr;
}

function generateCoolBlueLut(): Uint8Array {
  const arr = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const r = Math.round(Math.pow(t, 2.2) * 180);
    const g = Math.round(Math.pow(t, 1.3) * 230);
    const b = Math.min(255, Math.round(t * 265));
    arr[i * 3] = r;
    arr[i * 3 + 1] = g;
    arr[i * 3 + 2] = b;
  }
  return arr;
}

export function getLutTable(lutType: ColorLutType = 'grayscale'): Uint8Array {
  return LUT_TABLES[lutType] || LUT_TABLES.grayscale;
}

/**
 * Identifies anatomical tissue type from calibrated Hounsfield Unit (HU)
 */
export function classifyTissueFromHu(hu: number): { name: string; arabic: string; color: string } {
  if (hu <= -850) {
    return { name: 'Air', arabic: 'هواء', color: 'text-sky-300' };
  } else if (hu <= -300) {
    return { name: 'Lung', arabic: 'نسيج رئوي', color: 'text-cyan-400' };
  } else if (hu <= -25) {
    return { name: 'Fat (Adipose)', arabic: 'دهون', color: 'text-amber-400' };
  } else if (hu <= 15) {
    return { name: 'Fluid / Water / CSF', arabic: 'سوائل / ماء', color: 'text-blue-400' };
  } else if (hu <= 45) {
    return { name: 'Soft Tissue / Brain', arabic: 'نسيج رخو / دماغ', color: 'text-emerald-400' };
  } else if (hu <= 85) {
    return { name: 'Blood / Hematoma', arabic: 'دم / نزيف', color: 'text-rose-400' };
  } else if (hu <= 300) {
    return { name: 'Contrast / Trabecular Bone', arabic: 'صبغة / عظم إسفنجي', color: 'text-orange-400' };
  } else {
    return { name: 'Dense Cortical Bone', arabic: 'عظم قشري صلب', color: 'text-amber-200' };
  }
}
