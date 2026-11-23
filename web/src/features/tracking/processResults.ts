import type { FaceLandmarkerResult, HandLandmarkerResult, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import type { FrameState, HandFrame, Handedness } from './frameState';
import { eyeOpenness, jawOpenAmount, mouthOpenRatio } from './faceMath';

/**
 * MediaPipe (tasks-vision >= 1.x) reports handedness for the *subject's* hand when given an
 * unmirrored image (see HandLandmarkerResult docs). We always feed the raw, unmirrored camera
 * frame, so labels are used as-is. Flip this if a future version changes the convention.
 */
export const HANDEDNESS_FLIP = false;

export function processFaceResult(
  state: FrameState,
  result: Pick<FaceLandmarkerResult, 'faceLandmarks' | 'facialTransformationMatrixes' | 'faceBlendshapes'>,
  now: number,
): void {
  const face = state.face;
  const lms = result.faceLandmarks?.[0];
  if (!lms || lms.length === 0) {
    face.present = false;
    return;
  }
  const n = Math.min(lms.length, face.landmarks.length / 3);
  for (let i = 0; i < n; i++) {
    face.landmarks[i * 3] = lms[i].x;
    face.landmarks[i * 3 + 1] = lms[i].y;
    face.landmarks[i * 3 + 2] = lms[i].z;
  }
  const matrix = result.facialTransformationMatrixes?.[0];
  face.hasMatrix = !!matrix && matrix.data.length === 16;
  if (matrix && face.hasMatrix) face.matrix.set(matrix.data);

  face.blendshapes.clear();
  for (const c of result.faceBlendshapes?.[0]?.categories ?? []) {
    face.blendshapes.set(c.categoryName, c.score);
  }
  const w = state.videoWidth;
  const h = state.videoHeight;
  face.mouthRatio = mouthOpenRatio(face.landmarks, w, h);
  face.jawOpen = jawOpenAmount(face.mouthRatio);
  face.eyeOpenLeft = eyeOpenness(face.landmarks, w, h, 'left');
  face.eyeOpenRight = eyeOpenness(face.landmarks, w, h, 'right');
  face.present = face.hasMatrix;
  face.timestamp = now;
  face.lastSeen = now;
}

const slotFor = (label: Handedness): 0 | 1 => (label === 'Left' ? 0 : 1);

export function processHandResult(
  state: FrameState,
  result: Pick<HandLandmarkerResult, 'landmarks' | 'worldLandmarks' | 'handedness'>,
  now: number,
): void {
  const seen: [boolean, boolean] = [false, false];
  const count = Math.min(result.landmarks?.length ?? 0, 2);
  for (let k = 0; k < count; k++) {
    const category = result.handedness?.[k]?.[0];
    let label: Handedness = category?.categoryName === 'Left' ? 'Left' : 'Right';
    if (HANDEDNESS_FLIP) label = label === 'Left' ? 'Right' : 'Left';
    let slot = slotFor(label);
    if (seen[slot]) slot = slot === 0 ? 1 : 0; // two hands with the same label: keep both
    seen[slot] = true;
    const hand: HandFrame = state.hands[slot];
    hand.handedness = slot === 0 ? 'Left' : 'Right';
    hand.score = category?.score ?? 0;
    const lm = result.landmarks[k];
    const world = result.worldLandmarks?.[k] ?? [];
    for (let i = 0; i < 21; i++) {
      hand.landmarks[i * 3] = lm[i]?.x ?? 0;
      hand.landmarks[i * 3 + 1] = lm[i]?.y ?? 0;
      hand.landmarks[i * 3 + 2] = lm[i]?.z ?? 0;
      hand.world[i * 3] = world[i]?.x ?? 0;
      hand.world[i * 3 + 1] = world[i]?.y ?? 0;
      hand.world[i * 3 + 2] = world[i]?.z ?? 0;
    }
    hand.present = true;
    hand.timestamp = now;
  }
  for (let s = 0; s < 2; s++) if (!seen[s]) state.hands[s].present = false;
}

export function processPoseResult(
  state: FrameState,
  result: Pick<PoseLandmarkerResult, 'landmarks' | 'worldLandmarks'>,
  now: number,
): void {
  const pose = state.pose;
  const lm = result.landmarks?.[0];
  const world = result.worldLandmarks?.[0];
  if (!lm || lm.length < 33) {
    pose.present = false;
    return;
  }
  for (let i = 0; i < 33; i++) {
    pose.landmarks[i * 3] = lm[i].x;
    pose.landmarks[i * 3 + 1] = lm[i].y;
    pose.landmarks[i * 3 + 2] = lm[i].z;
    pose.world[i * 3] = world?.[i]?.x ?? 0;
    pose.world[i * 3 + 1] = world?.[i]?.y ?? 0;
    pose.world[i * 3 + 2] = world?.[i]?.z ?? 0;
    pose.visibility[i] = lm[i].visibility ?? 1;
  }
  // The torso needs both shoulders; legs/arms are hidden individually by visibility.
  pose.present = pose.visibility[11] > 0.5 && pose.visibility[12] > 0.5;
  pose.timestamp = now;
}
