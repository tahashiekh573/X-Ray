/** Mean Rec.709 luma of RGBA pixel data, 0..1. */
export function meanLuma(data: ArrayLike<number>): number {
  let sum = 0;
  const n = Math.floor(data.length / 4);
  if (n === 0) return 0;
  for (let i = 0; i < n; i++) {
    sum += 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
  }
  return sum / n / 255;
}

/** Mean luma below which tracking typically degrades (measured on the face, or frame centre). */
export const LOW_LIGHT_THRESHOLD = 0.14;

export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bounding box of landmarks (normalised), used to measure light on the face itself. */
export function landmarkBounds(lm: ArrayLike<number>, ids: readonly number[]): NormRect {
  let x0 = 1;
  let y0 = 1;
  let x1 = 0;
  let y1 = 0;
  for (const i of ids) {
    x0 = Math.min(x0, lm[i * 3]);
    y0 = Math.min(y0, lm[i * 3 + 1]);
    x1 = Math.max(x1, lm[i * 3]);
    y1 = Math.max(y1, lm[i * 3 + 1]);
  }
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  return { x: clamp01(x0), y: clamp01(y0), w: clamp01(x1) - clamp01(x0), h: clamp01(y1) - clamp01(y0) };
}

const CENTRE: NormRect = { x: 0.25, y: 0.2, w: 0.5, h: 0.6 };
let canvas: HTMLCanvasElement | null = null;

/** Samples a tiny downscaled crop of the current video frame (stays on-device). */
export function sampleVideoLuma(video: HTMLVideoElement, region: NormRect = CENTRE): number | null {
  if (video.readyState < 2 || !video.videoWidth || region.w <= 0 || region.h <= 0) return null;
  canvas ??= document.createElement('canvas');
  canvas.width = 24;
  canvas.height = 24;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const w = video.videoWidth;
  const h = video.videoHeight;
  ctx.drawImage(video, region.x * w, region.y * h, region.w * w, region.h * h, 0, 0, 24, 24);
  return meanLuma(ctx.getImageData(0, 0, 24, 24).data);
}
