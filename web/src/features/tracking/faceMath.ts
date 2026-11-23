import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { clamp, DEG } from '@/utils/math';
import { FACE, FACE_OVAL } from './landmarks';

/**
 * Landmark helpers. MediaPipe landmarks are normalised: x in [0,1] of image width, y in [0,1] of
 * image height (origin top-left), z is relative depth in roughly the same scale as x. Converting
 * to "pixel space" (x*W, y*H, z*W) gives an approximately isotropic 3D point cloud, which makes
 * ratios invariant to head rotation and image aspect.
 */
export function pixelPoint(lm: ArrayLike<number>, i: number, w: number, h: number, out = new Vector3()) {
  return out.set(lm[i * 3] * w, lm[i * 3 + 1] * h, lm[i * 3 + 2] * w);
}

const _a = new Vector3();
const _b = new Vector3();

export function landmarkDistance(lm: ArrayLike<number>, i: number, j: number, w: number, h: number) {
  return pixelPoint(lm, i, w, h, _a).distanceTo(pixelPoint(lm, j, w, h, _b));
}

/** Inner-lip gap divided by inner mouth width (scale and rotation invariant). */
export function mouthOpenRatio(lm: ArrayLike<number>, w: number, h: number): number {
  const gap = landmarkDistance(lm, FACE.upperInnerLip, FACE.lowerInnerLip, w, h);
  const width = landmarkDistance(lm, FACE.mouthInnerRight, FACE.mouthInnerLeft, w, h);
  return width > 1e-6 ? gap / width : 0;
}

export interface JawMapping {
  /** ratio at which the jaw starts to open (dead zone for lip noise) */
  closed: number;
  /** ratio treated as fully open */
  open: number;
}

export const DEFAULT_JAW_MAPPING: JawMapping = { closed: 0.06, open: 0.75 };

/** Maps a mouth-opening ratio to a normalised jaw opening 0..1 (eased). */
export function jawOpenAmount(ratio: number, mapping: JawMapping = DEFAULT_JAW_MAPPING): number {
  const t = clamp((ratio - mapping.closed) / (mapping.open - mapping.closed), 0, 1);
  return 1 - (1 - t) * (1 - t); // ease-out: small openings are visible immediately
}

/** Jaw rotation in radians for a normalised opening, limited to maxDeg. */
export function jawAngle(amount: number, maxDeg: number): number {
  return clamp(amount, 0, 1) * maxDeg * DEG;
}

/** Eye aspect ratio (lid gap / eye width); ~0.25-0.35 open, < 0.12 closed. */
export function eyeOpenness(lm: ArrayLike<number>, w: number, h: number, side: 'left' | 'right') {
  const [up, low, a, b] =
    side === 'right'
      ? [FACE.rightEyeUpper, FACE.rightEyeLower, FACE.rightEyeOuter, FACE.rightEyeInner]
      : [FACE.leftEyeUpper, FACE.leftEyeLower, FACE.leftEyeInner, FACE.leftEyeOuter];
  const width = landmarkDistance(lm, a, b, w, h);
  return width > 1e-6 ? landmarkDistance(lm, up, low, w, h) / width : 0;
}

export interface Pose {
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}

/** Decomposes MediaPipe's column-major facial transformation matrix. */
export function decomposeFaceMatrix(data: ArrayLike<number>, out?: Pose): Pose {
  const pose = out ?? { position: new Vector3(), quaternion: new Quaternion(), scale: new Vector3() };
  const m = new Matrix4().fromArray(Array.from(data));
  m.decompose(pose.position, pose.quaternion, pose.scale);
  return pose;
}

/**
 * Head orientation in degrees for display. Yaw is positive when the subject turns towards their
 * own left, pitch positive when looking up, roll positive when tilting towards their left
 * shoulder (camera frame, unmirrored).
 */
export function headAngles(q: Quaternion): { yaw: number; pitch: number; roll: number } {
  const e = new Euler().setFromQuaternion(q, 'YXZ');
  // Rx(-a) tips the face normal (+z) upwards and Rz(-a) tilts +y towards the subject's left.
  return { yaw: e.y / DEG, pitch: -e.x / DEG, roll: -e.z / DEG };
}

export function isFrontal(q: Quaternion, maxDeg = 10): boolean {
  const { yaw, pitch, roll } = headAngles(q);
  return Math.abs(yaw) < maxDeg && Math.abs(pitch) < maxDeg && Math.abs(roll) < maxDeg;
}

export interface FaceRegion {
  /** centre in normalised *display* coordinates (mirrored: u = 1 - x) */
  cx: number;
  cy: number;
  /** half extents in normalised units of width / height */
  rx: number;
  ry: number;
  /** in-plane rotation (radians, display space) of the chin->forehead axis */
  angle: number;
}

/**
 * Display-space face region used by the reveal masks. The silhouette is extended upwards to
 * cover the cranium, which the face oval does not include.
 */
export function faceRegion(lm: ArrayLike<number>, aspect: number, mirrored = true): FaceRegion {
  const dx = (i: number) => (mirrored ? 1 - lm[i * 3] : lm[i * 3]);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const i of FACE_OVAL) {
    const x = dx(i);
    const y = lm[i * 3 + 1];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const fx = dx(FACE.foreheadTop) - dx(FACE.chin);
  const fy = lm[FACE.foreheadTop * 3 + 1] - lm[FACE.chin * 3 + 1];
  // angle between the (aspect-corrected) chin->forehead vector and straight up
  const angle = Math.atan2(fx * aspect, -fy);
  const height = maxY - minY;
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2 - height * 0.12,
    rx: ((maxX - minX) / 2) * 1.18,
    ry: (height / 2) * 1.32,
    angle,
  };
}

/** Focal length in pixels for a vertical field of view (degrees) and image height. */
export function focalPx(fovYDeg: number, heightPx: number): number {
  return heightPx / 2 / Math.tan((fovYDeg * DEG) / 2);
}

/**
 * Converts a normalised landmark into camera space (cm; camera at origin looking down -Z, +Y up)
 * given its depth (positive distance in front of the camera).
 */
export function unproject(
  x: number,
  y: number,
  depth: number,
  w: number,
  h: number,
  fovYDeg: number,
  out = new Vector3(),
): Vector3 {
  const f = focalPx(fovYDeg, h);
  return out.set(((x - 0.5) * w * depth) / f, (-(y - 0.5) * h * depth) / f, -depth);
}

/** Projects a camera-space point to normalised image coordinates (inverse of unproject). */
export function project(p: Vector3, w: number, h: number, fovYDeg: number): { x: number; y: number } {
  const f = focalPx(fovYDeg, h);
  const depth = -p.z;
  return { x: (p.x * f) / depth / w + 0.5, y: 0.5 - (p.y * f) / depth / h };
}
