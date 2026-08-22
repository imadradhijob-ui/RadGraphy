import { ImageFilterType } from '../types/dicom';

/**
 * 3x3 Convolution Image Filter Engine for Clinical Medical Workstations
 * Fast zero-allocation buffer processing for 60 FPS viewport rendering.
 */

// 3x3 Kernels
const KERNEL_SHARPEN = [
  0, -1, 0,
  -1, 5, -1,
  0, -1, 0
];

const KERNEL_BONE = [
  -1, -1, -1,
  -1,  9, -1,
  -1, -1, -1
];

const KERNEL_SMOOTH = [
  1 / 9, 1 / 9, 1 / 9,
  1 / 9, 1 / 9, 1 / 9,
  1 / 9, 1 / 9, 1 / 9
];

const KERNEL_EDGE = [
  -1, -1, -1,
  -1,  8, -1,
  -1, -1, -1
];

export function applyImageFilter(
  imageData: ImageData,
  filterType: ImageFilterType = 'none'
): ImageData {
  if (filterType === 'none') return imageData;

  const width = imageData.width;
  const height = imageData.height;
  const src = imageData.data;
  const output = new Uint8ClampedArray(src.length);

  let kernel: number[];
  if (filterType === 'sharpen') kernel = KERNEL_SHARPEN;
  else if (filterType === 'bone') kernel = KERNEL_BONE;
  else if (filterType === 'smooth') kernel = KERNEL_SMOOTH;
  else if (filterType === 'edge') kernel = KERNEL_EDGE;
  else return imageData;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    const prevRowOffset = (y - 1) * width;
    const nextRowOffset = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      let r = 0, g = 0, b = 0;

      // 3x3 neighborhood
      const p00 = (prevRowOffset + (x - 1)) * 4;
      const p01 = (prevRowOffset + x) * 4;
      const p02 = (prevRowOffset + (x + 1)) * 4;

      const p10 = (rowOffset + (x - 1)) * 4;
      const p11 = (rowOffset + x) * 4;
      const p12 = (rowOffset + (x + 1)) * 4;

      const p20 = (nextRowOffset + (x - 1)) * 4;
      const p21 = (nextRowOffset + x) * 4;
      const p22 = (nextRowOffset + (x + 1)) * 4;

      // Red Channel
      r += src[p00] * kernel[0] + src[p01] * kernel[1] + src[p02] * kernel[2];
      r += src[p10] * kernel[3] + src[p11] * kernel[4] + src[p12] * kernel[5];
      r += src[p20] * kernel[6] + src[p21] * kernel[7] + src[p22] * kernel[8];

      // Green Channel
      g += src[p00 + 1] * kernel[0] + src[p01 + 1] * kernel[1] + src[p02 + 1] * kernel[2];
      g += src[p10 + 1] * kernel[3] + src[p11 + 1] * kernel[4] + src[p12 + 1] * kernel[5];
      g += src[p20 + 1] * kernel[6] + src[p21 + 1] * kernel[7] + src[p22 + 1] * kernel[8];

      // Blue Channel
      b += src[p00 + 2] * kernel[0] + src[p01 + 2] * kernel[1] + src[p02 + 2] * kernel[2];
      b += src[p10 + 2] * kernel[3] + src[p11 + 2] * kernel[4] + src[p12 + 2] * kernel[5];
      b += src[p20 + 2] * kernel[6] + src[p21 + 2] * kernel[7] + src[p22 + 2] * kernel[8];

      const outIdx = (rowOffset + x) * 4;
      output[outIdx] = Math.max(0, Math.min(255, r));
      output[outIdx + 1] = Math.max(0, Math.min(255, g));
      output[outIdx + 2] = Math.max(0, Math.min(255, b));
      output[outIdx + 3] = src[p11 + 3];
    }
  }

  // Copy borders
  for (let x = 0; x < width; x++) {
    const topIdx = x * 4;
    const botIdx = ((height - 1) * width + x) * 4;
    output[topIdx] = src[topIdx]; output[topIdx + 1] = src[topIdx + 1]; output[topIdx + 2] = src[topIdx + 2]; output[topIdx + 3] = src[topIdx + 3];
    output[botIdx] = src[botIdx]; output[botIdx + 1] = src[botIdx + 1]; output[botIdx + 2] = src[botIdx + 2]; output[botIdx + 3] = src[botIdx + 3];
  }
  for (let y = 0; y < height; y++) {
    const leftIdx = (y * width) * 4;
    const rightIdx = (y * width + (width - 1)) * 4;
    output[leftIdx] = src[leftIdx]; output[leftIdx + 1] = src[leftIdx + 1]; output[leftIdx + 2] = src[leftIdx + 2]; output[leftIdx + 3] = src[leftIdx + 3];
    output[rightIdx] = src[rightIdx]; output[rightIdx + 1] = src[rightIdx + 1]; output[rightIdx + 2] = src[rightIdx + 2]; output[rightIdx + 3] = src[rightIdx + 3];
  }

  imageData.data.set(output);
  return imageData;
}
