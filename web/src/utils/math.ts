export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export const DEG = Math.PI / 180;

export const round = (v: number, digits = 2): number => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

/** Exponential smoothing factor for a time step, independent of frame rate. */
export const expAlpha = (dtSeconds: number, timeConstant: number): number =>
  1 - Math.exp(-dtSeconds / Math.max(1e-4, timeConstant));
