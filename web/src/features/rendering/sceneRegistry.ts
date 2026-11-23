import { Matrix4, Object3D, type Camera } from 'three';
import type { HandPoseResult } from '@/features/tracking/handMath';
import type { BodyPoseResult } from '@/features/tracking/bodyMath';

/**
 * Shared, non-React registry of live scene objects. Rigs write their matrices here every frame;
 * DOM overlays (labels, debug panel, screenshot compositor) read them after rendering.
 */
export const sceneRegistry = {
  /** head-space root (pose x calibration); its matrixWorld maps canonical-face cm to world */
  headSpace: null as Object3D | null,
  /** mirrored root that contains every rig (scale -1 on x) */
  mirrorRoot: null as Object3D | null,
  /** mandible transform in head space (hinge rotation + protrusion) */
  jawMatrix: new Matrix4(),
  /** per-hand pose (local to the mirror root); null when the hand is not visible */
  handAnchors: [null, null] as [Matrix4 | null, Matrix4 | null],
  handPoses: [null, null] as [HandPoseResult | null, HandPoseResult | null],
  /** full-body pose (local to the mirror root); null when not visible */
  bodyPose: null as BodyPoseResult | null,
  camera: null as Camera | null,
};

export interface AfterRenderContext {
  camera: Camera;
  width: number;
  height: number;
  time: number;
}

const afterRender = new Set<(ctx: AfterRenderContext) => void>();

export function onAfterRender(fn: (ctx: AfterRenderContext) => void): () => void {
  afterRender.add(fn);
  return () => afterRender.delete(fn);
}

export function emitAfterRender(ctx: AfterRenderContext): void {
  for (const fn of afterRender) fn(ctx);
}

/** Render layers: head anatomy + hand occluders render first; hands after a depth clear. */
export const RENDER_LAYER = { head: 0, hands: 1 } as const;
