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
  acquisitionPlane: 'AXIAL' | 'CORONAL' | 'SAGITTAL';
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
/**
 * Detects if a series is a Topogram / Scout / Localizer, Structured Report,
 * or single-slice reference image which should NEVER be used for 3D MPR.
 */
export function isTopogramOrSingleSlice(series?: DicomSeries | null): boolean {
  if (!series || !series.instances || series.instances.length <= 1) return true;
  const mod = (series.modality || '').toUpperCase();
  if (mod === 'SR' || mod === 'PR' || mod === 'KO' || mod === 'DOC' || mod === 'OT') return true;
  
  const d = (series.seriesDescription || '').toLowerCase().trim();
  if (
    d.includes('dose report') ||
    d.includes('structured report') ||
    d.includes('radiation dose') ||
    d.includes('ct dose') ||
    d.includes('protocol')
  ) {
    return true;
  }

  // Only reject scouts/topograms if they have fewer than 3 slices.
  // Multi-slice MRI scouts (like Siemens AASpine_Scout with 21 slices) are valid 3D volumes.
  if (series.instances.length < 3) {
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

  return false;
}

/**
 * Strict validator determining if a DICOM series is eligible for 3D MPR reconstruction.
 * Excludes SR (Structured Reports), Scouts/Topograms, Presentation States, and single slices.
 */
export function isEligibleForMpr(series?: DicomSeries | null): boolean {
  if (!series || !series.instances || series.instances.length < 2) return false;
  if (isTopogramOrSingleSlice(series)) return false;
  const mod = (series.modality || '').toUpperCase();
  if (mod === 'SR' || mod === 'PR' || mod === 'KO' || mod === 'DOC') return false;
  if (series.instances.some((i) => (i as any).customFramePixels)) return false;
  const first = series.instances[0];
  if (!first || !first.rows || !first.columns || first.rows < 16 || first.columns < 16) return false;
  return true;
}

/**
 * Finds the primary 3D volumetric series of a study (e.g. multi-slice CT/MR scan),
 * strictly ignoring SR (Structured Reports), topograms, scouts, and single-slice images.
 * Prefers multi-slice AXIAL acquisition in CT studies.
 */
export function findMainVolumetricSeries(study?: DicomStudy | null): DicomSeries | null {
  if (!study || !study.series || study.series.length === 0) return null;

  // 1. Strictly filter eligible volumetric series
  const candidates = study.series.filter((s) => isEligibleForMpr(s));

  if (candidates.length === 0) {
    return null;
  }

  // 2. Sort by number of slices descending
  candidates.sort((a, b) => (b.instances?.length || 0) - (a.instances?.length || 0));

  // 3. In CT studies, prefer AXIAL multi-slice acquisition (standard CT scan)
  const isMr = candidates.some((s) => s.modality === 'MR');
  if (!isMr) {
    const bestAxial = candidates.find((s) => {
      const rep = s.instances[Math.floor(s.instances.length / 2)] || s.instances[0];
      return detectAnatomicalPlane(s.seriesDescription, rep?.imageOrientationPatient) === 'AXIAL';
    });
    if (bestAxial) return bestAxial;
  }

  return candidates[0];
}

export class MprEngine {
  /**
   * Constructs a contiguous 3D voxel volume from a sorted series of DICOM instances,
   * canonicalizing axes in RadiAnt LPS standard:
   *   dimX = Right-to-Left (Lateral, columns 0..dimX-1)
   *   dimY = Anterior-to-Posterior (Frontal, rows 0..dimY-1)
   *   dimZ = Superior-to-Inferior (Head-to-Feet, slices 0..dimZ-1)
   * Sorts slices strictly by their geometric projection along the slice normal vector.
   */
  static buildVolume(series: DicomSeries): Volume3D | null {
    if (!isEligibleForMpr(series)) return null;

    // ── STEP 0: Filter to single homogeneous volumetric acquisition ─────────
    let insts = [...series.instances];
    if (insts.length === 0) return null;

    // 1. Dominant dimension (rows × columns) - filters out scouts, dose reports, localizers
    const dimCounts = new Map<string, number>();
    for (const i of insts) {
      const k = `${i.rows}x${i.columns}`;
      dimCounts.set(k, (dimCounts.get(k) || 0) + 1);
    }
    let bestDim = '', bestDimCnt = 0;
    for (const [k, c] of dimCounts) {
      if (c > bestDimCnt) { bestDimCnt = c; bestDim = k; }
    }
    insts = insts.filter(i => `${i.rows}x${i.columns}` === bestDim);

    // 2. Multi-echo filtering: filter by EchoNumber (0018,0086) if multiple
    const echoCounts = new Map<number, number>();
    for (const i of insts) {
      if (i.echoNumber !== undefined) {
        echoCounts.set(i.echoNumber, (echoCounts.get(i.echoNumber) || 0) + 1);
      }
    }
    if (echoCounts.size > 1) {
      let domE = 1, domECnt = 0;
      for (const [e, c] of echoCounts) {
        if (c > domECnt) { domECnt = c; domE = e; }
      }
      insts = insts.filter(i => (i.echoNumber ?? domE) === domE);
    }

    // 3. Multi-echo filtering: filter by EchoTime TE (0018,0081)
    // In many MRI scans EchoNumber is absent, but dual echo has distinct TEs (e.g. 15ms vs 90ms)
    const teCounts = new Map<number, number>();
    for (const i of insts) {
      if (i.echoTime !== undefined && i.echoTime > 0) {
        const roundedTe = Math.round(i.echoTime * 10) / 10;
        teCounts.set(roundedTe, (teCounts.get(roundedTe) || 0) + 1);
      }
    }
    if (teCounts.size > 1) {
      let domTe = 0, domTeCnt = 0;
      for (const [te, c] of teCounts) {
        if (c > domTeCnt) { domTeCnt = c; domTe = te; }
      }
      insts = insts.filter(i => {
        if (i.echoTime === undefined || i.echoTime <= 0) return true;
        return Math.abs(i.echoTime - domTe) < 1.0;
      });
    }

    // 4. Acquisition number filtering (0020,0012)
    const acqCounts = new Map<number, number>();
    for (const i of insts) {
      if (i.acquisitionNumber !== undefined) {
        acqCounts.set(i.acquisitionNumber, (acqCounts.get(i.acquisitionNumber) || 0) + 1);
      }
    }
    if (acqCounts.size > 1) {
      let domAcq = 1, domAcqCnt = 0;
      for (const [acq, c] of acqCounts) {
        if (c > domAcqCnt) { domAcqCnt = c; domAcq = acq; }
      }
      insts = insts.filter(i => (i.acquisitionNumber ?? domAcq) === domAcq);
    }

    // 5. Prefer ORIGINAL over DERIVED (removes secondary reformats)
    const hasOrig = insts.some(i => i.imageType?.toUpperCase().includes('ORIGINAL'));
    if (hasOrig) {
      const origOnly = insts.filter(i => !i.imageType?.toUpperCase().includes('DERIVED'));
      if (origOnly.length >= 2) insts = origOnly;
    }

    if (insts.length < 2) return null;

    // ── STEP 1: Detect dominant acquisition plane across ALL instances ──────
    // Slices in scouts / multi-plane series may have mixed normals (Sagittal, Coronal, Axial).
    // Count dominant normal group so we never stack perpendicular planes together!
    let sagCount = 0;
    let corCount = 0;
    let axCount = 0;

    for (const inst of insts) {
      const iop = inst.imageOrientationPatient;
      let irx = 1, iry = 0, irz = 0;
      let icx = 0, icy = 1, icz = 0;
      if (iop && iop.length >= 6) {
        [irx, iry, irz, icx, icy, icz] = iop;
      }
      const inx = iry * icz - irz * icy;
      const iny = irz * icx - irx * icz;
      const inz = irx * icy - iry * icx;
      const absX = Math.abs(inx);
      const absY = Math.abs(iny);
      const absZ = Math.abs(inz);
      if (absX >= absY && absX >= absZ) {
        sagCount++;
      } else if (absY >= absX && absY >= absZ) {
        corCount++;
      } else {
        axCount++;
      }
    }

    const descPlane = detectAnatomicalPlane(series.seriesDescription);
    let dominantPlane: 'AXIAL' | 'CORONAL' | 'SAGITTAL' = 'AXIAL';
    if (descPlane === 'SAGITTAL' && sagCount > 0) {
      dominantPlane = 'SAGITTAL';
    } else if (descPlane === 'CORONAL' && corCount > 0) {
      dominantPlane = 'CORONAL';
    } else if (descPlane === 'AXIAL' && axCount > 0) {
      dominantPlane = 'AXIAL';
    } else {
      if (sagCount >= corCount && sagCount >= axCount) dominantPlane = 'SAGITTAL';
      else if (corCount >= sagCount && corCount >= axCount) dominantPlane = 'CORONAL';
      else dominantPlane = 'AXIAL';
    }

    // Filter to instances matching the dominant acquisition plane
    insts = insts.filter(inst => {
      const iop = inst.imageOrientationPatient;
      if (!iop || iop.length < 6) return dominantPlane === 'AXIAL';
      const [irx, iry, irz, icx, icy, icz] = iop;
      const inx = iry * icz - irz * icy;
      const iny = irz * icx - irx * icz;
      const inz = irx * icy - iry * icx;
      const absX = Math.abs(inx);
      const absY = Math.abs(iny);
      const absZ = Math.abs(inz);
      if (dominantPlane === 'SAGITTAL') return absX >= absY && absX >= absZ;
      if (dominantPlane === 'CORONAL') return absY >= absX && absY >= absZ;
      return absZ >= absX && absZ >= absY;
    });

    if (insts.length < 2) return null;

    const isCoronalAcq = dominantPlane === 'CORONAL';
    const isSagittalAcq = dominantPlane === 'SAGITTAL';

    // ── STEP 2: Compute representative slice normal vector N = R × C ────────
    const repInst = insts[Math.floor(insts.length / 2)] || insts[0];
    const repIop = repInst.imageOrientationPatient;
    let rx = 1, ry = 0, rz = 0;
    let cx = 0, cy = 1, cz = 0;
    if (repIop && repIop.length >= 6) {
      [rx, ry, rz, cx, cy, cz] = repIop;
    }
    let nx = ry * cz - rz * cy;
    let ny = rz * cx - rx * cz;
    let nz = rx * cy - ry * cx;
    const nLen = Math.hypot(nx, ny, nz) || 1;
    nx /= nLen; ny /= nLen; nz /= nLen;

    // ── STEP 3: Project slice positions onto slice normal ───────────────────
    type SM = { inst: DicomInstance; dist: number };
    const sm: SM[] = insts.map((inst, idx) => {
      const p = inst.imagePositionPatient;
      let dist = 0;
      if (p && p.length >= 3) {
        dist = p[0] * nx + p[1] * ny + p[2] * nz;
      } else {
        dist = inst.sliceLocation !== undefined ? inst.sliceLocation : (inst.instanceNumber ?? idx);
      }
      return { inst, dist };
    });

    // ── STEP 4: Sort slices geometrically into canonical LPS orientation ────
    // RadiAnt Canonical LPS:
    //   X: Right -> Left (0 = Right, dimX-1 = Left)
    //   Y: Anterior -> Posterior (0 = Anterior, dimY-1 = Posterior)
    //   Z: Superior -> Inferior (0 = Head / Superior, dimZ-1 = Feet / Inferior)
    if (isCoronalAcq) {
      if (ny > 0) sm.sort((a, b) => a.dist - b.dist);
      else sm.sort((a, b) => b.dist - a.dist);
    } else if (isSagittalAcq) {
      if (nx > 0) sm.sort((a, b) => a.dist - b.dist);
      else sm.sort((a, b) => b.dist - a.dist);
    } else {
      if (nz > 0) sm.sort((a, b) => b.dist - a.dist);
      else sm.sort((a, b) => a.dist - b.dist);
    }

    // ── STEP 5: Remove spatial duplicates (|Δdist| < 0.25 mm) ───────────────
    const unique: SM[] = [];
    for (const m of sm) {
      if (!unique.length || Math.abs(m.dist - unique[unique.length - 1].dist) > 0.25) {
        unique.push(m);
      }
    }
    if (unique.length < 2) return null;

    // ── STEP 6: Calculate physical slice spacing ────────────────────────────
    const firstInst = unique[0].inst;
    let sliceSpacing = firstInst.sliceThickness || 1.0;
    const diffs: number[] = [];
    for (let i = 0; i < unique.length - 1; i++) {
      const d = Math.abs(unique[i + 1].dist - unique[i].dist);
      if (d > 0.05) diffs.push(d);
    }
    if (diffs.length > 0) {
      diffs.sort((a, b) => a - b);
      sliceSpacing = diffs[Math.floor(diffs.length / 2)];
    } else if (firstInst.spacingBetweenSlices && firstInst.spacingBetweenSlices > 0.05) {
      sliceSpacing = firstInst.spacingBetweenSlices;
    }

    // ── STEP 7: Populate canonical LPS volume ───────────────────────────────
    // Volume layout: data[z * dimY * dimX + y * dimX + x]
    //   x in [0..dimX-1]: Patient Right -> Left
    //   y in [0..dimY-1]: Patient Anterior -> Posterior
    //   z in [0..dimZ-1]: Patient Superior -> Inferior (Head -> Feet)
    let dimX = 0, dimY = 0, dimZ = 0;
    let spacingX = 1.0, spacingY = 1.0, spacingZ = 1.0;

    const inCols = firstInst.columns;
    const inRows = firstInst.rows;
    const numSlices = unique.length;
    const rowSpacing = firstInst.pixelSpacing?.[0] || 1.0;
    const colSpacing = firstInst.pixelSpacing?.[1] || 1.0;

    if (isCoronalAcq) {
      dimX = inCols;
      dimY = numSlices;
      dimZ = inRows;
      spacingX = colSpacing;
      spacingY = sliceSpacing;
      spacingZ = rowSpacing;
    } else if (isSagittalAcq) {
      dimX = numSlices;
      dimY = inCols;
      dimZ = inRows;
      spacingX = sliceSpacing;
      spacingY = colSpacing;
      spacingZ = rowSpacing;
    } else {
      dimX = inCols;
      dimY = inRows;
      dimZ = numSlices;
      spacingX = colSpacing;
      spacingY = rowSpacing;
      spacingZ = sliceSpacing;
    }

    const volumeData = new Int16Array(dimX * dimY * dimZ);
    let globalMin = Infinity, globalMax = -Infinity;

    if (isCoronalAcq) {
      const flipCol = rx < -0.5;
      const flipRow = cz > 0.5;
      for (let s = 0; s < numSlices; s++) {
        const { huData } = getOrDecodeInstancePixels(unique[s].inst);
        for (let r = 0; r < inRows; r++) {
          const ar = flipRow ? inRows - 1 - r : r;
          const z = r;
          const y = s;
          const zBase = z * dimY * dimX + y * dimX;
          const inBase = ar * inCols;
          for (let c = 0; c < inCols; c++) {
            const ac = flipCol ? inCols - 1 - c : c;
            const v = huData[inBase + ac] ?? -1000;
            volumeData[zBase + c] = v;
            if (v < globalMin) globalMin = v;
            if (v > globalMax) globalMax = v;
          }
        }
      }
    } else if (isSagittalAcq) {
      const flipCol = ry < -0.5;
      const flipRow = cz > 0.5;
      for (let s = 0; s < numSlices; s++) {
        const { huData } = getOrDecodeInstancePixels(unique[s].inst);
        for (let r = 0; r < inRows; r++) {
          const ar = flipRow ? inRows - 1 - r : r;
          const z = r;
          const x = s;
          const inBase = ar * inCols;
          for (let c = 0; c < inCols; c++) {
            const ac = flipCol ? inCols - 1 - c : c;
            const y = c;
            const v = huData[inBase + ac] ?? -1000;
            volumeData[z * dimY * dimX + y * dimX + x] = v;
            if (v < globalMin) globalMin = v;
            if (v > globalMax) globalMax = v;
          }
        }
      }
    } else {
      // Axial acquisition
      const flipCol = rx < -0.5;
      const flipRow = cy < -0.5;
      for (let z = 0; z < dimZ; z++) {
        const { huData } = getOrDecodeInstancePixels(unique[z].inst);
        const zBase = z * dimX * dimY;
        if (!flipCol && !flipRow) {
          for (let i = 0; i < dimX * dimY; i++) {
            const v = huData[i] ?? -1000;
            volumeData[zBase + i] = v;
            if (v < globalMin) globalMin = v;
            if (v > globalMax) globalMax = v;
          }
        } else {
          for (let r = 0; r < dimY; r++) {
            const ar = flipRow ? dimY - 1 - r : r;
            const inBase = ar * dimX;
            const outBase = zBase + r * dimX;
            for (let c = 0; c < dimX; c++) {
              const ac = flipCol ? dimX - 1 - c : c;
              const v = huData[inBase + ac] ?? -1000;
              volumeData[outBase + c] = v;
              if (v < globalMin) globalMin = v;
              if (v > globalMax) globalMax = v;
            }
          }
        }
      }
    }

    return {
      data: volumeData,
      dimX, dimY, dimZ,
      spacingX, spacingY, spacingZ,
      minHu: globalMin === Infinity  ? -1000 : globalMin,
      maxHu: globalMax === -Infinity ? 1000  : globalMax,
      windowCenter: firstInst.windowCenter || 40,
      windowWidth:  firstInst.windowWidth  || 400,
      instances: unique.map(m => m.inst),
      acquisitionPlane: dominantPlane
    };
  }

  /**
   * Calculates isotropic output dimensions and pixel spacing for any orthogonal MPR plane,
   * guaranteeing true physical 1:1 aspect ratio matching RadiAnt viewer.
   */
  static getSliceDimensions(
    volume: Volume3D,
    plane: MprPlane
  ): { width: number; height: number; pixelSpacing: [number, number] } {
    const { dimX, dimY, dimZ, spacingX, spacingY, spacingZ } = volume;
    const delta = Math.min(spacingX, spacingY, spacingZ);

    if (plane === 'axial') {
      const width = Math.max(1, Math.round((dimX * spacingX) / delta));
      const height = Math.max(1, Math.round((dimY * spacingY) / delta));
      return { width, height, pixelSpacing: [delta, delta] };
    } else if (plane === 'coronal') {
      const width = Math.max(1, Math.round((dimX * spacingX) / delta));
      const height = Math.max(1, Math.round((dimZ * spacingZ) / delta));
      return { width, height, pixelSpacing: [delta, delta] };
    } else {
      // Sagittal: Horizontal = Y (Anterior-to-Posterior), Vertical = Z (Superior-to-Inferior)
      const width = Math.max(1, Math.round((dimY * spacingY) / delta));
      const height = Math.max(1, Math.round((dimZ * spacingZ) / delta));
      return { width, height, pixelSpacing: [delta, delta] };
    }
  }

  /**
   * RadiAnt-identical MPR slice extraction with smooth trilinear/bilinear interpolation.
   *
   * Volume is in canonical LPS:
   *   x in [0..dimX-1]: Patient Right -> Left
   *   y in [0..dimY-1]: Patient Anterior -> Posterior
   *   z in [0..dimZ-1]: Patient Superior -> Inferior (Head -> Feet)
   *
   * Viewports:
   *   Axial:    fixed z, width ~ dimX*spX, height ~ dimY*spY
   *   Coronal:  fixed y, width ~ dimX*spX, height ~ dimZ*spZ
   *   Sagittal: fixed x, width ~ dimY*spY, height ~ dimZ*spZ
   */
  static getSlice(
    volume: Volume3D,
    plane: MprPlane,
    crosshair: { x: number; y: number; z: number },
    projectionMode: ProjectionMode = 'none',
    slabThicknessMm: number = 2.5
  ): MprSliceResult {
    const { dimX, dimY, dimZ, spacingX, spacingY, spacingZ, data } = volume;
    const sliceArea = dimX * dimY;
    const { width, height, pixelSpacing } = MprEngine.getSliceDimensions(volume, plane);
    const sliceHu = new Int16Array(width * height);

    // ────────────────────────────── AXIAL ──────────────────────────────────
    if (plane === 'axial') {
      const targetZ = Math.max(0, Math.min(dimZ - 1, crosshair.z));
      const slabN = Math.max(1, Math.round(slabThicknessMm / spacingZ));

      if (projectionMode === 'mip' && slabN > 1) {
        const z0 = Math.max(0, Math.floor(targetZ - slabN / 2));
        const z1 = Math.min(dimZ - 1, Math.ceil(targetZ + slabN / 2));
        for (let r = 0; r < height; r++) {
          const vy = (r / Math.max(1, height - 1)) * (dimY - 1);
          const y0 = Math.floor(vy);
          const y1 = Math.min(dimY - 1, y0 + 1);
          const ty = vy - y0;
          const outBase = r * width;
          for (let c = 0; c < width; c++) {
            const vx = (c / Math.max(1, width - 1)) * (dimX - 1);
            const x0 = Math.floor(vx);
            const x1 = Math.min(dimX - 1, x0 + 1);
            const tx = vx - x0;
            let mx = -32768;
            for (let z = z0; z <= z1; z++) {
              const off0 = z * sliceArea + y0 * dimX;
              const off1 = z * sliceArea + y1 * dimX;
              const v = (data[off0 + x0] * (1 - tx) + data[off0 + x1] * tx) * (1 - ty)
                      + (data[off1 + x0] * (1 - tx) + data[off1 + x1] * tx) * ty;
              if (v > mx) mx = v;
            }
            sliceHu[outBase + c] = Math.round(mx);
          }
        }
      } else if (projectionMode === 'minip' && slabN > 1) {
        const z0 = Math.max(0, Math.floor(targetZ - slabN / 2));
        const z1 = Math.min(dimZ - 1, Math.ceil(targetZ + slabN / 2));
        for (let r = 0; r < height; r++) {
          const vy = (r / Math.max(1, height - 1)) * (dimY - 1);
          const y0 = Math.floor(vy);
          const y1 = Math.min(dimY - 1, y0 + 1);
          const ty = vy - y0;
          const outBase = r * width;
          for (let c = 0; c < width; c++) {
            const vx = (c / Math.max(1, width - 1)) * (dimX - 1);
            const x0 = Math.floor(vx);
            const x1 = Math.min(dimX - 1, x0 + 1);
            const tx = vx - x0;
            let mn = 32767;
            for (let z = z0; z <= z1; z++) {
              const off0 = z * sliceArea + y0 * dimX;
              const off1 = z * sliceArea + y1 * dimX;
              const v = (data[off0 + x0] * (1 - tx) + data[off0 + x1] * tx) * (1 - ty)
                      + (data[off1 + x0] * (1 - tx) + data[off1 + x1] * tx) * ty;
              if (v < mn) mn = v;
            }
            sliceHu[outBase + c] = Math.round(mn);
          }
        }
      } else if (projectionMode === 'avg' && slabN > 1) {
        const z0 = Math.max(0, Math.floor(targetZ - slabN / 2));
        const z1 = Math.min(dimZ - 1, Math.ceil(targetZ + slabN / 2));
        const cnt = z1 - z0 + 1;
        for (let r = 0; r < height; r++) {
          const vy = (r / Math.max(1, height - 1)) * (dimY - 1);
          const y0 = Math.floor(vy);
          const y1 = Math.min(dimY - 1, y0 + 1);
          const ty = vy - y0;
          const outBase = r * width;
          for (let c = 0; c < width; c++) {
            const vx = (c / Math.max(1, width - 1)) * (dimX - 1);
            const x0 = Math.floor(vx);
            const x1 = Math.min(dimX - 1, x0 + 1);
            const tx = vx - x0;
            let s = 0;
            for (let z = z0; z <= z1; z++) {
              const off0 = z * sliceArea + y0 * dimX;
              const off1 = z * sliceArea + y1 * dimX;
              s += (data[off0 + x0] * (1 - tx) + data[off0 + x1] * tx) * (1 - ty)
                 + (data[off1 + x0] * (1 - tx) + data[off1 + x1] * tx) * ty;
            }
            sliceHu[outBase + c] = Math.round(s / cnt);
          }
        }
      } else {
        // Continuous trilinear sampling for Axial
        const z0 = Math.floor(targetZ);
        const z1 = Math.min(dimZ - 1, z0 + 1);
        const tz = targetZ - z0;
        const wz0 = 1 - tz, wz1 = tz;
        for (let r = 0; r < height; r++) {
          const vy = (r / Math.max(1, height - 1)) * (dimY - 1);
          const y0 = Math.floor(vy);
          const y1 = Math.min(dimY - 1, y0 + 1);
          const ty = vy - y0;
          const off00 = z0 * sliceArea + y0 * dimX;
          const off01 = z0 * sliceArea + y1 * dimX;
          const off10 = z1 * sliceArea + y0 * dimX;
          const off11 = z1 * sliceArea + y1 * dimX;
          const outBase = r * width;
          for (let c = 0; c < width; c++) {
            const vx = (c / Math.max(1, width - 1)) * (dimX - 1);
            const x0 = Math.floor(vx);
            const x1 = Math.min(dimX - 1, x0 + 1);
            const tx = vx - x0;
            const v0 = (data[off00 + x0] * (1 - tx) + data[off00 + x1] * tx) * (1 - ty)
                     + (data[off01 + x0] * (1 - tx) + data[off01 + x1] * tx) * ty;
            const v1 = (data[off10 + x0] * (1 - tx) + data[off10 + x1] * tx) * (1 - ty)
                     + (data[off11 + x0] * (1 - tx) + data[off11 + x1] * tx) * ty;
            sliceHu[outBase + c] = Math.round(v0 * wz0 + v1 * wz1);
          }
        }
      }

      return {
        width, height, huData: sliceHu,
        pixelSpacing,
        scaleY: 1.0,
        aspectRatio: height / width
      };
    }

    // ────────────────────────────── CORONAL ────────────────────────────────
    if (plane === 'coronal') {
      const targetY = Math.max(0, Math.min(dimY - 1, crosshair.y));
      const slabN = Math.max(1, Math.round(slabThicknessMm / spacingY));

      if (projectionMode === 'mip' && slabN > 1) {
        const yMin = Math.max(0, Math.floor(targetY - slabN / 2));
        const yMax = Math.min(dimY - 1, Math.ceil(targetY + slabN / 2));
        for (let r = 0; r < height; r++) {
          const vz = (r / Math.max(1, height - 1)) * (dimZ - 1);
          const z0 = Math.floor(vz);
          const z1 = Math.min(dimZ - 1, z0 + 1);
          const tz = vz - z0;
          const outBase = r * width;
          for (let c = 0; c < width; c++) {
            const vx = (c / Math.max(1, width - 1)) * (dimX - 1);
            const x0 = Math.floor(vx);
            const x1 = Math.min(dimX - 1, x0 + 1);
            const tx = vx - x0;
            let mx = -32768;
            for (let y = yMin; y <= yMax; y++) {
              const off0 = z0 * sliceArea + y * dimX;
              const off1 = z1 * sliceArea + y * dimX;
              const v = (data[off0 + x0] * (1 - tx) + data[off0 + x1] * tx) * (1 - tz)
                      + (data[off1 + x0] * (1 - tx) + data[off1 + x1] * tx) * tz;
              if (v > mx) mx = v;
            }
            sliceHu[outBase + c] = Math.round(mx);
          }
        }
      } else if (projectionMode === 'minip' && slabN > 1) {
        const yMin = Math.max(0, Math.floor(targetY - slabN / 2));
        const yMax = Math.min(dimY - 1, Math.ceil(targetY + slabN / 2));
        for (let r = 0; r < height; r++) {
          const vz = (r / Math.max(1, height - 1)) * (dimZ - 1);
          const z0 = Math.floor(vz);
          const z1 = Math.min(dimZ - 1, z0 + 1);
          const tz = vz - z0;
          const outBase = r * width;
          for (let c = 0; c < width; c++) {
            const vx = (c / Math.max(1, width - 1)) * (dimX - 1);
            const x0 = Math.floor(vx);
            const x1 = Math.min(dimX - 1, x0 + 1);
            const tx = vx - x0;
            let mn = 32767;
            for (let y = yMin; y <= yMax; y++) {
              const off0 = z0 * sliceArea + y * dimX;
              const off1 = z1 * sliceArea + y * dimX;
              const v = (data[off0 + x0] * (1 - tx) + data[off0 + x1] * tx) * (1 - tz)
                      + (data[off1 + x0] * (1 - tx) + data[off1 + x1] * tx) * tz;
              if (v < mn) mn = v;
            }
            sliceHu[outBase + c] = Math.round(mn);
          }
        }
      } else if (projectionMode === 'avg' && slabN > 1) {
        const yMin = Math.max(0, Math.floor(targetY - slabN / 2));
        const yMax = Math.min(dimY - 1, Math.ceil(targetY + slabN / 2));
        const cnt = yMax - yMin + 1;
        for (let r = 0; r < height; r++) {
          const vz = (r / Math.max(1, height - 1)) * (dimZ - 1);
          const z0 = Math.floor(vz);
          const z1 = Math.min(dimZ - 1, z0 + 1);
          const tz = vz - z0;
          const outBase = r * width;
          for (let c = 0; c < width; c++) {
            const vx = (c / Math.max(1, width - 1)) * (dimX - 1);
            const x0 = Math.floor(vx);
            const x1 = Math.min(dimX - 1, x0 + 1);
            const tx = vx - x0;
            let s = 0;
            for (let y = yMin; y <= yMax; y++) {
              const off0 = z0 * sliceArea + y * dimX;
              const off1 = z1 * sliceArea + y * dimX;
              s += (data[off0 + x0] * (1 - tx) + data[off0 + x1] * tx) * (1 - tz)
                 + (data[off1 + x0] * (1 - tx) + data[off1 + x1] * tx) * tz;
            }
            sliceHu[outBase + c] = Math.round(s / cnt);
          }
        }
      } else {
        // Continuous trilinear sampling for Coronal
        const y0 = Math.floor(targetY);
        const y1 = Math.min(dimY - 1, y0 + 1);
        const ty = targetY - y0;
        const wy0 = 1 - ty, wy1 = ty;
        for (let r = 0; r < height; r++) {
          const vz = (r / Math.max(1, height - 1)) * (dimZ - 1);
          const z0 = Math.floor(vz);
          const z1 = Math.min(dimZ - 1, z0 + 1);
          const tz = vz - z0;
          const off00 = z0 * sliceArea + y0 * dimX;
          const off01 = z0 * sliceArea + y1 * dimX;
          const off10 = z1 * sliceArea + y0 * dimX;
          const off11 = z1 * sliceArea + y1 * dimX;
          const outBase = r * width;
          for (let c = 0; c < width; c++) {
            const vx = (c / Math.max(1, width - 1)) * (dimX - 1);
            const x0 = Math.floor(vx);
            const x1 = Math.min(dimX - 1, x0 + 1);
            const tx = vx - x0;
            const v0 = data[off00 + x0] * (1 - tx) + data[off00 + x1] * tx;
            const v1 = data[off01 + x0] * (1 - tx) + data[off01 + x1] * tx;
            const vz0 = v0 * wy0 + v1 * wy1;
            const v2 = data[off10 + x0] * (1 - tx) + data[off10 + x1] * tx;
            const v3 = data[off11 + x0] * (1 - tx) + data[off11 + x1] * tx;
            const vz1 = v2 * wy0 + v3 * wy1;
            sliceHu[outBase + c] = Math.round(vz0 * (1 - tz) + vz1 * tz);
          }
        }
      }

      return {
        width, height, huData: sliceHu,
        pixelSpacing,
        scaleY: 1.0,
        aspectRatio: height / width
      };
    }

    // ────────────────────────────── SAGITTAL ───────────────────────────────
    {
      const targetX = Math.max(0, Math.min(dimX - 1, crosshair.x));
      const slabN = Math.max(1, Math.round(slabThicknessMm / spacingX));

      if (projectionMode === 'mip' && slabN > 1) {
        const xMin = Math.max(0, Math.floor(targetX - slabN / 2));
        const xMax = Math.min(dimX - 1, Math.ceil(targetX + slabN / 2));
        for (let r = 0; r < height; r++) {
          const vz = (r / Math.max(1, height - 1)) * (dimZ - 1);
          const z0 = Math.floor(vz);
          const z1 = Math.min(dimZ - 1, z0 + 1);
          const tz = vz - z0;
          const zBase0 = z0 * sliceArea;
          const zBase1 = z1 * sliceArea;
          const outBase = r * width;
          for (let c = 0; c < width; c++) {
            const vy = (c / Math.max(1, width - 1)) * (dimY - 1);
            const y0 = Math.floor(vy);
            const y1 = Math.min(dimY - 1, y0 + 1);
            const ty = vy - y0;
            let mx = -32768;
            for (let x = xMin; x <= xMax; x++) {
              const v0 = data[zBase0 + y0 * dimX + x] * (1 - ty) + data[zBase0 + y1 * dimX + x] * ty;
              const v1 = data[zBase1 + y0 * dimX + x] * (1 - ty) + data[zBase1 + y1 * dimX + x] * ty;
              const v = v0 * (1 - tz) + v1 * tz;
              if (v > mx) mx = v;
            }
            sliceHu[outBase + c] = Math.round(mx);
          }
        }
      } else if (projectionMode === 'minip' && slabN > 1) {
        const xMin = Math.max(0, Math.floor(targetX - slabN / 2));
        const xMax = Math.min(dimX - 1, Math.ceil(targetX + slabN / 2));
        for (let r = 0; r < height; r++) {
          const vz = (r / Math.max(1, height - 1)) * (dimZ - 1);
          const z0 = Math.floor(vz);
          const z1 = Math.min(dimZ - 1, z0 + 1);
          const tz = vz - z0;
          const zBase0 = z0 * sliceArea;
          const zBase1 = z1 * sliceArea;
          const outBase = r * width;
          for (let c = 0; c < width; c++) {
            const vy = (c / Math.max(1, width - 1)) * (dimY - 1);
            const y0 = Math.floor(vy);
            const y1 = Math.min(dimY - 1, y0 + 1);
            const ty = vy - y0;
            let mn = 32767;
            for (let x = xMin; x <= xMax; x++) {
              const v0 = data[zBase0 + y0 * dimX + x] * (1 - ty) + data[zBase0 + y1 * dimX + x] * ty;
              const v1 = data[zBase1 + y0 * dimX + x] * (1 - ty) + data[zBase1 + y1 * dimX + x] * ty;
              const v = v0 * (1 - tz) + v1 * tz;
              if (v < mn) mn = v;
            }
            sliceHu[outBase + c] = Math.round(mn);
          }
        }
      } else if (projectionMode === 'avg' && slabN > 1) {
        const xMin = Math.max(0, Math.floor(targetX - slabN / 2));
        const xMax = Math.min(dimX - 1, Math.ceil(targetX + slabN / 2));
        const cnt = xMax - xMin + 1;
        for (let r = 0; r < height; r++) {
          const vz = (r / Math.max(1, height - 1)) * (dimZ - 1);
          const z0 = Math.floor(vz);
          const z1 = Math.min(dimZ - 1, z0 + 1);
          const tz = vz - z0;
          const zBase0 = z0 * sliceArea;
          const zBase1 = z1 * sliceArea;
          const outBase = r * width;
          for (let c = 0; c < width; c++) {
            const vy = (c / Math.max(1, width - 1)) * (dimY - 1);
            const y0 = Math.floor(vy);
            const y1 = Math.min(dimY - 1, y0 + 1);
            const ty = vy - y0;
            let s = 0;
            for (let x = xMin; x <= xMax; x++) {
              const v0 = data[zBase0 + y0 * dimX + x] * (1 - ty) + data[zBase0 + y1 * dimX + x] * ty;
              const v1 = data[zBase1 + y0 * dimX + x] * (1 - ty) + data[zBase1 + y1 * dimX + x] * ty;
              s += v0 * (1 - tz) + v1 * tz;
            }
            sliceHu[outBase + c] = Math.round(s / cnt);
          }
        }
      } else {
        // Continuous trilinear sampling for Sagittal
        const x0 = Math.floor(targetX);
        const x1 = Math.min(dimX - 1, x0 + 1);
        const tx = targetX - x0;
        const wx0 = 1 - tx, wx1 = tx;
        for (let r = 0; r < height; r++) {
          const vz = (r / Math.max(1, height - 1)) * (dimZ - 1);
          const z0 = Math.floor(vz);
          const z1 = Math.min(dimZ - 1, z0 + 1);
          const tz = vz - z0;
          const zBase0 = z0 * sliceArea;
          const zBase1 = z1 * sliceArea;
          const outBase = r * width;
          for (let c = 0; c < width; c++) {
            const vy = (c / Math.max(1, width - 1)) * (dimY - 1);
            const y0 = Math.floor(vy);
            const y1 = Math.min(dimY - 1, y0 + 1);
            const ty = vy - y0;
            const v00 = data[zBase0 + y0 * dimX + x0] * wx0 + data[zBase0 + y0 * dimX + x1] * wx1;
            const v01 = data[zBase0 + y1 * dimX + x0] * wx0 + data[zBase0 + y1 * dimX + x1] * wx1;
            const vz0 = v00 * (1 - ty) + v01 * ty;
            const v10 = data[zBase1 + y0 * dimX + x0] * wx0 + data[zBase1 + y0 * dimX + x1] * wx1;
            const v11 = data[zBase1 + y1 * dimX + x0] * wx0 + data[zBase1 + y1 * dimX + x1] * wx1;
            const vz1 = v10 * (1 - ty) + v11 * ty;
            sliceHu[outBase + c] = Math.round(vz0 * (1 - tz) + vz1 * tz);
          }
        }
      }

      return {
        width, height, huData: sliceHu,
        pixelSpacing,
        scaleY: 1.0,
        aspectRatio: height / width
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
