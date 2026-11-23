import { describe, expect, it } from 'vitest';
import { createFrameState, clearTracking } from './frameState';
import { processFaceResult, processHandResult } from './processResults';
import { TrackingLoop } from './trackingLoop';

const lm = (n: number, f: (i: number) => [number, number, number]) =>
  Array.from({ length: n }, (_, i) => {
    const [x, y, z] = f(i);
    return { x, y, z, visibility: 0 };
  });

const IDENTITY = { rows: 4, columns: 4, data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -50, 1] };

describe('processFaceResult (mocked MediaPipe output)', () => {
  it('copies landmarks, matrix and blendshapes and derives jaw opening', () => {
    const state = createFrameState();
    const face = lm(478, () => [0.5, 0.5, 0]);
    face[78] = { x: 0.45, y: 0.6, z: 0, visibility: 0 };
    face[308] = { x: 0.55, y: 0.6, z: 0, visibility: 0 };
    face[13] = { x: 0.5, y: 0.6, z: 0, visibility: 0 };
    face[14] = { x: 0.5, y: 0.7, z: 0, visibility: 0 };
    processFaceResult(
      state,
      {
        faceLandmarks: [face],
        facialTransformationMatrixes: [IDENTITY],
        faceBlendshapes: [{ categories: [{ categoryName: 'jawOpen', score: 0.4, index: 0, displayName: '' }], headIndex: 0, headName: '' }],
      },
      1000,
    );
    expect(state.face.present).toBe(true);
    expect(state.face.matrix[14]).toBe(-50);
    expect(state.face.blendshapes.get('jawOpen')).toBe(0.4);
    expect(state.face.mouthRatio).toBeGreaterThan(0.5);
    expect(state.face.jawOpen).toBeGreaterThan(0.5);
    expect(state.face.lastSeen).toBe(1000);
  });

  it('marks the face as lost when no face is detected', () => {
    const state = createFrameState();
    state.face.present = true;
    processFaceResult(state, { faceLandmarks: [], facialTransformationMatrixes: [], faceBlendshapes: [] }, 5);
    expect(state.face.present).toBe(false);
  });

  it('requires a transformation matrix before declaring the face tracked', () => {
    const state = createFrameState();
    processFaceResult(state, { faceLandmarks: [lm(478, () => [0.5, 0.5, 0])], facialTransformationMatrixes: [], faceBlendshapes: [] }, 5);
    expect(state.face.present).toBe(false);
  });
});

describe('processHandResult (mocked MediaPipe output)', () => {
  const hand = lm(21, (i) => [0.3 + i * 0.01, 0.5, 0]);
  const cat = (name: string, score: number) => [{ categoryName: name, score, index: 0, displayName: name }];

  it('routes hands into slots by handedness', () => {
    const state = createFrameState();
    processHandResult(state, { landmarks: [hand, hand], worldLandmarks: [hand, hand], handedness: [cat('Right', 0.9), cat('Left', 0.8)] }, 10);
    expect(state.hands[0].present && state.hands[0].handedness).toBe('Left');
    expect(state.hands[1].present && state.hands[1].score).toBe(0.9);
  });

  it('keeps both hands when the classifier labels them the same', () => {
    const state = createFrameState();
    processHandResult(state, { landmarks: [hand, hand], worldLandmarks: [hand, hand], handedness: [cat('Right', 0.9), cat('Right', 0.6)] }, 10);
    expect(state.hands.every((h) => h.present)).toBe(true);
  });

  it('clears hands that disappear', () => {
    const state = createFrameState();
    processHandResult(state, { landmarks: [hand], worldLandmarks: [hand], handedness: [cat('Left', 0.9)] }, 10);
    processHandResult(state, { landmarks: [], worldLandmarks: [], handedness: [] }, 20);
    expect(state.hands.some((h) => h.present)).toBe(false);
  });

  it('clearTracking resets presence and requests a smoothing reset', () => {
    const state = createFrameState();
    state.face.present = true;
    state.hands[1].present = true;
    clearTracking(state);
    expect(state.face.present || state.hands[1].present).toBe(false);
    expect(state.resetRequested).toBe(true);
  });
});

describe('TrackingLoop scheduling', () => {
  function setup(mode: 'low' | 'balanced' | 'high') {
    const state = createFrameState();
    let faceCalls = 0;
    let handCalls = 0;
    const timestamps: number[] = [];
    const video = Object.assign(document.createElement('video'), {});
    Object.defineProperty(video, 'readyState', { value: 4 });
    Object.defineProperty(video, 'videoWidth', { value: 640 });
    Object.defineProperty(video, 'videoHeight', { value: 480 });
    const face = {
      detectForVideo: (_: unknown, ts: number) => {
        faceCalls++;
        timestamps.push(ts);
        return { faceLandmarks: [], facialTransformationMatrixes: [], faceBlendshapes: [] };
      },
    };
    const hands = {
      detectForVideo: () => {
        handCalls++;
        return { landmarks: [], worldLandmarks: [], handedness: [], handednesses: [] };
      },
    };
    const loop = new TrackingLoop({
      video,
      face: face as never,
      hands: hands as never,
      getMode: () => mode,
      handsEnabled: () => true,
      state,
    });
    (video as unknown as { requestVideoFrameCallback: () => number }).requestVideoFrameCallback = () => 1;
    loop.start();
    for (let i = 0; i < 12; i++) loop.tick(i * 33, {});
    loop.stop();
    return { faceCalls, handCalls, timestamps, state };
  }

  it('runs detectors according to the performance schedule', () => {
    expect(setup('high')).toMatchObject({ faceCalls: 12, handCalls: 12 });
    expect(setup('balanced')).toMatchObject({ faceCalls: 12, handCalls: 6 });
    expect(setup('low')).toMatchObject({ faceCalls: 6, handCalls: 3 }); // hands on frames 1, 5, 9
  });

  it('passes strictly increasing timestamps to MediaPipe', () => {
    const { timestamps } = setup('high');
    for (let i = 1; i < timestamps.length; i++) expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
  });

  it('records video dimensions for coordinate conversion', () => {
    const { state } = setup('balanced');
    expect([state.videoWidth, state.videoHeight]).toEqual([640, 480]);
  });
});
