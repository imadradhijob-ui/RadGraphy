import { Volume3D } from './mprEngine';

// Canonical Marching Cubes edge and triangle lookup tables
// Edge table: 256 entries bitmask indicating which edges are intersected by the isosurface
const EDGE_TABLE = new Int32Array([
  0x0, 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c,
  0x80c, 0x905, 0xa0f, 0xb06, 0xc0a, 0xd03, 0xe09, 0xf00,
  0x190, 0x99, 0x393, 0x29a, 0x596, 0x49f, 0x795, 0x69c,
  0x99c, 0x895, 0xb9f, 0xa96, 0xd9a, 0xc93, 0xf99, 0xe90,
  0x230, 0x339, 0x33, 0x13a, 0x636, 0x73f, 0x435, 0x53c,
  0xa3c, 0xb35, 0x83f, 0x936, 0xe3a, 0xf33, 0xc39, 0xd30,
  0x3a0, 0x2a9, 0x1a3, 0xaa, 0x7a6, 0x6af, 0x5a5, 0x4ac,
  0xba0, 0xaa5, 0x9af, 0x8a6, 0xfaa, 0xea3, 0xda9, 0xca0,
  0x460, 0x569, 0x663, 0x76a, 0x66, 0x16f, 0x265, 0x36c,
  0xc6c, 0xd65, 0xe6f, 0xf66, 0x86a, 0x963, 0xa69, 0xb60,
  0x5f0, 0x4f9, 0x7f3, 0x6fa, 0x1f6, 0xff, 0x3f5, 0x2fc,
  0xdfc, 0xcf5, 0xfff, 0xef6, 0x9fa, 0x8f3, 0xbf9, 0xaf0,
  0x650, 0x759, 0x453, 0x55a, 0x256, 0x35f, 0x55, 0x15c,
  0xe5c, 0xf55, 0xc5f, 0xd56, 0xa5a, 0xb53, 0x859, 0x950,
  0x7c0, 0x6c9, 0x5c3, 0x4ca, 0x3c6, 0x2cf, 0x1c5, 0xcc,
  0xfcc, 0xec5, 0xdcf, 0xcc6, 0xbca, 0xac3, 0x9c9, 0x8c0,
  0x8c0, 0x9c9, 0xac3, 0xbca, 0xcc6, 0xdcf, 0xec5, 0xfcc,
  0xcc, 0x1c5, 0x2cf, 0x3c6, 0x4ca, 0x5c3, 0x6c9, 0x7c0,
  0x950, 0x859, 0xb53, 0xa5a, 0xd56, 0xc5f, 0xf55, 0xe5c,
  0x55, 0x35f, 0x256, 0x15a, 0x453, 0x759, 0x650, 0x55a,
  0xaf0, 0xbf9, 0x8f3, 0x9fa, 0xef6, 0xfff, 0xcf5, 0xdfc,
  0x2fc, 0x3f5, 0xff, 0x1f6, 0x6fa, 0x7f3, 0x4f9, 0x5f0,
  0xb60, 0xa69, 0x963, 0x86a, 0xf66, 0xe6f, 0xd65, 0xc6c,
  0x36c, 0x265, 0x16f, 0x66, 0x76a, 0x663, 0x569, 0x460,
  0xca0, 0xda9, 0xea3, 0xfaa, 0x8a6, 0x9af, 0xaa5, 0xba0,
  0x4ac, 0x5a5, 0x6af, 0x7a6, 0xaa, 0x1a3, 0x2a9, 0x3a0,
  0xd30, 0xc39, 0xf33, 0xe3a, 0x936, 0x83f, 0xb35, 0xa3c,
  0x53c, 0x435, 0x73f, 0x636, 0x13a, 0x33, 0x339, 0x230,
  0xe90, 0xf99, 0xc93, 0xd9a, 0xa96, 0xb9f, 0x895, 0x99c,
  0x69c, 0x795, 0x49f, 0x596, 0x29a, 0x393, 0x99, 0x190,
  0xf00, 0xe09, 0xd03, 0xc0a, 0xb06, 0xa0f, 0x905, 0x80c,
  0x70c, 0x605, 0x50f, 0x406, 0x30a, 0x203, 0x109, 0x0
]);

