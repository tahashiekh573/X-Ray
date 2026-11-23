import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { Calibration } from '@/types/settings';
import { CANONICAL } from '@/features/tracking/landmarks';
import { unproject } from '@/features/tracking/faceMath';
import { clamp, DEG } from '@/utils/math';

export const CALIBRATION_LIMITS = {
  scale: [0.7, 1.4],
  width: [0.75, 1.3],
  height: [0.75, 1.3],
  depth: [0.75, 1.3],
  offsetX: [-4, 4],
  offsetY: [-4, 4],
  offsetZ: [-5, 5],
  pitch: [-25, 25],
  yaw: [-20, 20],
  roll: [-20, 20],
} as const satisfies Record<keyof Calibration, readonly [number, number]>;

export function clampCalibration(c: Calibration): Calibration {
  const out = { ...c };
  for (const key of Object.keys(CALIBRATION_LIMITS) as (keyof Calibration)[]) {
    const [lo, hi] = CALIBRATION_LIMITS[key];
    out[key] = clamp(Number.isFinite(c[key]) ? c[key] : 0, lo, hi);
  }
  return out;
}

/**
 * Head-space calibration transform: scale/rotate about the head centre, then offset.
 * Positive pitch tilts the model upwards (chin forward), positive yaw turns it towards the
 * subject's left, positive roll tilts it towards the subject's left shoulder.
 */
export function calibrationMatrix(c: Calibration, centre: Vector3, out = new Matrix4()): Matrix4 {
  const rot = new Quaternion().setFromEuler(new Euler(-c.pitch * DEG, c.yaw * DEG, -c.roll * DEG, 'YXZ'));
  const scale = new Vector3(c.scale * c.width, c.scale * c.height, c.scale * c.depth);
  const m = new Matrix4().compose(new Vector3(), rot, scale);
  const toCentre = new Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z);
  const back = new Matrix4().makeTranslation(centre.x + c.offsetX, centre.y + c.offsetY, centre.z + c.offsetZ);
  return out.copy(back).multiply(m).multiply(toCentre);
}

export const CALIBRATION_LANDMARKS = [33, 133, 362, 263, 168, 152, 234, 454] as const;

/**
 * Where the user's actual landmarks lie in the canonical head frame.
 *
 * For each landmark: predict its depth by transforming the canonical point with the facial
 * transformation matrix, unproject the observed 2D landmark at that depth, then map it back
 * through the inverse matrix. Deviations from the canonical coordinates in x/y describe how the
 * user's face proportions differ from MediaPipe's average face.
 */
export function observeHeadSpace(
  landmarks: ArrayLike<number>,
  matrixData: ArrayLike<number>,
  w: number,
  h: number,
  fovYDeg: number,
  ids: readonly number[] = CALIBRATION_LANDMARKS,
): Map<number, Vector3> {
  const m = new Matrix4().fromArray(Array.from(matrixData));
  const inv = m.clone().invert();
  const out = new Map<number, Vector3>();
  for (const id of ids) {
    const c = CANONICAL[id];
    if (!c) continue;
    const predicted = new Vector3(...c).applyMatrix4(m);
    const observed = unproject(landmarks[id * 3], landmarks[id * 3 + 1], -predicted.z, w, h, fovYDeg);
    out.set(id, observed.applyMatrix4(inv));
  }
  return out;
}

const mid = (a: Vector3, b: Vector3) => a.clone().add(b).multiplyScalar(0.5);
const canon = (id: number) => new Vector3(...CANONICAL[id]);

/**
 * Solves width/height/offset calibration from averaged head-space observations. Depth cannot be
 * measured from a frontal 2D view, so it follows the mean of width and height (documented as an
 * approximation). Results are clamped to the slider limits.
 */
export function solveCalibration(samples: Map<number, Vector3>[], centre: Vector3, base: Calibration): Calibration {
  if (samples.length === 0) throw new Error('No calibration samples');
  const avg = new Map<number, Vector3>();
  for (const id of CALIBRATION_LANDMARKS) {
    const acc = new Vector3();
    let n = 0;
    for (const s of samples) {
      const v = s.get(id);
      if (v) {
        acc.add(v);
        n++;
      }
    }
    if (n > 0) avg.set(id, acc.divideScalar(n));
  }
  const need = (id: number) => {
    const v = avg.get(id);
    if (!v) throw new Error(`Missing landmark ${id}`);
    return v;
  };
  const eyeR = mid(need(33), need(133));
  const eyeL = mid(need(362), need(263));
  const cEyeR = mid(canon(33), canon(133));
  const cEyeL = mid(canon(362), canon(263));
  const eyeRatio = (eyeL.x - eyeR.x) / (cEyeL.x - cEyeR.x);
  const cheekRatio = (need(454).x - need(234).x) / (canon(454).x - canon(234).x);
  const width = 0.6 * eyeRatio + 0.4 * cheekRatio;
  const height = (need(168).y - need(152).y) / (canon(168).y - canon(152).y);
  const depth = (width + height) / 2;

  // Offsets so the scaled canonical reference points land on the observed ones (x/y only).
  const refs: [Vector3, Vector3][] = [
    [eyeR, cEyeR],
    [eyeL, cEyeL],
    [need(168), canon(168)],
    [need(152), canon(152)],
  ];
  const scale = new Vector3(width, height, depth);
  let dx = 0;
  let dy = 0;
  for (const [obs, can] of refs) {
    const predicted = can.clone().sub(centre).multiply(scale).add(centre);
    dx += obs.x - predicted.x;
    dy += obs.y - predicted.y;
  }
  return clampCalibration({
    ...base,
    scale: 1,
    width,
    height,
    depth,
    offsetX: dx / refs.length,
    offsetY: dy / refs.length,
  });
}
