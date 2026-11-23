import { Matrix4, Vector3 } from 'three';
import type { BodyRigData } from '@/types/anatomy';
import { focalPx } from './faceMath';
import { POSE } from './landmarks';

/** Rigid torso parts of the skeleton: shoulders-to-hips span. */
const TORSO_SEGMENTS: ReadonlyArray<readonly [number, number]> = [
  [POSE.leftShoulder, POSE.rightShoulder],
  [POSE.leftHip, POSE.rightHip],
  [POSE.leftShoulder, POSE.leftHip],
  [POSE.rightShoulder, POSE.rightHip],
];

/**
 * MediaPipe Pose landmarks -> camera space (cm), with the same pinhole model as the hands:
 * the torso's metric size (world landmarks, metres) against its image size gives the depth;
 * per-landmark relative z (hip-centred, x-scaled) adds the body's own depth variation.
 */
export function poseLandmarksToCamera(
  lm: ArrayLike<number>,
  world: ArrayLike<number>,
  w: number,
  h: number,
  fovYDeg: number,
  out: Vector3[],
): Vector3[] {
  const f = focalPx(fovYDeg, h);
  let worldLen = 0;
  let imageLen = 0;
  for (const [a, b] of TORSO_SEGMENTS) {
    worldLen += Math.hypot(world[a * 3] - world[b * 3], world[a * 3 + 1] - world[b * 3 + 1], world[a * 3 + 2] - world[b * 3 + 2]);
    imageLen += Math.hypot((lm[a * 3] - lm[b * 3]) * w, (lm[a * 3 + 1] - lm[b * 3 + 1]) * h);
  }
  const depth0 = imageLen > 1e-6 && worldLen > 1e-6 ? (f * worldLen * 100) / imageLen : 150;
  const zRef = (lm[POSE.leftHip * 3 + 2] + lm[POSE.rightHip * 3 + 2] + lm[POSE.leftShoulder * 3 + 2] + lm[POSE.rightShoulder * 3 + 2]) / 4;
  const count = Math.floor(lm.length / 3);
  for (let i = 0; i < count; i++) {
    const depth = Math.max(10, depth0 + ((lm[i * 3 + 2] - zRef) * w * depth0) / f);
    (out[i] ??= new Vector3()).set(((lm[i * 3] - 0.5) * w * depth) / f, (-(lm[i * 3 + 1] - 0.5) * h * depth) / f, -depth);
  }
  return out;
}

export interface BodyPoseResult {
  torso: Matrix4;
  segments: Map<string, Matrix4>;
  /** segments hidden because an endpoint is not visible */
  hidden: Set<string>;
  scale: number;
}

const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();

function setBasis(m: Matrix4, x: Vector3, y: Vector3, z: Vector3, sx: number, sy: number, sz: number, o: Vector3) {
  return m.set(
    x.x * sx, y.x * sy, z.x * sz, o.x,
    x.y * sx, y.y * sy, z.y * sz, o.y,
    x.z * sx, y.z * sy, z.z * sz, o.z,
    0, 0, 0, 1,
  );
}

/**
 * Torso: rigid, fitted to shoulders and hips (width and length scaled independently).
 * Limbs: each segment spans its two landmarks; its roll comes from the parent segment's current
 * frame (or the torso) via the stored rest orientation, so elbows/knees/ankles bend correctly.
 */
export function solveBodyPose(
  p: readonly Vector3[],
  visibility: ArrayLike<number>,
  rig: BodyRigData,
  result?: BodyPoseResult,
  minVisibility = 0.5,
): BodyPoseResult {
  const out = result ?? { torso: new Matrix4(), segments: new Map(), hidden: new Set(), scale: 1 };
  out.hidden.clear();
  const ls = p[POSE.leftShoulder];
  const rs = p[POSE.rightShoulder];
  const lh = p[POSE.leftHip];
  const rh = p[POSE.rightHip];
  const shoulderMid = new Vector3().addVectors(ls, rs).multiplyScalar(0.5);
  const hipMid = new Vector3().addVectors(lh, rh).multiplyScalar(0.5);
  const y = new Vector3().subVectors(shoulderMid, hipMid);
  const torsoLen = y.length();
  y.divideScalar(Math.max(torsoLen, 1e-6));
  const xHint = new Vector3().subVectors(ls, rs);
  const width = xHint.length();
  const z = new Vector3().crossVectors(xHint, y).normalize();
  const x = new Vector3().crossVectors(y, z);
  const sx = width / rig.shoulderWidth;
  const sy = torsoLen / rig.torsoLength;
  const s = (sx + sy) / 2;
  out.scale = s;
  setBasis(out.torso, x, y, z, sx, sy, s, hipMid);

  const torsoRot = new Matrix4().makeBasis(x, y, z);
  const rotations = new Map<string, Matrix4>();
  for (const seg of rig.segments) {
    const [a, b] = seg.landmarks;
    if (visibility[a] < minVisibility || visibility[b] < minVisibility) out.hidden.add(seg.name);
    const prox = p[a];
    const dist = p[b];
    _y.subVectors(dist, prox);
    const len = _y.length();
    _y.divideScalar(Math.max(len, 1e-6));
    const parentRot = (seg.parent && rotations.get(seg.parent)) || torsoRot;
    const refX = new Vector3(...seg.restX).applyMatrix4(parentRot);
    _x.copy(refX).addScaledVector(_y, -refX.dot(_y));
    if (_x.lengthSq() < 0.1) {
      // limb nearly parallel to its reference axis: derive X from the rest Z instead
      const refZ = new Vector3(...seg.restZ).applyMatrix4(parentRot);
      _x.crossVectors(_y, refZ);
    }
    _x.normalize();
    _z.crossVectors(_x, _y);
    rotations.set(seg.name, new Matrix4().makeBasis(_x, _y, _z));
    const m = out.segments.get(seg.name) ?? new Matrix4();
    setBasis(m, _x, _y, _z, s, len / seg.length, s, prox);
    out.segments.set(seg.name, m);
  }
  return out;
}
