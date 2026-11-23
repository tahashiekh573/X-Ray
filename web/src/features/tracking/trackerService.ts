import type { FaceLandmarker, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

/**
 * Loads MediaPipe Tasks from this origin only (WASM + models are self-hosted under
 * /mediapipe, see web/scripts/setup-mediapipe.mjs). Nothing is fetched from a CDN at runtime.
 */
const BASE = import.meta.env.BASE_URL;
export const MEDIAPIPE_WASM = `${BASE}mediapipe/wasm`;
export const FACE_MODEL = `${BASE}mediapipe/models/face_landmarker.task`;
export const HAND_MODEL = `${BASE}mediapipe/models/hand_landmarker.task`;
export const POSE_MODEL = `${BASE}mediapipe/models/pose_landmarker_lite.task`;

type Vision = typeof import('@mediapipe/tasks-vision');
type Fileset = Awaited<ReturnType<Vision['FilesetResolver']['forVisionTasks']>>;

let visionPromise: Promise<{ vision: Vision; fileset: Fileset }> | null = null;

function loadVision() {
  visionPromise ??= (async () => {
    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
    return { vision, fileset };
  })().catch((err) => {
    visionPromise = null; // allow a retry
    throw err;
  });
  return visionPromise;
}

async function withDelegate<T>(create: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<{ task: T; delegate: 'GPU' | 'CPU' }> {
  try {
    return { task: await create('GPU'), delegate: 'GPU' };
  } catch (gpuError) {
    console.warn('[tracking] GPU delegate unavailable, falling back to CPU', gpuError);
    return { task: await create('CPU'), delegate: 'CPU' };
  }
}

export async function createFaceLandmarker(): Promise<{ task: FaceLandmarker; delegate: 'GPU' | 'CPU' }> {
  const { vision, fileset } = await loadVision();
  return withDelegate((delegate) =>
    vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    }),
  );
}

export async function createHandLandmarker(): Promise<{ task: HandLandmarker; delegate: 'GPU' | 'CPU' }> {
  const { vision, fileset } = await loadVision();
  return withDelegate((delegate) =>
    vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }),
  );
}

export async function createPoseLandmarker(): Promise<{ task: PoseLandmarker; delegate: 'GPU' | 'CPU' }> {
  const { vision, fileset } = await loadVision();
  return withDelegate((delegate) =>
    vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: false,
    }),
  );
}
