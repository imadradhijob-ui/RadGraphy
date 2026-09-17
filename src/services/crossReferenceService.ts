import { DicomInstance, Point2D } from '../types/dicom';
import { detectAnatomicalPlane } from './mprEngine';

export interface ReferenceLineResult {
  start: Point2D;
  end: Point2D;
  sourcePlane: 'AXIAL' | 'CORONAL' | 'SAGITTAL' | 'SCOUT' | 'OTHER';
  sourceSliceNumber: number;
  sourceSliceLocation?: number;
  color: string;
}

/**
 * Calculates the 3D plane intersection between a reference DICOM slice and a target DICOM slice.
 * Returns the 2D line segment endpoints in target image pixel coordinates.
 */
export function calculateCrossReferenceLine(
  targetInstance: DicomInstance,
  referenceInstance: DicomInstance
): ReferenceLineResult | null {
  if (!targetInstance || !referenceInstance) return null;
  if (targetInstance.sopInstanceUid === referenceInstance.sopInstanceUid) return null;

  const targetCols = targetInstance.columns || 512;
  const targetRows = targetInstance.rows || 512;
  const targetSpacingX = targetInstance.pixelSpacing?.[1] || 1.0; // column spacing in mm
  const targetSpacingY = targetInstance.pixelSpacing?.[0] || 1.0; // row spacing in mm

  // Helper to extract or estimate 3D vectors
  const getPlaneVectors = (inst: DicomInstance) => {
    let origin = inst.imagePositionPatient;
    let iop = inst.imageOrientationPatient;

    if (!origin) {
      const z = inst.sliceLocation ?? inst.instanceNumber ?? 0;
      origin = [0, 0, z];
    }

    if (!iop || iop.length < 6) {
      // Fallback based on anatomical plane
      const planeDesc = String(inst.rawTags?.['(0008,103E)']?.value ?? '');
      const plane = detectAnatomicalPlane(planeDesc, iop);
      if (plane === 'CORONAL') {
        iop = [1, 0, 0, 0, 0, -1];
      } else if (plane === 'SAGITTAL') {
        iop = [0, 1, 0, 0, 0, -1];
      } else {
        iop = [1, 0, 0, 0, 1, 0]; // Default Axial
      }
    }

    const rowX = [iop[0], iop[1], iop[2]];
    const colY = [iop[3], iop[4], iop[5]];
    // Normal = rowX x colY
    const normal = [
      rowX[1] * colY[2] - rowX[2] * colY[1],
      rowX[2] * colY[0] - rowX[0] * colY[2],
      rowX[0] * colY[1] - rowX[1] * colY[0]
    ];

    return { origin, rowX, colY, normal };
  };

  const targetGeom = getPlaneVectors(targetInstance);
  const refGeom = getPlaneVectors(referenceInstance);

  // Check dot product of normals: if parallel (e.g. both Axial), there's no intersecting line across the slice
  const normalDot = Math.abs(
    targetGeom.normal[0] * refGeom.normal[0] +
    targetGeom.normal[1] * refGeom.normal[1] +
    targetGeom.normal[2] * refGeom.normal[2]
  );

  if (normalDot > 0.95) {
    // Slices are parallel - no intersecting cross-reference line
    return null;
  }

  // Line equation in target pixel coordinates (x: column, y: row):
  // A * x + B * y + C = 0
  const A = targetSpacingX * (
    targetGeom.rowX[0] * refGeom.normal[0] +
    targetGeom.rowX[1] * refGeom.normal[1] +
    targetGeom.rowX[2] * refGeom.normal[2]
  );

  const B = targetSpacingY * (
    targetGeom.colY[0] * refGeom.normal[0] +
    targetGeom.colY[1] * refGeom.normal[1] +
    targetGeom.colY[2] * refGeom.normal[2]
  );

  const C0 = (
    (targetGeom.origin[0] - refGeom.origin[0]) * refGeom.normal[0] +
    (targetGeom.origin[1] - refGeom.origin[1]) * refGeom.normal[1] +
    (targetGeom.origin[2] - refGeom.origin[2]) * refGeom.normal[2]
  );

  // Find intersections with target image bounding box [0, targetCols] x [0, targetRows]
  const eps = 1e-6;
  const pts: Point2D[] = [];

  const addPointIfUnique = (p: Point2D) => {
    const isDuplicate = pts.some(existing => Math.hypot(existing.x - p.x, existing.y - p.y) < 1.0);
    if (!isDuplicate) {
      pts.push(p);
    }
  };

  if (Math.abs(B) > eps) {
    // Intersect with x = 0 (left edge)
    const y0 = -C0 / B;
    if (y0 >= -1 && y0 <= targetRows + 1) {
      addPointIfUnique({ x: 0, y: Math.max(0, Math.min(targetRows, y0)) });
    }

    // Intersect with x = targetCols (right edge)
    const yW = -(C0 + A * targetCols) / B;
    if (yW >= -1 && yW <= targetRows + 1) {
      addPointIfUnique({ x: targetCols, y: Math.max(0, Math.min(targetRows, yW)) });
    }
  }

  if (Math.abs(A) > eps) {
    // Intersect with y = 0 (top edge)
    const x0 = -C0 / A;
    if (x0 >= -1 && x0 <= targetCols + 1) {
      addPointIfUnique({ x: Math.max(0, Math.min(targetCols, x0)), y: 0 });
    }

    // Intersect with y = targetRows (bottom edge)
    const xH = -(C0 + B * targetRows) / A;
    if (xH >= -1 && xH <= targetCols + 1) {
      addPointIfUnique({ x: Math.max(0, Math.min(targetCols, xH)), y: targetRows });
    }
  }

  if (pts.length < 2) {
    return null;
  }

  const rawDesc = String(referenceInstance.rawTags?.['(0008,103E)']?.value ?? '');
  const refPlane = detectAnatomicalPlane(rawDesc, referenceInstance.imageOrientationPatient);

  let color = '#38bdf8'; // Cyan default
  if (refPlane === 'AXIAL') color = '#38bdf8'; // Cyan for Axial
  else if (refPlane === 'CORONAL') color = '#34d399'; // Emerald for Coronal
  else if (refPlane === 'SAGITTAL') color = '#f59e0b'; // Amber for Sagittal

  return {
    start: pts[0],
    end: pts[1],
    sourcePlane: refPlane || 'OTHER',
    sourceSliceNumber: referenceInstance.instanceNumber || 1,
    sourceSliceLocation: referenceInstance.sliceLocation ?? referenceInstance.imagePositionPatient?.[2],
    color
  };
}
