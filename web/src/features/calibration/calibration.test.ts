import { describe, expect, it } from 'vitest';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { DEFAULT_CALIBRATION } from '@/stores/settingsStore';
import { CANONICAL } from '@/features/tracking/landmarks';
import { project } from '@/features/tracking/faceMath';
import {
  CALIBRATION_LANDMARKS,
  calibrationMatrix,
  clampCalibration,
  observeHeadSpace,
  solveCalibration,
} from './calibrationMath';
import { clearCalibration, loadCalibration, saveCalibration } from './calibrationStorage';

const W = 1280;
const H = 720;
const centre = new Vector3(0, 3, -5);

/** Landmarks produced by projecting a (possibly scaled) canonical face through a pose. */
function syntheticFrame(pose: Matrix4, faceScale = new Vector3(1, 1, 1), shift = new Vector3()) {
  const lm = new Float32Array(478 * 3);
  for (const id of CALIBRATION_LANDMARKS) {
    const p = new Vector3(...CANONICAL[id]).multiply(faceScale).add(shift).applyMatrix4(pose);
    const { x, y } = project(p, W, H, 63);
    lm[id * 3] = x;
    lm[id * 3 + 1] = y;
  }
  return lm;
}

const pose = new Matrix4().compose(new Vector3(1, -2, -55), new Quaternion().setFromEuler(new Euler(0.05, -0.1, 0.02)), new Vector3(1, 1, 1));

describe('calibration transform', () => {
  it('is the identity for default settings', () => {
    expect(calibrationMatrix(DEFAULT_CALIBRATION, centre).equals(new Matrix4())).toBe(true);
  });

  it('scales about the head centre and applies offsets in cm', () => {
    const m = calibrationMatrix({ ...DEFAULT_CALIBRATION, scale: 1.2, offsetX: 1.5 }, centre);
    expect(centre.clone().applyMatrix4(m).toArray()).toEqual([expect.closeTo(1.5), expect.closeTo(3), expect.closeTo(-5)]);
    const p = new Vector3(0, 13, -5).applyMatrix4(m);
    expect(p.y).toBeCloseTo(3 + 12);
  });

  it('applies independent width/height/depth', () => {
    const m = calibrationMatrix({ ...DEFAULT_CALIBRATION, width: 1.1, height: 0.9, depth: 1.2 }, new Vector3());
    expect(new Vector3(1, 1, 1).applyMatrix4(m).toArray()).toEqual([expect.closeTo(1.1), expect.closeTo(0.9), expect.closeTo(1.2)]);
  });

  it('positive pitch tilts the model upwards', () => {
    const m = calibrationMatrix({ ...DEFAULT_CALIBRATION, pitch: 10 }, new Vector3());
    expect(new Vector3(0, 0, 10).applyMatrix4(m).y).toBeGreaterThan(0);
  });

  it('clamps out-of-range and invalid values', () => {
    const c = clampCalibration({ ...DEFAULT_CALIBRATION, scale: 9, offsetY: Number.NaN, roll: -99 });
    expect(c.scale).toBe(1.4);
    expect(c.offsetY).toBe(0);
    expect(c.roll).toBe(-20);
  });
});

describe('assisted calibration', () => {
  it('recovers canonical head-space positions for an average face', () => {
    const obs = observeHeadSpace(syntheticFrame(pose), pose.toArray(), W, H, 63);
    for (const id of CALIBRATION_LANDMARKS) {
      const v = obs.get(id)!;
      expect(v.x).toBeCloseTo(CANONICAL[id][0], 1);
      expect(v.y).toBeCloseTo(CANONICAL[id][1], 1);
    }
  });

  it('solves identity calibration for an average face', () => {
    const samples = [observeHeadSpace(syntheticFrame(pose), pose.toArray(), W, H, 63)];
    const c = solveCalibration(samples, centre, DEFAULT_CALIBRATION);
    expect(c.width).toBeCloseTo(1, 2);
    expect(c.height).toBeCloseTo(1, 2);
    expect(c.offsetX).toBeCloseTo(0, 1);
    expect(c.offsetY).toBeCloseTo(0, 1);
  });

  it('detects a wider and longer face than average', () => {
    const frame = syntheticFrame(pose, new Vector3(1.1, 1.08, 1));
    const c = solveCalibration([observeHeadSpace(frame, pose.toArray(), W, H, 63)], new Vector3(), DEFAULT_CALIBRATION);
    expect(c.width).toBeCloseTo(1.1, 1);
    expect(c.height).toBeCloseTo(1.08, 1);
  });

  it('rejects empty sample sets', () => {
    expect(() => solveCalibration([], centre, DEFAULT_CALIBRATION)).toThrow();
  });
});

describe('local calibration storage', () => {
  it('round-trips and validates stored values', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as unknown as Storage;
    expect(loadCalibration(storage)).toBeNull();
    saveCalibration({ ...DEFAULT_CALIBRATION, width: 1.1 }, storage);
    expect(loadCalibration(storage)?.width).toBe(1.1);
    store.set('xray-mirror-pro:calibration:v1', '{"scale":"big"}');
    expect(loadCalibration(storage)).toBeNull();
    clearCalibration(storage);
    expect(store.size).toBe(0);
  });

  it('survives unavailable storage (private mode)', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } as unknown as Storage;
    expect(loadCalibration(broken)).toBeNull();
    expect(saveCalibration(DEFAULT_CALIBRATION, broken)).toBe(false);
  });
});
