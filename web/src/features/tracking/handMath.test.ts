import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import manifest from '../../../public/models/anatomy_manifest.json';
import type { AnatomyManifest } from '@/types/anatomy';
import { estimateHandDepth, handLandmarksToCamera, solveHandPose } from './handMath';

const rig = (manifest as unknown as AnatomyManifest).hand;
const W = 1280;
const H = 720;

/** A synthetic open right hand facing the camera (palm towards camera, fingers up). */
function openHand(depthCm = 45): { lm: Float32Array; world: Float32Array; points: Vector3[] } {
  // camera-space points (cm): subject's right hand => thumb towards image left (-x)
  const pts: [number, number, number][] = [
    [0, -8, 0], // wrist
    [-2.5, -6.5, 0.5], [-4, -4.5, 1], [-5, -3, 1.2], [-6, -1.8, 1.3], // thumb
    [-2.2, 0, 0], [-2.4, 3.5, 0], [-2.5, 5.7, 0], [-2.6, 7.5, 0], // index
    [0, 0.3, 0], [0, 4.2, 0], [0, 6.8, 0], [0, 8.7, 0], // middle
    [2.1, 0, 0], [2.2, 3.7, 0], [2.3, 6.1, 0], [2.4, 7.9, 0], // ring
    [4, -0.8, 0], [4.3, 1.9, 0], [4.5, 3.6, 0], [4.6, 5.1, 0], // little
  ];
  const f = H / 2 / Math.tan((63 * Math.PI) / 360);
  const lm = new Float32Array(63);
  const world = new Float32Array(63);
  const points = pts.map(([x, y, z]) => new Vector3(x, y, -depthCm + z));
  points.forEach((p, i) => {
    const d = -p.z;
    lm[i * 3] = (p.x * f) / d / W + 0.5;
    lm[i * 3 + 1] = 0.5 - (p.y * f) / d / H;
    lm[i * 3 + 2] = ((d - depthCm) * f) / (W * depthCm); // relative depth in x-scaled units
    world[i * 3] = p.x / 100;
    world[i * 3 + 1] = p.y / 100;
    world[i * 3 + 2] = (p.z + depthCm) / 100;
  });
  return { lm, world, points };
}

describe('hand depth recovery', () => {
  it('recovers the depth of a hand from metric world landmarks', () => {
    const { lm, world } = openHand(45);
    expect(estimateHandDepth(lm, world, W, H, 63)).toBeCloseTo(45, 0);
  });

  it('reconstructs camera-space landmarks', () => {
    const { lm, world, points } = openHand(38);
    const out = handLandmarksToCamera(lm, world, W, H, 63, []);
    out.forEach((p, i) => expect(p.distanceTo(points[i])).toBeLessThan(0.6));
  });
});

describe('hand bone solver', () => {
  it('places every bone between its two landmarks', () => {
    const { points } = openHand();
    const pose = solveHandPose(points, rig, false);
    for (const bone of rig.bones) {
      const m = pose.bones.get(bone.name)!;
      const [li, lj] = bone.landmarks;
      const start = new Vector3(0, 0, 0).applyMatrix4(m);
      const end = new Vector3(0, bone.length, 0).applyMatrix4(m);
      if (li >= 0) expect(start.distanceTo(points[li])).toBeLessThan(1e-3);
      const target = bone.name.startsWith('distal')
        ? points[li].clone().lerp(points[lj], 0.8)
        : points[lj];
      expect(end.distanceTo(target)).toBeLessThan(1e-3);
    }
  });

  it('keeps bone frames orthogonal (no shearing) and right-handed for the right hand', () => {
    const pose = solveHandPose(openHand().points, rig, false);
    for (const m of pose.bones.values()) expect(m.determinant()).toBeGreaterThan(0);
    expect(pose.carpals.determinant()).toBeGreaterThan(0);
  });

  it('mirrors the skeleton for the left hand', () => {
    const right = openHand().points;
    const left = right.map((p) => new Vector3(-p.x, p.y, p.z));
    const pose = solveHandPose(left, rig, true);
    for (const m of pose.bones.values()) expect(m.determinant()).toBeLessThan(0);
    const mc3 = pose.bones.get('metacarpal_3')!;
    const end = new Vector3(0, rig.bones.find((b) => b.name === 'metacarpal_3')!.length, 0).applyMatrix4(mc3);
    expect(end.distanceTo(left[9])).toBeLessThan(1e-3);
  });

  it('scales the skeleton with the palm size', () => {
    const { points } = openHand();
    const big = points.map((p) => p.clone().sub(points[0]).multiplyScalar(1.3).add(points[0]));
    expect(solveHandPose(big, rig, false).scale / solveHandPose(points, rig, false).scale).toBeCloseTo(1.3, 3);
  });

  it('follows finger flexion', () => {
    const { points } = openHand();
    const bent = points.map((p) => p.clone());
    // curl the index finger towards the palm (+z towards camera)
    bent[7] = bent[6].clone().add(new Vector3(0, 0.3, 2.0));
    bent[8] = bent[7].clone().add(new Vector3(0, -1.2, 1.0));
    const pose = solveHandPose(bent, rig, false);
    const middle = pose.bones.get('middle_phalanx_2')!;
    const len = rig.bones.find((b) => b.name === 'middle_phalanx_2')!.length;
    expect(new Vector3(0, len, 0).applyMatrix4(middle).distanceTo(bent[7])).toBeLessThan(1e-3);
  });
});