// 12 edges of a cube connecting vertices
const EDGE_PAIRS = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7]
];

// Relative vertex offsets within a unit cube
const VERT_OFFSETS = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
];

// Triangles table compressed: 256 rows, each up to 16 edge indices terminated with -1
const TRI_TABLE: number[][] = [
  [-1],
  [0, 8, 3, -1],
  [0, 1, 9, -1],
  [1, 8, 3, 9, 8, 1, -1],
  [1, 2, 10, -1],
  [0, 8, 3, 1, 2, 10, -1],
  [9, 2, 10, 0, 2, 9, -1],
  [2, 8, 3, 2, 10, 8, 10, 9, 8, -1],
  [3, 11, 2, -1],
  [0, 11, 2, 8, 11, 0, -1],
  [1, 9, 0, 2, 3, 11, -1],
  [1, 11, 2, 1, 9, 11, 9, 8, 11, -1],
  [3, 10, 1, 11, 10, 3, -1],
  [0, 10, 1, 0, 8, 10, 8, 11, 10, -1],
  [3, 9, 0, 3, 11, 9, 11, 10, 9, -1],
  [9, 8, 10, 10, 8, 11, -1],
  [4, 7, 8, -1],
  [4, 3, 0, 7, 3, 4, -1],
  [0, 1, 9, 8, 4, 7, -1],
  [4, 1, 9, 4, 7, 1, 7, 3, 1, -1],
  [1, 2, 10, 8, 4, 7, -1],
  [3, 4, 7, 3, 0, 4, 1, 2, 10, -1],
  [9, 2, 10, 9, 0, 2, 8, 4, 7, -1],
  [2, 10, 9, 2, 9, 7, 2, 7, 3, 7, 9, 4, -1],
  [8, 4, 7, 3, 11, 2, -1],
  [11, 4, 7, 11, 2, 4, 2, 0, 4, -1],
  [9, 0, 1, 8, 4, 7, 2, 3, 11, -1],
  [4, 7, 11, 9, 4, 11, 9, 11, 2, 9, 2, 1, -1],
  [3, 10, 1, 3, 11, 10, 7, 8, 4, -1],
  [1, 11, 10, 1, 4, 11, 1, 0, 4, 7, 11, 4, -1],
  [4, 7, 8, 9, 0, 11, 9, 11, 10, 11, 0, 3, -1],
  [4, 7, 11, 4, 11, 9, 9, 11, 10, -1],
  [9, 5, 4, -1],
  [9, 5, 4, 0, 8, 3, -1],
  [0, 5, 4, 1, 5, 0, -1],
  [8, 5, 4, 8, 3, 5, 3, 1, 5, -1],
  [1, 2, 10, 9, 5, 4, -1],
  [3, 0, 8, 1, 2, 10, 4, 9, 5, -1],
  [5, 2, 10, 5, 4, 2, 4, 0, 2, -1],
  [2, 10, 5, 3, 2, 5, 3, 5, 4, 3, 4, 8, -1],
  [9, 5, 4, 2, 3, 11, -1],
  [0, 11, 2, 0, 8, 11, 4, 9, 5, -1],
  [0, 5, 4, 0, 1, 5, 2, 3, 11, -1],
  [2, 1, 5, 2, 5, 8, 2, 8, 11, 4, 8, 5, -1],
  [10, 3, 11, 10, 1, 3, 9, 5, 4, -1],
  [4, 9, 5, 0, 8, 1, 8, 10, 1, 8, 11, 10, -1],
  [5, 4, 0, 5, 0, 11, 5, 11, 10, 11, 0, 3, -1],
  [5, 4, 8, 5, 8, 10, 10, 8, 11, -1],
  [9, 7, 8, 5, 7, 9, -1],
  [9, 3, 0, 9, 5, 3, 5, 7, 3, -1],
  [0, 7, 8, 0, 1, 7, 1, 5, 7, -1],
  [1, 5, 3, 3, 5, 7, -1],
  [9, 7, 8, 9, 5, 7, 10, 1, 2, -1],
  [10, 1, 2, 9, 5, 0, 5, 3, 0, 5, 7, 3, -1],
  [8, 0, 2, 8, 2, 5, 8, 5, 7, 10, 5, 2, -1],
  [2, 10, 5, 2, 5, 3, 3, 5, 7, -1],
  [7, 9, 5, 7, 8, 9, 3, 11, 2, -1],
  [9, 5, 7, 9, 7, 2, 9, 2, 0, 2, 7, 11, -1],
  [2, 3, 11, 0, 1, 8, 1, 7, 8, 1, 5, 7, -1],
  [11, 2, 1, 11, 1, 7, 7, 1, 5, -1],
  [9, 5, 8, 8, 5, 7, 10, 1, 3, 10, 3, 11, -1],
  [5, 7, 0, 5, 0, 9, 7, 11, 0, 1, 0, 10, 11, 10, 0, -1],
  [11, 10, 0, 11, 0, 3, 10, 5, 0, 8, 0, 7, 5, 7, 0, -1],
  [11, 10, 5, 7, 11, 5, -1],
  [10, 6, 5, -1],
  [0, 8, 3, 5, 10, 6, -1],
  [9, 0, 1, 5, 10, 6, -1],
  [1, 8, 3, 1, 9, 8, 5, 10, 6, -1],
  [1, 6, 5, 2, 6, 1, -1],
  [1, 6, 5, 1, 2, 6, 3, 0, 8, -1],
  [9, 6, 5, 9, 0, 6, 0, 2, 6, -1],
  [5, 9, 0, 5, 0, 6, 2, 6, 0, 8, 3, 6, -1],
  [2, 3, 11, 10, 6, 5, -1],
  [11, 0, 8, 11, 2, 0, 10, 6, 5, -1],
  [0, 1, 9, 2, 3, 11, 5, 10, 6, -1],
  [5, 10, 6, 1, 9, 2, 9, 11, 2, 9, 8, 11, -1],
  [6, 3, 11, 6, 5, 3, 5, 1, 3, -1],
  [0, 8, 11, 0, 11, 5, 0, 5, 1, 5, 11, 6, -1],
  [3, 11, 6, 0, 3, 6, 0, 6, 5, 0, 5, 9, -1],
  [6, 5, 9, 6, 9, 11, 11, 9, 8, -1],
  [5, 10, 6, 4, 7, 8, -1],
  [4, 3, 0, 4, 7, 3, 6, 5, 10, -1],
  [1, 9, 0, 5, 10, 6, 8, 4, 7, -1],
  [10, 6, 5, 1, 9, 7, 1, 7, 3, 7, 9, 4, -1],
  [6, 1, 2, 6, 5, 1, 4, 7, 8, -1],
  [1, 2, 5, 5, 2, 6, 3, 0, 4, 3, 4, 7, -1],
  [8, 4, 7, 9, 0, 5, 0, 6, 5, 0, 2, 6, -1],
  [7, 3, 9, 7, 9, 4, 3, 2, 9, 5, 9, 6, 2, 6, 9, -1],
  [3, 11, 2, 7, 8, 4, 10, 6, 5, -1],
  [5, 10, 6, 4, 7, 2, 4, 2, 0, 2, 7, 11, -1],
  [0, 1, 9, 4, 7, 8, 2, 3, 11, 5, 10, 6, -1],
  [9, 2, 1, 9, 11, 2, 9, 4, 11, 7, 11, 4, 5, 10, 6, -1],
  [8, 4, 7, 3, 11, 5, 3, 5, 1, 5, 11, 6, -1],
  [5, 1, 11, 5, 11, 6, 1, 0, 11, 7, 11, 4, 0, 4, 11, -1],
  [0, 5, 9, 0, 6, 5, 0, 3, 6, 11, 6, 3, 8, 4, 7, -1],
  [6, 5, 9, 6, 9, 11, 4, 7, 9, 7, 11, 9, -1],
  [10, 4, 9, 6, 4, 10, -1],
  [4, 10, 6, 4, 9, 10, 0, 8, 3, -1],
  [10, 0, 1, 10, 6, 0, 6, 4, 0, -1],
  [8, 3, 1, 8, 1, 6, 8, 6, 4, 6, 1, 10, -1],
  [1, 4, 9, 1, 2, 4, 2, 6, 4, -1],
  [3, 0, 8, 1, 2, 9, 2, 4, 9, 2, 6, 4, -1],
  [0, 2, 4, 4, 2, 6, -1],
  [8, 3, 2, 8, 2, 4, 4, 2, 6, -1],
  [10, 4, 9, 10, 6, 4, 11, 2, 3, -1],
  [0, 8, 2, 2, 8, 11, 4, 9, 10, 4, 10, 6, -1],
  [3, 11, 2, 0, 1, 6, 0, 6, 4, 6, 1, 10, -1],
  [6, 4, 1, 6, 1, 10, 4, 8, 1, 2, 1, 11, 8, 11, 1, -1],
  [9, 6, 4, 9, 3, 6, 9, 1, 3, 11, 6, 3, -1],
  [8, 11, 1, 8, 1, 0, 11, 6, 1, 9, 1, 4, 6, 4, 1, -1],
  [3, 11, 6, 3, 6, 0, 0, 6, 4, -1],
  [8, 11, 6, 8, 6, 4, -1],
  [9, 7, 8, 9, 10, 7, 10, 6, 7, -1],
  [8, 9, 10, 8, 10, 7, 7, 10, 6, 0, 8, 3, -1],
  [0, 7, 8, 0, 1, 7, 6, 7, 10, 1, 10, 7, -1],
  [10, 6, 7, 1, 10, 7, 1, 7, 3, -1],
  [1, 2, 6, 1, 6, 8, 1, 8, 9, 8, 6, 7, -1],
  [2, 6, 9, 2, 9, 1, 6, 7, 9, 0, 9, 3, 7, 3, 9, -1],
  [7, 8, 0, 7, 0, 6, 6, 0, 2, -1],
  [7, 3, 2, 6, 7, 2, -1],
  [2, 3, 11, 10, 6, 8, 10, 8, 9, 8, 6, 7, -1],
  [2, 0, 7, 2, 7, 11, 0, 9, 7, 6, 7, 10, 9, 10, 7, -1],
  [1, 8, 0, 1, 7, 8, 1, 10, 7, 6, 7, 10, 2, 3, 11, -1],
  [11, 2, 1, 11, 1, 7, 10, 6, 1, 6, 7, 1, -1],
  [8, 9, 6, 8, 6, 7, 9, 1, 6, 11, 6, 3, 1, 3, 6, -1],
  [0, 9, 1, 11, 6, 7, -1],
  [7, 8, 0, 7, 0, 6, 3, 11, 0, 11, 6, 0, -1],
  [7, 11, 6, -1]
];

