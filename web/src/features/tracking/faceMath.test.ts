import { describe, expect, it } from 'vitest';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import {
  decomposeFaceMatrix,
  eyeOpenness,
  faceRegion,
  focalPx,
  headAngles,
  isFrontal,
  jawAngle,
  jawOpenAmount,
  mouthOpenRatio,
  project,
  unproject,
} from './faceMath';
import { FACE } from './landmarks';

const W = 1280;
const H = 720;

/** Builds a flat landmark array with only the given points set (normalised coords). */
function landmarks(points: Record<number, [number, number, number?]>): Float32Array {
  const lm = new Float32Array(478 * 3);
  for (const [i, [x, y, z = 0]] of Object.entries(points)) {
    lm[+i * 3] = x;
    lm[+i * 3 + 1] = y;
    lm[+i * 3 + 2] = z;
  }
  return lm;
}

describe('mouth opening', () => {
  const mouth = (gapPx: number) =>
    landmarks({
      [FACE.mouthInnerRight]: [0.45, 0.6],
      [FACE.mouthInnerLeft]: [0.55, 0.6], // 128 px wide
      [FACE.upperInnerLip]: [0.5, 0.6],
      [FACE.lowerInnerLip]: [0.5, 0.6 + gapPx / H],
    });

  it('is zero for closed lips and proportional to the gap', () => {
    expect(mouthOpenRatio(mouth(0), W, H)).toBeCloseTo(0);
    expect(mouthOpenRatio(mouth(64), W, H)).toBeCloseTo(0.5, 2);
  });

  it('is invariant to face scale', () => {
    const small = landmarks({
      [FACE.mouthInnerRight]: [0.475, 0.6],
      [FACE.mouthInnerLeft]: [0.525, 0.6],
      [FACE.upperInnerLip]: [0.5, 0.6],
      [FACE.lowerInnerLip]: [0.5, 0.6 + 32 / H],
    });
    expect(mouthOpenRatio(small, W, H)).toBeCloseTo(mouthOpenRatio(mouth(64), W, H), 3);
  });
});

describe('jaw mapping', () => {
  it('has a dead zone for lip noise', () => {
    expect(jawOpenAmount(0)).toBe(0);
    expect(jawOpenAmount(0.05)).toBe(0);
  });
  it('is monotonic and saturates at 1', () => {
    let prev = 0;
    for (let r = 0.06; r <= 1; r += 0.02) {
      const v = jawOpenAmount(r);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(jawOpenAmount(2)).toBe(1);
  });
  it('limits the jaw rotation to the configured maximum', () => {
    expect(jawAngle(1, 28)).toBeCloseTo((28 * Math.PI) / 180);
    expect(jawAngle(5, 28)).toBeCloseTo((28 * Math.PI) / 180);
    expect(jawAngle(-1, 28)).toBe(0);
  });
});

describe('eye openness', () => {
  it('measures lid gap relative to eye width', () => {
    const lm = landmarks({
      [FACE.rightEyeOuter]: [0.4, 0.4],
      [FACE.rightEyeInner]: [0.45, 0.4],
      [FACE.rightEyeUpper]: [0.425, 0.4 - 10 / H],
      [FACE.rightEyeLower]: [0.425, 0.4 + 10 / H],
    });
    expect(eyeOpenness(lm, W, H, 'right')).toBeCloseTo(20 / 64, 2);
  });
});

describe('camera model', () => {
  it('unproject and project are inverse operations', () => {
    const p = unproject(0.3, 0.7, 55, W, H, 63);
    expect(p.z).toBeCloseTo(-55);
    const back = project(p, W, H, 63);
    expect(back.x).toBeCloseTo(0.3, 6);
    expect(back.y).toBeCloseTo(0.7, 6);
  });
  it('maps the image centre onto the optical axis with +y up', () => {
    const c = unproject(0.5, 0.5, 40, W, H, 63);
    expect(c.x).toBeCloseTo(0);
    expect(c.y).toBeCloseTo(0);
    expect(unproject(0.5, 0.2, 40, W, H, 63).y).toBeGreaterThan(0);
  });
  it('uses the vertical FOV for the focal length', () => {
    expect(focalPx(90, 720)).toBeCloseTo(360);
  });
});

describe('pose decomposition', () => {
  it('reads MediaPipe column-major matrices', () => {
    const q = new Quaternion().setFromEuler(new Euler(0.1, -0.3, 0.05, 'YXZ'));
    const m = new Matrix4().compose(new Vector3(2, -3, -60), q, new Vector3(1, 1, 1));
    const pose = decomposeFaceMatrix(m.toArray());
    expect(pose.position.toArray()).toEqual([expect.closeTo(2), expect.closeTo(-3), expect.closeTo(-60)]);
    expect(pose.quaternion.angleTo(q)).toBeLessThan(1e-6);
  });

  it('reports yaw/pitch/roll with documented signs', () => {
    const turnLeft = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.3);
    expect(headAngles(turnLeft).yaw).toBeCloseTo(17.19, 1);
    const lookUp = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.2);
    expect(headAngles(lookUp).pitch).toBeGreaterThan(0);
    expect(isFrontal(new Quaternion())).toBe(true);
    expect(isFrontal(turnLeft, 10)).toBe(false);
  });
});

describe('face region (reveal masks)', () => {
  it('is mirrored for display and extended upwards over the cranium', () => {
    const pts: Record<number, [number, number]> = {};
    // a square "face" from x 0.2..0.4, y 0.3..0.7 in the raw (unmirrored) image
    const oval = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
    oval.forEach((id, k) => {
      const a = (k / oval.length) * Math.PI * 2;
      pts[id] = [0.3 + 0.1 * Math.sin(a), 0.5 - 0.2 * Math.cos(a)];
    });
    const r = faceRegion(landmarks(pts), W / H);
    expect(r.cx).toBeCloseTo(0.7, 2); // mirrored
    expect(r.cy).toBeLessThan(0.5); // shifted up
    expect(r.ry).toBeGreaterThan(0.2);
    expect(Math.abs(r.angle)).toBeLessThan(0.05); // upright
  });
});
