/** MediaPipe Face Mesh / Hand landmark indices used by the app. */

export const FACE_LANDMARK_COUNT = 478;
export const HAND_LANDMARK_COUNT = 21;
export const POSE_LANDMARK_COUNT = 33;

/** MediaPipe Pose landmarks (subject's left/right). */
export const POSE = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;

export const POSE_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 31], [24, 26], [26, 28], [28, 32],
];

export const FACE = {
  foreheadTop: 10,
  chin: 152,
  noseBridge: 168,
  noseTip: 4,
  upperInnerLip: 13,
  lowerInnerLip: 14,
  mouthInnerRight: 78,
  mouthInnerLeft: 308,
  mouthOuterRight: 61,
  mouthOuterLeft: 291,
  // Subject's right eye (appears on image left before mirroring)
  rightEyeOuter: 33,
  rightEyeInner: 133,
  rightEyeUpper: 159,
  rightEyeLower: 145,
  // Subject's left eye
  leftEyeInner: 362,
  leftEyeOuter: 263,
  leftEyeUpper: 386,
  leftEyeLower: 374,
  rightCheek: 234,
  leftCheek: 454,
} as const;

/** Face silhouette, ordered clockwise starting at the forehead. */
export const FACE_OVAL: readonly number[] = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
  148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

export const HAND = {
  wrist: 0,
  thumbCmc: 1,
  thumbMcp: 2,
  thumbIp: 3,
  thumbTip: 4,
  indexMcp: 5,
  middleMcp: 9,
  ringMcp: 13,
  pinkyMcp: 17,
} as const;

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

/**
 * Canonical face-model coordinates (cm) of a few landmarks, from MediaPipe's
 * canonical_face_model.obj (Apache-2.0). Used for assisted calibration.
 */
export const CANONICAL: Record<number, readonly [number, number, number]> = {
  33: [-4.445859, 2.663991, 3.173422],
  133: [-1.856432, 2.585245, 3.757904],
  362: [1.856432, 2.585245, 3.757904],
  263: [4.445859, 2.663991, 3.173422],
  168: [0.0, 3.271027, 5.236015],
  152: [0.0, -9.403378, 4.264492],
  234: [-7.664182, 0.673132, -2.435867],
  454: [7.664182, 0.673132, -2.435867],
};
