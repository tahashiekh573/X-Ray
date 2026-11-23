import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { OneEuroFilter, OneEuroVector3, QuaternionSmoother } from './smoothing';

describe('OneEuroFilter', () => {
  it('returns the first sample unchanged', () => {
    expect(new OneEuroFilter().filter(5, 0)).toBe(5);
  });

  it('suppresses jitter around a steady value', () => {
    const f = new OneEuroFilter(1, 0.0);
    let maxDev = 0;
    for (let i = 0; i < 300; i++) {
      const out = f.filter(10 + (i % 2 ? 0.5 : -0.5), i / 30);
      if (i > 60) maxDev = Math.max(maxDev, Math.abs(out - 10));
    }
    expect(maxDev).toBeLessThan(0.25); // raw jitter is +-0.5
  });

  it('follows fast motion with limited lag when beta > 0', () => {
    const slow = new OneEuroFilter(1, 0);
    const fast = new OneEuroFilter(1, 0.5);
    let a = 0;
    let b = 0;
    for (let i = 0; i <= 15; i++) {
      const t = i / 30;
      a = slow.filter(i * 2, t);
      b = fast.filter(i * 2, t);
    }
    expect(Math.abs(30 - b)).toBeLessThan(Math.abs(30 - a));
  });

  it('ignores non-increasing timestamps and can be reset', () => {
    const f = new OneEuroFilter();
    f.filter(1, 1);
    expect(f.filter(100, 1)).toBe(1);
    f.reset();
    expect(f.filter(100, 2)).toBe(100);
  });
});

describe('OneEuroVector3', () => {
  it('filters each component', () => {
    const f = new OneEuroVector3();
    const out = f.filter(new Vector3(1, 2, 3), 0);
    expect(out.toArray()).toEqual([1, 2, 3]);
  });
});

describe('QuaternionSmoother', () => {
  it('converges to a constant target', () => {
    const s = new QuaternionSmoother();
    const target = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.8);
    s.filter(new Quaternion(), 0);
    let q = new Quaternion();
    for (let i = 1; i < 120; i++) q = s.filter(target, i / 30);
    expect(q.angleTo(target)).toBeLessThan(0.01);
  });

  it('smooths a single-frame spike', () => {
    const s = new QuaternionSmoother(1.0, 0.1);
    s.filter(new Quaternion(), 0);
    const spike = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.2);
    const q = s.filter(spike, 1 / 30);
    expect(q.angleTo(new Quaternion())).toBeLessThan(0.2 * 0.5);
  });
});
