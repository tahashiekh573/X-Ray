import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import manifest from '../../../public/models/anatomy_manifest.json';
import type { AnatomyManifest } from '@/types/anatomy';
import { poseLandmarksToCamera, solveBodyPose } from './bodyMath';
import { createFrameState } from './frameState';
import { processPoseResult } from './processResults';

const rig = (manifest as unknown as AnatomyManifest).body;
const W = 1280;
const H = 720;

/** Standing person facing the camera, ~2.5 m away, camera-space cm (subject's left = +x). */
function standing(depth = 250): Vector3[] {
  const p = Array.from({ length: 33 }, () => new Vector3(0, 60, -depth));
  const set = (i: number, x: number, y: number, z = 0) => p[i].set(x, y, -depth + z);
  set(11, 19, 45); set(12, -19, 45); // shoulders
  set(13, 22, 15); set(14, -22, 15); // elbows (arms down)
  set(15, 23, -12); set(16, -23, -12); // wrists
  set(23, 10, -5); set(24, -10, -5); // hips
  set(25, 11, -48); set(26, -11, -48); // knees
  set(27, 11, -90); set(28, -11, -90); // ankles
  set(31, 12, -97, 15); set(32, -12, -97, 15); // toes (forward)
  return p;
}

function toLandmarks(points: Vector3[], depth: number) {
  const f = H / 2 / Math.tan((63 * Math.PI) / 360);
  const lm = new Float32Array(99);
  const world = new Float32Array(99);
  points.forEach((v, i) => {
    const d = -v.z;
    lm[i * 3] = (v.x * f) / d / W + 0.5;
    lm[i * 3 + 1] = 0.5 - (v.y * f) / d / H;
    lm[i * 3 + 2] = ((d - depth) * f) / (W * depth);
    world[i * 3] = v.x / 100;
    world[i * 3 + 1] = -v.y / 100;
    world[i * 3 + 2] = (d - depth) / 100;
  });
  return { lm, world };
}

const visible = new Float32Array(33).fill(1);

describe('pose to camera space', () => {
  it('recovers body depth and positions from metric world landmarks', () => {
    const pts = standing(250);
    const { lm, world } = toLandmarks(pts, 250);
    const out = poseLandmarksToCamera(lm, world, W, H, 63, []);
    for (const i of [11, 12, 23, 24, 25, 27]) expect(out[i].distanceTo(pts[i])).toBeLessThan(3);
  });
});

describe('body skeleton solver', () => {
  it('spans every limb segment between its landmarks', () => {
    const pts = standing();
    const pose = solveBodyPose(pts, visible, rig);
    for (const seg of rig.segments) {
      const m = pose.segments.get(seg.name)!;
      const [a, b] = seg.landmarks;
      expect(new Vector3().applyMatrix4(m).distanceTo(pts[a])).toBeLessThan(1e-3);
      expect(new Vector3(0, seg.length, 0).applyMatrix4(m).distanceTo(pts[b])).toBeLessThan(1e-3);
    }
  });

  it('fits the torso between hips and shoulders without mirroring', () => {
    const pose = solveBodyPose(standing(), visible, rig);
    expect(pose.torso.determinant()).toBeGreaterThan(0);
    const hipMid = new Vector3().setFromMatrixPosition(pose.torso);
    expect(hipMid.distanceTo(new Vector3(0, -5, -250))).toBeLessThan(1e-3);
    // torso +Y (towards shoulders) points up, +X towards the subject's left shoulder
    expect(new Vector3(0, 1, 0).transformDirection(pose.torso).y).toBeGreaterThan(0.99);
    expect(new Vector3(1, 0, 0).transformDirection(pose.torso).x).toBeGreaterThan(0.99);
    for (const m of pose.segments.values()) expect(m.determinant()).toBeGreaterThan(0);
  });

  it('hides limbs whose landmarks are not visible (e.g. legs out of frame)', () => {
    const vis = new Float32Array(33).fill(1);
    vis[25] = vis[26] = vis[27] = vis[28] = 0.1;
    const pose = solveBodyPose(standing(), vis, rig);
    expect(pose.hidden.has('leg__left')).toBe(true);
    expect(pose.hidden.has('femur__right')).toBe(true);
    expect(pose.hidden.has('humerus__left')).toBe(false);
  });

  it('bends the forearm at the elbow', () => {
    const pts = standing();
    pts[15].set(22, 20, -250 + 28); // forearm raised towards the camera
    const pose = solveBodyPose(pts, visible, rig);
    const seg = rig.segments.find((s) => s.name === 'forearm__left')!;
    expect(new Vector3(0, seg.length, 0).applyMatrix4(pose.segments.get('forearm__left')!).distanceTo(pts[15])).toBeLessThan(1e-3);
  });
});

describe('processPoseResult (mocked MediaPipe output)', () => {
  const lm = (vis: number) => Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: vis }));
  it('requires both shoulders to be visible', () => {
    const state = createFrameState();
    processPoseResult(state, { landmarks: [lm(0.9)], worldLandmarks: [lm(0.9)] }, 5);
    expect(state.pose.present).toBe(true);
    processPoseResult(state, { landmarks: [lm(0.2)], worldLandmarks: [lm(0.2)] }, 6);
    expect(state.pose.present).toBe(false);
    processPoseResult(state, { landmarks: [], worldLandmarks: [] }, 7);
    expect(state.pose.present).toBe(false);
  });
});
