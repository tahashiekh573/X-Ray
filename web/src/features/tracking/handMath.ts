import { Matrix4, Vector3 } from 'three';
import type { HandBoneRig } from '@/types/anatomy';
import { focalPx } from './faceMath';
import { HAND } from './landmarks';

/**
 * Converts MediaPipe hand landmarks into camera space (cm).
 *
 * Depth is recovered with a pinhole model: the palm's metric size comes from the world landmarks
 * (metres), its image size from the normalised landmarks, so depth = f * L_world / L_image. Per
 * landmark relative depth (z, wrist-relative, roughly x-scaled) is then converted to centimetres.
 * The same virtual camera (vertical FOV) as the face pipeline is used so hands and head overlay
 * consistently.
 */
const PALM_SEGMENTS: ReadonlyArray<readonly [number, number]> = [
  [HAND.wrist, HAND.indexMcp],
  [HAND.wrist, HAND.pinkyMcp],
  [HAND.indexMcp, HAND.pinkyMcp],
  [HAND.wrist, HAND.middleMcp],
];

export function estimateHandDepth(
  lm: ArrayLike<number>,
  world: ArrayLike<number>,
  w: number,
  h: number,
  fovYDeg: number,
): number {
  let worldLen = 0;
  let imageLen = 0;
  for (const [a, b] of PALM_SEGMENTS) {
    worldLen += Math.hypot(
      world[a * 3] - world[b * 3],
      world[a * 3 + 1] - world[b * 3 + 1],
      world[a * 3 + 2] - world[b * 3 + 2],
    );
    imageLen += Math.hypot(
      (lm[a * 3] - lm[b * 3]) * w,
      (lm[a * 3 + 1] - lm[b * 3 + 1]) * h,
      (lm[a * 3 + 2] - lm[b * 3 + 2]) * w,
    );
  }
  if (imageLen < 1e-6 || worldLen < 1e-6) return 50;
  return (focalPx(fovYDeg, h) * worldLen * 100) / imageLen; // metres -> cm
}

export function handLandmarksToCamera(
  lm: ArrayLike<number>,
  world: ArrayLike<number>,
  w: number,
  h: number,
  fovYDeg: number,
  out: Vector3[],
): Vector3[] {
  const f = focalPx(fovYDeg, h);
  const depth0 = estimateHandDepth(lm, world, w, h, fovYDeg);
  const z0 = lm[2];
  for (let i = 0; i < 21; i++) {
    const depth = depth0 + ((lm[i * 3 + 2] - z0) * w * depth0) / f;
    const x = lm[i * 3];
    const y = lm[i * 3 + 1];
    (out[i] ??= new Vector3()).set(((x - 0.5) * w * depth) / f, (-(y - 0.5) * h * depth) / f, -depth);
  }
  return out;
}

export interface HandRigData {
  wristToMcp3: number;
  bones: HandBoneRig[];
}

export interface HandPoseResult {
  carpals: Matrix4;
  bones: Map<string, Matrix4>;
  /** palm scale relative to the model */
  scale: number;
}

const MIRROR = new Matrix4().makeScale(-1, 1, 1);
const DISTAL_FACTOR = 0.8; // fingertip landmarks lie on skin beyond the distal phalanx tip

const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _tmp = new Vector3();

function basisMatrix(x: Vector3, y: Vector3, z: Vector3, sx: number, sy: number, sz: number, origin: Vector3, out: Matrix4) {
  return out.set(
    x.x * sx, y.x * sy, z.x * sz, origin.x,
    x.y * sx, y.y * sy, z.y * sz, origin.y,
    x.z * sx, y.z * sy, z.z * sz, origin.z,
    0, 0, 0, 1,
  );
}

/**
 * Computes a world matrix for every rigged bone from camera-space landmarks. The left hand is
 * produced by mirroring: landmarks are reflected, solved as a right hand, and reflected back.
 */
export function solveHandPose(
  points: readonly Vector3[],
  rig: HandRigData,
  isLeft: boolean,
  result?: HandPoseResult,
): HandPoseResult {
  const out = result ?? { carpals: new Matrix4(), bones: new Map<string, Matrix4>(), scale: 1 };
  const p = isLeft ? points.map((v) => new Vector3(-v.x, v.y, v.z)) : points;

  const origin = p[HAND.wrist];
  const palmY = new Vector3().subVectors(p[HAND.middleMcp], origin).normalize();
  const palmZ = new Vector3()
    .crossVectors(_tmp.subVectors(p[HAND.indexMcp], origin), new Vector3().subVectors(p[HAND.pinkyMcp], origin))
    .normalize();
  palmZ.addScaledVector(palmY, -palmZ.dot(palmY)).normalize();
  const palmX = new Vector3().crossVectors(palmY, palmZ);
  const scale = p[HAND.middleMcp].distanceTo(origin) / rig.wristToMcp3;
  out.scale = scale;

  basisMatrix(palmX, palmY, palmZ, scale, scale, scale, origin, out.carpals);
  const palmRot = new Matrix4().makeBasis(palmX, palmY, palmZ);

  const xAxes = new Map<string, Vector3>();
  for (const bone of rig.bones) {
    const [li, lj] = bone.landmarks;
    const prox =
      li < 0 ? new Vector3(...bone.basePalm).applyMatrix4(out.carpals) : p[li].clone();
    const dist = p[lj].clone();
    if (bone.name.startsWith('distal')) dist.sub(prox).multiplyScalar(DISTAL_FACTOR).add(prox);

    _y.subVectors(dist, prox);
    const len = _y.length();
    _y.divideScalar(Math.max(len, 1e-6));

    const ref =
      (bone.parent && xAxes.get(bone.parent)) ||
      new Vector3(...bone.restXPalm).applyMatrix4(palmRot);
    _x.copy(ref).addScaledVector(_y, -ref.dot(_y));
    if (_x.lengthSq() < 1e-6) {
      _x.copy(new Vector3(...bone.restXPalm).applyMatrix4(palmRot)).addScaledVector(_y, -_y.dot(_x));
    }
    _x.normalize();
    _z.crossVectors(_x, _y);
    xAxes.set(bone.name, _x.clone());

    const m = out.bones.get(bone.name) ?? new Matrix4();
    basisMatrix(_x, _y, _z, scale, len / bone.length, scale, prox, m);
    out.bones.set(bone.name, m);
  }

  if (isLeft) {
    out.carpals.premultiply(MIRROR);
    for (const m of out.bones.values()) m.premultiply(MIRROR);
  }
  return out;
}
