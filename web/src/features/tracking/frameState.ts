import { FACE_LANDMARK_COUNT, HAND_LANDMARK_COUNT, POSE_LANDMARK_COUNT } from './landmarks';

/**
 * Per-frame tracking output, written by the tracking loop and read by the render loop.
 * Deliberately a plain mutable object (not React state) so 30-60 Hz updates never re-render
 * the UI. Nothing in here ever leaves the browser.
 */
export interface FaceFrame {
  present: boolean;
  /** performance.now() of the detection that produced this frame */
  timestamp: number;
  /** last time a face was seen (ms); used for lost-face handling */
  lastSeen: number;
  /** normalised landmarks, interleaved x,y,z */
  landmarks: Float32Array;
  /** facial transformation matrix (canonical face -> camera, cm), column-major */
  matrix: Float32Array;
  hasMatrix: boolean;
  blendshapes: Map<string, number>;
  mouthRatio: number;
  jawOpen: number;
  eyeOpenLeft: number;
  eyeOpenRight: number;
}

export type Handedness = 'Left' | 'Right';

export interface HandFrame {
  present: boolean;
  timestamp: number;
  handedness: Handedness;
  /** handedness classification score (exposed by the API) */
  score: number;
  landmarks: Float32Array;
  world: Float32Array;
}

export interface PoseFrame {
  present: boolean;
  timestamp: number;
  /** normalised image landmarks, interleaved x,y,z */
  landmarks: Float32Array;
  /** metric world landmarks (metres, hip-centred) */
  world: Float32Array;
  /** per-landmark visibility (0..1) as reported by MediaPipe */
  visibility: Float32Array;
}

export interface TrackingStats {
  trackingFps: number;
  faceMs: number;
  handMs: number;
  poseMs: number;
  /** capture -> results available, when the browser exposes capture time */
  latencyMs: number | null;
  frames: number;
}

export interface FrameState {
  videoWidth: number;
  videoHeight: number;
  face: FaceFrame;
  hands: [HandFrame, HandFrame];
  pose: PoseFrame;
  stats: TrackingStats;
  /** increments whenever new tracking results are written */
  seq: number;
  /** set when smoothing filters should be reset (e.g. tab became visible again) */
  resetRequested: boolean;
}

const makeHand = (handedness: Handedness): HandFrame => ({
  present: false,
  timestamp: 0,
  handedness,
  score: 0,
  landmarks: new Float32Array(HAND_LANDMARK_COUNT * 3),
  world: new Float32Array(HAND_LANDMARK_COUNT * 3),
});

export function createFrameState(): FrameState {
  return {
    videoWidth: 1280,
    videoHeight: 720,
    face: {
      present: false,
      timestamp: 0,
      lastSeen: 0,
      landmarks: new Float32Array(FACE_LANDMARK_COUNT * 3),
      matrix: new Float32Array(16),
      hasMatrix: false,
      blendshapes: new Map(),
      mouthRatio: 0,
      jawOpen: 0,
      eyeOpenLeft: 1,
      eyeOpenRight: 1,
    },
    // Slot 0 = subject's left hand, slot 1 = subject's right hand.
    hands: [makeHand('Left'), makeHand('Right')],
    pose: {
      present: false,
      timestamp: 0,
      landmarks: new Float32Array(POSE_LANDMARK_COUNT * 3),
      world: new Float32Array(POSE_LANDMARK_COUNT * 3),
      visibility: new Float32Array(POSE_LANDMARK_COUNT),
    },
    stats: { trackingFps: 0, faceMs: 0, handMs: 0, poseMs: 0, latencyMs: null, frames: 0 },
    seq: 0,
    resetRequested: false,
  };
}

export const frameState: FrameState = createFrameState();

export function clearTracking(state: FrameState = frameState): void {
  state.face.present = false;
  state.face.hasMatrix = false;
  state.face.blendshapes.clear();
  for (const hand of state.hands) hand.present = false;
  state.pose.present = false;
  state.resetRequested = true;
  state.seq++;
}
