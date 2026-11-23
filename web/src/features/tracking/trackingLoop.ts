import type { FaceLandmarker, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { PerformanceMode } from '@/types/settings';
import { frameState, type FrameState } from './frameState';
import { processFaceResult, processHandResult, processPoseResult } from './processResults';

export interface DetectorSchedule {
  faceEvery: number;
  handsEvery: number;
  handsOffset: number;
  poseEvery: number;
  poseOffset: number;
}

/**
 * How often (in video frames) each detector runs per performance mode. Hands and pose use
 * offsets so the expensive detectors run on *different* frames: per-frame work stays roughly
 * constant instead of spiking when everything runs at once.
 */
export const SCHEDULE: Record<PerformanceMode, DetectorSchedule> = {
  low: { faceEvery: 2, handsEvery: 4, handsOffset: 1, poseEvery: 4, poseOffset: 3 },
  balanced: { faceEvery: 1, handsEvery: 2, handsOffset: 0, poseEvery: 2, poseOffset: 1 },
  high: { faceEvery: 1, handsEvery: 1, handsOffset: 0, poseEvery: 1, poseOffset: 0 },
};

export const runsOn = (frame: number, every: number, offset = 0): boolean => frame % every === offset % every;

export interface TrackingLoopOptions {
  video: HTMLVideoElement;
  face: FaceLandmarker | null;
  hands: HandLandmarker | null;
  pose?: PoseLandmarker | null;
  getMode: () => PerformanceMode;
  handsEnabled: () => boolean;
  poseEnabled?: () => boolean;
  onError?: (err: unknown) => void;
  state?: FrameState;
}

type VideoFrameMeta = { captureTime?: number; mediaTime?: number };
type RvfcVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: VideoFrameMeta) => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

/**
 * Runs detection once per *new camera frame* (requestVideoFrameCallback when available), which
 * keeps tracking decoupled from the render loop: rendering interpolates/smooths at display rate
 * while detection runs at camera rate according to the performance schedule.
 */
export class TrackingLoop {
  private running = false;
  private handle = 0;
  private usingRvfc = false;
  private frameIndex = 0;
  private lastTs = 0;
  private lastVideoTime = -1;
  private fpsWindowStart = 0;
  private fpsFrames = 0;
  face: FaceLandmarker | null;
  hands: HandLandmarker | null;
  pose: PoseLandmarker | null;

  constructor(private readonly opts: TrackingLoopOptions) {
    this.face = opts.face;
    this.hands = opts.hands;
    this.pose = opts.pose ?? null;
  }

  private get state(): FrameState {
    return this.opts.state ?? frameState;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.fpsWindowStart = performance.now();
    this.schedule();
  }

  stop(): void {
    this.running = false;
    const v = this.opts.video as RvfcVideo;
    if (this.usingRvfc && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(this.handle);
    else cancelAnimationFrame(this.handle);
  }

  private schedule(): void {
    if (!this.running) return;
    const v = this.opts.video as RvfcVideo;
    if (typeof v.requestVideoFrameCallback === 'function') {
      this.usingRvfc = true;
      this.handle = v.requestVideoFrameCallback((now, meta) => this.tick(now, meta));
    } else {
      this.usingRvfc = false;
      this.handle = requestAnimationFrame((now) => this.tick(now, {}));
    }
  }

  /** Exposed for tests. */
  tick(now: number, meta: VideoFrameMeta): void {
    try {
      this.process(now, meta);
    } catch (err) {
      this.opts.onError?.(err);
    } finally {
      this.schedule();
    }
  }

  private process(now: number, meta: VideoFrameMeta): void {
    const video = this.opts.video;
    if (document.hidden || video.readyState < 2 || video.videoWidth === 0) return;
    if (!this.usingRvfc) {
      if (video.currentTime === this.lastVideoTime) return; // no new frame yet
      this.lastVideoTime = video.currentTime;
    }
    const state = this.state;
    state.videoWidth = video.videoWidth;
    state.videoHeight = video.videoHeight;

    const sched = SCHEDULE[this.opts.getMode()];
    const idx = this.frameIndex++;
    const ts = Math.max(performance.now(), this.lastTs + 1); // MediaPipe needs increasing timestamps
    this.lastTs = ts;
    let wrote = false;

    if (this.face && runsOn(idx, sched.faceEvery)) {
      const t0 = performance.now();
      const result = this.face.detectForVideo(video, ts);
      state.stats.faceMs = performance.now() - t0;
      processFaceResult(state, result, ts);
      wrote = true;
    }
    if (this.hands && this.opts.handsEnabled() && runsOn(idx, sched.handsEvery, sched.handsOffset)) {
      const t0 = performance.now();
      const result = this.hands.detectForVideo(video, ts);
      state.stats.handMs = performance.now() - t0;
      processHandResult(state, result, ts);
      wrote = true;
    } else if (!this.opts.handsEnabled()) {
      state.hands[0].present = false;
      state.hands[1].present = false;
    }
    const poseOn = this.opts.poseEnabled?.() ?? false;
    if (this.pose && poseOn && runsOn(idx, sched.poseEvery, sched.poseOffset)) {
      const t0 = performance.now();
      const result = this.pose.detectForVideo(video, ts);
      state.stats.poseMs = performance.now() - t0;
      processPoseResult(state, result, ts);
      wrote = true;
    } else if (!poseOn) {
      state.pose.present = false;
    }

    if (wrote) {
      state.seq++;
      state.stats.frames++;
      this.fpsFrames++;
      state.stats.latencyMs =
        typeof meta.captureTime === 'number' && meta.captureTime > 0
          ? performance.now() - meta.captureTime
          : null;
    }
    const elapsed = now - this.fpsWindowStart;
    if (elapsed >= 1000) {
      state.stats.trackingFps = (this.fpsFrames * 1000) / elapsed;
      this.fpsFrames = 0;
      this.fpsWindowStart = now;
    }
  }
}
