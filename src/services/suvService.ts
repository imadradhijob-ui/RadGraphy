import { DicomInstance } from '../types/dicom';

export interface SuvCalculationParams {
  pixelValue: number;
  rescaleSlope?: number;
  rescaleIntercept?: number;
  radionuclideTotalDoseBq?: number;
  radionuclideHalfLifeSec?: number;
  injectionTimeSec?: number;
  scanTimeSec?: number;
  patientWeightKg?: number;
}

export interface PetMetadata {
  isPet: boolean;
  units?: string; // 'BQML' | 'CNTS' | 'GML'
  totalDoseBq?: number;
  halfLifeSec?: number;
  decayTimeSec?: number;
  patientWeightKg?: number;
}

/**
 * Parses time string (HHMMSS or HHMMSS.frac) to total seconds of the day.
 */
function parseDicomTimeToSeconds(timeStr?: string): number | null {
  if (!timeStr || timeStr.length < 6) return null;
  const h = parseInt(timeStr.slice(0, 2), 10);
  const m = parseInt(timeStr.slice(2, 4), 10);
  const s = parseFloat(timeStr.slice(4));
  if (isNaN(h) || isNaN(m) || isNaN(s)) return null;
  return h * 3600 + m * 60 + s;
}

export class SuvService {
  /**
   * Extracts PET SUV metadata from a DICOM instance header.
   */
  static extractPetMetadata(instance: DicomInstance): PetMetadata {
    const rawTags = instance.rawTags || {};
    const modality = (((instance as any).modality || rawTags['(0008,0060)']?.value || '') as string).toString().toUpperCase();
    const isPet = modality === 'PT' || modality === 'NM';

    // Radiopharmaceutical Information Sequence (0054,0016)
    // Common scalar tag fallbacks:
    // Radionuclide Total Dose (0018,1074)
    // Radionuclide Half Life (0018,1075)
    // Radiopharmaceutical Start Time (0018,1072)
    const totalDose = parseFloat(rawTags['(0018,1074)']?.value as string) ||
                      parseFloat(rawTags['(0054,0016)']?.value?.[0]?.['(0018,1074)']?.value) || 0;

    const halfLife = parseFloat(rawTags['(0018,1075)']?.value as string) ||
                     parseFloat(rawTags['(0054,0016)']?.value?.[0]?.['(0018,1075)']?.value) || 6586.2; // Default F-18

    const injTimeStr = (rawTags['(0018,1072)']?.value as string) ||
                       (rawTags['(0054,0016)']?.value?.[0]?.['(0018,1072)']?.value as string) || '';

    // Series Time (0008,0031) or Acquisition Time (0008,0032)
    const scanTimeStr = (rawTags['(0008,0032)']?.value as string) ||
                        (rawTags['(0008,0031)']?.value as string) ||
                        instance.instanceNumber?.toString() || '';

    const injSec = parseDicomTimeToSeconds(injTimeStr);
    const scanSec = parseDicomTimeToSeconds(scanTimeStr);

    let decayTimeSec = 3600; // Typical 60 min uptake fallback
    if (injSec !== null && scanSec !== null && scanSec >= injSec) {
      decayTimeSec = scanSec - injSec;
    }

    // Patient Weight (0010,1030) in kg
    const weightKg = parseFloat(rawTags['(0010,1030)']?.value as string) || 75.0;

    // Units (0054,0100)
    const units = ((rawTags['(0054,0100)']?.value as string) || 'BQML').toUpperCase();

    return {
      isPet,
      units,
      totalDoseBq: totalDose,
      halfLifeSec: halfLife,
      decayTimeSec,
      patientWeightKg: weightKg
    };
  }

  /**
   * Computes Standardized Uptake Value (SUVbw) in g/mL.
   *
   * Formula:
   * SUV = ActivityConcentration / (DecayedDose / (Weight_kg * 1000))
   */
  static calculateSuv(
    pixelValue: number,
    instance: DicomInstance
  ): number | null {
    const meta = this.extractPetMetadata(instance);
    if (!meta.isPet) return null;

    const slope = instance.rescaleSlope ?? 1.0;
    const intercept = instance.rescaleIntercept ?? 0.0;
    const activityConcentration = pixelValue * slope + intercept;

    // If data is already stored in SUV (GML):
    if (meta.units === 'GML') {
      return Math.max(0, activityConcentration);
    }

    // If injection dose is missing, estimate with typical diagnostic F-18 FDG dose (~370 MBq)
    const doseBq = meta.totalDoseBq && meta.totalDoseBq > 1000 ? meta.totalDoseBq : 370000000;
    const halfLife = meta.halfLifeSec && meta.halfLifeSec > 10 ? meta.halfLifeSec : 6586.2;
    const decayTime = meta.decayTimeSec ?? 3600;
    const weightGrams = (meta.patientWeightKg && meta.patientWeightKg > 5 ? meta.patientWeightKg : 75) * 1000;

    // Radioactive decay correction: A = A0 * exp(-ln(2) * dt / t_half)
    const decayFactor = Math.exp((-Math.LN2 * decayTime) / halfLife);
    const decayedDoseBq = doseBq * decayFactor;

    if (decayedDoseBq <= 0 || weightGrams <= 0) return null;

    const suv = (activityConcentration * weightGrams) / decayedDoseBq;
    return Math.max(0, parseFloat(suv.toFixed(2)));
  }

  /**
   * Standard Hot Iron Thermal Colormap for PET Overlays.
   */
  static getHotIronLut(): Uint8Array {
    const lut = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let r = 0, g = 0, b = 0;

      if (t < 0.33) {
        r = Math.round((t / 0.33) * 255);
      } else if (t < 0.66) {
        r = 255;
        g = Math.round(((t - 0.33) / 0.33) * 255);
      } else {
        r = 255;
        g = 255;
        b = Math.round(((t - 0.66) / 0.34) * 255);
      }

      const idx = i * 4;
      lut[idx + 0] = r;
      lut[idx + 1] = g;
      lut[idx + 2] = b;
      lut[idx + 3] = Math.round(Math.min(255, t * 280)); // Alpha transparency ramps up with uptake
    }
    return lut;
  }
}
