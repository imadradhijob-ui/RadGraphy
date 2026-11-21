/**
 * Orientation Service for Medical DICOM Imaging
 * Calculates anatomical direction labels (A/P, L/R, S/I) and 3D orientation coordinates
 * based on DICOM Image Orientation Patient (IOP) tags, rotation, and flipping.
 */

export interface AnatomicalDirections {
  top: string;
  bottom: string;
  left: string;
  right: string;
}

export interface Orientation3DTransform {
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  scaleX: number;
  scaleY: number;
}

type Vector3 = [number, number, number];

/**
 * Normalizes a 3D vector
 */
function normalize(v: Vector3): Vector3 {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Cross product of two 3D vectors
 */
function cross(a: Vector3, b: Vector3): Vector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

/**
 * Maps a direction vector in patient coordinates to an anatomical letter
 * +X: Left (L), -X: Right (R)
 * +Y: Posterior (P), -Y: Anterior (A)
 * +Z: Superior (S), -Z: Inferior (I)
 */
function vectorToAnatomicalLabel(v: Vector3): string {
  const absX = Math.abs(v[0]);
  const absY = Math.abs(v[1]);
  const absZ = Math.abs(v[2]);

  let primary = '';
  let maxVal = 0;

  if (absX >= absY && absX >= absZ) {
    primary = v[0] > 0 ? 'L' : 'R';
    maxVal = absX;
  } else if (absY >= absX && absY >= absZ) {
    primary = v[1] > 0 ? 'P' : 'A';
    maxVal = absY;
  } else {
    primary = v[2] > 0 ? 'S' : 'I';
    maxVal = absZ;
  }

  // Check for oblique component (if secondary is > 0.45 of primary)
  let secondary = '';
  if (primary !== 'L' && primary !== 'R' && absX > 0.45 * maxVal) {
    secondary = v[0] > 0 ? 'L' : 'R';
  } else if (primary !== 'P' && primary !== 'A' && absY > 0.45 * maxVal) {
    secondary = v[1] > 0 ? 'P' : 'A';
  } else if (primary !== 'S' && primary !== 'I' && absZ > 0.45 * maxVal) {
    secondary = v[2] > 0 ? 'S' : 'I';
  }

  return primary + secondary;
}

/**
 * Computes standard 4-edge anatomical labels (Top, Bottom, Left, Right)
 */
export function getAnatomicalDirections(
  iop?: [number, number, number, number, number, number],
  rotation: number = 0,
  flipH: boolean = false,
  flipV: boolean = false,
  planeFallback?: 'AXIAL' | 'CORONAL' | 'SAGITTAL' | null
): AnatomicalDirections {
  let rowVec: Vector3;
  let colVec: Vector3;

  if (iop && iop.length === 6 && (iop[0] !== 0 || iop[1] !== 0 || iop[2] !== 0)) {
    rowVec = normalize([iop[0], iop[1], iop[2]]);
    colVec = normalize([iop[3], iop[4], iop[5]]);
  } else {
    // Standard anatomical plane defaults
    switch (planeFallback) {
      case 'CORONAL':
        rowVec = [1, 0, 0];    // +X (Patient Left)
        colVec = [0, 0, -1];   // -Z (Patient Inferior)
        break;
      case 'SAGITTAL':
        rowVec = [0, 1, 0];    // +Y (Patient Posterior)
        colVec = [0, 0, -1];   // -Z (Patient Inferior)
        break;
      case 'AXIAL':
      default:
        rowVec = [1, 0, 0];    // +X (Patient Left)
        colVec = [0, 1, 0];    // +Y (Patient Posterior)
        break;
    }
  }

  // Apply horizontal and vertical flip to base image vectors
  if (flipH) {
    rowVec = [-rowVec[0], -rowVec[1], -rowVec[2]];
  }
  if (flipV) {
    colVec = [-colVec[0], -colVec[1], -colVec[2]];
  }

  // Screen orientation accounting for clockwise rotation:
  // Rotation 0:   Screen Right = +rowVec, Screen Down = +colVec
  // Rotation 90:  Screen Right = -colVec, Screen Down = +rowVec
  // Rotation 180: Screen Right = -rowVec, Screen Down = -colVec
  // Rotation 270: Screen Right = +colVec, Screen Down = -rowVec
  const normRot = ((rotation % 360) + 360) % 360;
  const rad = (normRot * Math.PI) / 180;
  const cos = Math.round(Math.cos(rad));
  const sin = Math.round(Math.sin(rad));

  const screenRight: Vector3 = [
    cos * rowVec[0] - sin * colVec[0],
    cos * rowVec[1] - sin * colVec[1],
    cos * rowVec[2] - sin * colVec[2]
  ];

  const screenDown: Vector3 = [
    sin * rowVec[0] + cos * colVec[0],
    sin * rowVec[1] + cos * colVec[1],
    sin * rowVec[2] + cos * colVec[2]
  ];

  const screenLeft: Vector3 = [-screenRight[0], -screenRight[1], -screenRight[2]];
  const screenUp: Vector3 = [-screenDown[0], -screenDown[1], -screenDown[2]];

  return {
    top: vectorToAnatomicalLabel(screenUp),
    bottom: vectorToAnatomicalLabel(screenDown),
    left: vectorToAnatomicalLabel(screenLeft),
    right: vectorToAnatomicalLabel(screenRight)
  };
}

/**
 * Calculates CSS 3D transform parameters for the Orientation Cube
 */
export function getOrientationCubeTransform(
  plane?: 'AXIAL' | 'CORONAL' | 'SAGITTAL' | null,
  rotation: number = 0,
  flipH: boolean = false,
  flipV: boolean = false
): Orientation3DTransform {
  let baseRx = 0;
  let baseRy = 0;
  let baseRz = 0;

  switch (plane) {
    case 'CORONAL':
      // Coronal is viewed from Anterior (front)
      baseRx = -15;
      baseRy = 20;
      baseRz = 0;
      break;
    case 'SAGITTAL':
      // Sagittal is viewed from Right/Left lateral
      baseRx = -15;
      baseRy = -70;
      baseRz = 0;
      break;
    case 'AXIAL':
    default:
      // Axial is viewed from Head/Feet
      baseRx = -70;
      baseRy = 0;
      baseRz = 20;
      break;
  }

  // Adjust for rotation around viewer axis
  baseRz += rotation;

  return {
    rotateX: baseRx,
    rotateY: baseRy,
    rotateZ: baseRz,
    scaleX: flipH ? -1 : 1,
    scaleY: flipV ? -1 : 1
  };
}
