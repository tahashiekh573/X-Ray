import { Quaternion, Vector3 } from 'three';

/**
 * One Euro filter (Casiez et al., CHI 2012): a speed-adaptive low-pass filter. Slow motion is
 * smoothed strongly (removes landmark jitter); fast motion is followed with little lag.
 */
export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private lastT: number | null = null;

  constructor(
    public minCutoff = 1.0,
    public beta = 0.02,
    public dCutoff = 1.0,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  reset(): void {
    this.x = null;
    this.dx = 0;
    this.lastT = null;
  }

  /** @param t timestamp in seconds */
  filter(value: number, t: number): number {
    if (this.x === null || this.lastT === null) {
      this.x = value;
      this.lastT = t;
      return value;
    }
    if (t <= this.lastT) return this.x;
    const dt = Math.max(1e-3, t - this.lastT);
    this.lastT = t;
    const rawDx = (value - this.x) / dt;
    this.dx += OneEuroFilter.alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuroFilter.alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}

export class OneEuroVector3 {
  private readonly fx: OneEuroFilter;
  private readonly fy: OneEuroFilter;
  private readonly fz: OneEuroFilter;

  constructor(minCutoff = 1.0, beta = 0.02, dCutoff = 1.0) {
    this.fx = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fy = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fz = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  setParams(minCutoff: number, beta: number): void {
    for (const f of [this.fx, this.fy, this.fz]) {
      f.minCutoff = minCutoff;
      f.beta = beta;
    }
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
    this.fz.reset();
  }

  filter(v: Vector3, t: number, out = new Vector3()): Vector3 {
    return out.set(this.fx.filter(v.x, t), this.fy.filter(v.y, t), this.fz.filter(v.z, t));
  }
}

/**
 * Speed-adaptive quaternion smoothing in the spirit of the One Euro filter: the slerp factor
 * grows with angular velocity so small jitter is removed while fast head turns stay responsive.
 */
export class QuaternionSmoother {
  private q: Quaternion | null = null;
  private lastT: number | null = null;
  private velocity = 0; // rad/s, low-passed

  constructor(
    public minCutoff = 1.2,
    public beta = 0.35,
  ) {}

  reset(): void {
    this.q = null;
    this.lastT = null;
    this.velocity = 0;
  }

  filter(target: Quaternion, t: number, out = new Quaternion()): Quaternion {
    if (this.q === null || this.lastT === null) {
      this.q = target.clone();
      this.lastT = t;
      return out.copy(this.q);
    }
    if (t <= this.lastT) return out.copy(this.q);
    const dt = Math.max(1e-3, t - this.lastT);
    this.lastT = t;
    const angle = this.q.angleTo(target);
    const speed = angle / dt;
    const aV = 1 / (1 + 1 / (2 * Math.PI * 1.0 * dt));
    this.velocity += aV * (speed - this.velocity);
    const cutoff = this.minCutoff + this.beta * this.velocity;
    const a = 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    this.q.slerp(target, a);
    return out.copy(this.q);
  }
}