export interface StlExportProgress {
  percent: number;
  phase: string;
  triangleCount: number;
}

export class StlExportService {
  /**
   * Generates a binary STL 3D printable model from Volume3D using the Marching Cubes algorithm.
   */
  static generateBinaryStl(
    volume: Volume3D,
    huThreshold: number = 220, // Default Bone threshold (220 HU)
    subsample: number = 1,     // 1 = Full Native Resolution, 2 = Fast 2x Subsample
    onProgress?: (progress: StlExportProgress) => void
  ): Uint8Array {
    const { dimX, dimY, dimZ, spacingX, spacingY, spacingZ, data } = volume;
    const sliceArea = dimX * dimY;

    // Estimate triangles and collect dynamic vertex buffer
    const vertices: number[] = [];
    const normals: number[] = [];

    const step = Math.max(1, Math.floor(subsample));
    const totalCubesZ = Math.floor((dimZ - 1) / step);

    // Temp buffers for cube vertices values and coords
    const val = new Float32Array(8);
    const pos = new Float32Array(24);
    const edgeVerts = new Float32Array(36); // 12 edges * 3 coords

    let processedCubes = 0;
    const totalCubes = Math.floor((dimX - 1) / step) * Math.floor((dimY - 1) / step) * totalCubesZ;

    for (let z = 0; z < dimZ - step; z += step) {
      if (onProgress && z % (step * 8) === 0) {
        const percent = Math.min(95, Math.round((processedCubes / totalCubes) * 100));
        onProgress({
          percent,
          phase: `Computing 3D Isosurface at ${huThreshold} HU...`,
          triangleCount: vertices.length / 9
        });
      }

      for (let y = 0; y < dimY - step; y += step) {
        for (let x = 0; x < dimX - step; x += step) {
          processedCubes++;

          // 8 corner values of the cube
          val[0] = data[z * sliceArea + y * dimX + x];
          val[1] = data[z * sliceArea + y * dimX + (x + step)];
          val[2] = data[z * sliceArea + (y + step) * dimX + (x + step)];
          val[3] = data[z * sliceArea + (y + step) * dimX + x];
          val[4] = data[(z + step) * sliceArea + y * dimX + x];
          val[5] = data[(z + step) * sliceArea + y * dimX + (x + step)];
          val[6] = data[(z + step) * sliceArea + (y + step) * dimX + (x + step)];
          val[7] = data[(z + step) * sliceArea + (y + step) * dimX + x];

          // Compute 8-bit cube index
          let cubeIndex = 0;
          if (val[0] >= huThreshold) cubeIndex |= 1;
          if (val[1] >= huThreshold) cubeIndex |= 2;
          if (val[2] >= huThreshold) cubeIndex |= 4;
          if (val[3] >= huThreshold) cubeIndex |= 8;
          if (val[4] >= huThreshold) cubeIndex |= 16;
          if (val[5] >= huThreshold) cubeIndex |= 32;
          if (val[6] >= huThreshold) cubeIndex |= 64;
          if (val[7] >= huThreshold) cubeIndex |= 128;

          if (cubeIndex === 0 || cubeIndex === 255) {
            continue; // Cube completely inside or completely outside
          }

          // Populate corner positions in physical mm
          for (let i = 0; i < 8; i++) {
            pos[i * 3 + 0] = (x + VERT_OFFSETS[i][0] * step) * spacingX;
            pos[i * 3 + 1] = (y + VERT_OFFSETS[i][1] * step) * spacingY;
            pos[i * 3 + 2] = (z + VERT_OFFSETS[i][2] * step) * spacingZ;
          }

          // Find the vertices where the surface intersects the cube edges
          const edges = EDGE_TABLE[cubeIndex];
          for (let e = 0; e < 12; e++) {
            if (edges & (1 << e)) {
              const v0 = EDGE_PAIRS[e][0];
              const v1 = EDGE_PAIRS[e][1];
              const val0 = val[v0];
              const val1 = val[v1];
              let mu = 0.5;
              if (Math.abs(val1 - val0) > 1e-4) {
                mu = (huThreshold - val0) / (val1 - val0);
                mu = Math.max(0.0, Math.min(1.0, mu));
              }

              edgeVerts[e * 3 + 0] = pos[v0 * 3 + 0] + mu * (pos[v1 * 3 + 0] - pos[v0 * 3 + 0]);
              edgeVerts[e * 3 + 1] = pos[v0 * 3 + 1] + mu * (pos[v1 * 3 + 1] - pos[v0 * 3 + 1]);
              edgeVerts[e * 3 + 2] = pos[v0 * 3 + 2] + mu * (pos[v1 * 3 + 2] - pos[v0 * 3 + 2]);
            }
          }

          // Lookup triangle edge sequence for this cube configuration
          const triEdges = TRI_TABLE[cubeIndex];
          if (!triEdges) continue;

          for (let i = 0; i < triEdges.length; i += 3) {
            if (triEdges[i] === -1 || i + 2 >= triEdges.length) break;

            const e0 = triEdges[i];
            const e1 = triEdges[i + 1];
            const e2 = triEdges[i + 2];

            const ax = edgeVerts[e0 * 3 + 0], ay = edgeVerts[e0 * 3 + 1], az = edgeVerts[e0 * 3 + 2];
            const bx = edgeVerts[e1 * 3 + 0], by = edgeVerts[e1 * 3 + 1], bz = edgeVerts[e1 * 3 + 2];
            const cx = edgeVerts[e2 * 3 + 0], cy = edgeVerts[e2 * 3 + 1], cz = edgeVerts[e2 * 3 + 2];

            // Surface normal via cross product (B - A) x (C - A)
            const ux = bx - ax, uy = by - ay, uz = bz - az;
            const vx = cx - ax, vy = cy - ay, vz = cz - az;
            let nx = uy * vz - uz * vy;
            let ny = uz * vx - ux * vz;
            let nz = ux * vy - uy * vx;
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
            if (len > 1e-6) {
              nx /= len; ny /= len; nz /= len;
            } else {
              nx = 0; ny = 0; nz = 1;
            }

            normals.push(nx, ny, nz);
            vertices.push(ax, ay, az, bx, by, bz, cx, cy, cz);
          }
        }
      }
    }

    const numTriangles = vertices.length / 9;
    if (onProgress) {
      onProgress({ percent: 98, phase: 'Encoding Binary STL File Format...', triangleCount: numTriangles });
    }

    // Standard Binary STL Format:
    // 80 bytes header + 4 bytes numTriangles + (numTriangles * 50 bytes)
    const stlSize = 84 + numTriangles * 50;
    const buffer = new ArrayBuffer(stlSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // 1. 80-byte header
    const headerStr = `RadNode 3D Medical Model - Threshold: ${huThreshold} HU - Triangles: ${numTriangles}`;
    for (let i = 0; i < Math.min(80, headerStr.length); i++) {
      bytes[i] = headerStr.charCodeAt(i);
    }

    // 2. 4-byte uint32: number of triangles
    view.setUint32(80, numTriangles, true);

    // 3. Triangles: each 50 bytes
    let offset = 84;
    let nIdx = 0;
    let vIdx = 0;

    for (let t = 0; t < numTriangles; t++) {
      // Normal vector (12 bytes)
      view.setFloat32(offset + 0, normals[nIdx++], true);
      view.setFloat32(offset + 4, normals[nIdx++], true);
      view.setFloat32(offset + 8, normals[nIdx++], true);

      // Vertex 1 (12 bytes)
      view.setFloat32(offset + 12, vertices[vIdx++], true);
      view.setFloat32(offset + 16, vertices[vIdx++], true);
      view.setFloat32(offset + 20, vertices[vIdx++], true);

      // Vertex 2 (12 bytes)
      view.setFloat32(offset + 24, vertices[vIdx++], true);
      view.setFloat32(offset + 28, vertices[vIdx++], true);
      view.setFloat32(offset + 32, vertices[vIdx++], true);

      // Vertex 3 (12 bytes)
      view.setFloat32(offset + 36, vertices[vIdx++], true);
      view.setFloat32(offset + 40, vertices[vIdx++], true);
      view.setFloat32(offset + 44, vertices[vIdx++], true);

      // Attribute byte count (2 bytes)
      view.setUint16(offset + 48, 0, true);

      offset += 50;
    }

    if (onProgress) {
      onProgress({ percent: 100, phase: 'Ready for 3D Printing Export', triangleCount: numTriangles });
    }

    return bytes;
  }

  /**
   * Prompts download of the 3D STL file directly to user's computer or flash drive.
   */
  static downloadStlFile(stlBytes: Uint8Array, fileName: string) {
    const blob = new Blob([stlBytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.endsWith('.stl') ? fileName : `${fileName}.stl`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
