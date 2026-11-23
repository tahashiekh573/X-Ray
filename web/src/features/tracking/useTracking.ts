import { useEffect, useRef } from 'react';
import type { FaceLandmarker, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { getVideo } from '@/features/camera/cameraService';
import { useSession } from '@/stores/sessionStore';
import { useSettings } from '@/stores/settingsStore';
import { clearTracking, frameState } from './frameState';
import { FACE_OVAL } from './landmarks';
import { LOW_LIGHT_THRESHOLD, landmarkBounds, sampleVideoLuma } from './lowLight';
import { createFaceLandmarker, createHandLandmarker, createPoseLandmarker } from './trackerService';
import { TrackingLoop } from './trackingLoop';

/** Model downloads/initialisation that take longer than this surface as an error with Retry. */
export const TRACKER_INIT_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${Math.round(ms / 1000)} s (slow network?)`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';

/**
 * Owns MediaPipe task lifecycles: creates the face landmarker when the camera starts, lazily
 * creates the hand landmarker when the hand layer is first enabled, runs the tracking loop and
 * publishes throttled status (4 Hz) to the UI store. Everything is released on unmount.
 */
export function useTracking(): void {
  const cameraStatus = useSession((s) => s.cameraStatus);
  const retry = useSession((s) => s.trackerRetry);
  const handsLayer = useSettings((s) => s.layers.hands);
  const bodyLayer = useSettings((s) => s.layers.body);
  const face = useRef<FaceLandmarker | null>(null);
  const hands = useRef<HandLandmarker | null>(null);
  const pose = useRef<PoseLandmarker | null>(null);
  const loop = useRef<TrackingLoop | null>(null);

  useEffect(() => {
    if (cameraStatus !== 'active') return;
    const video = getVideo();
    if (!video) return;
    let cancelled = false;
    const session = useSession.getState();
    let errors = 0;

    (async () => {
      if (!face.current) {
        session.set({ faceTracker: 'loading', trackerError: null });
        try {
          const { task, delegate } = await withTimeout(createFaceLandmarker(), TRACKER_INIT_TIMEOUT_MS, 'Loading the face tracker');
          if (cancelled) {
            task.close();
            return;
          }
          face.current = task;
          session.set({ faceTracker: 'ready', delegate });
        } catch (err) {
          if (!cancelled) session.set({ faceTracker: 'error', trackerError: errorMessage(err) });
          return;
        }
      }
      if (cancelled) return;
      const instance = new TrackingLoop({
        video,
        face: face.current,
        hands: hands.current,
        pose: pose.current,
        getMode: () => useSettings.getState().performance,
        handsEnabled: () => useSettings.getState().layers.hands,
        poseEnabled: () => useSettings.getState().layers.body,
        onError: (err) => {
          if (++errors === 1) console.error('[tracking] detection failed', err);
          if (errors === 30) {
            instance.stop();
            useSession.getState().set({ faceTracker: 'error', trackerError: errorMessage(err) });
          }
        },
      });
      loop.current = instance;
      instance.start();
    })();

    return () => {
      cancelled = true;
      loop.current?.stop();
      loop.current = null;
      clearTracking();
    };
  }, [cameraStatus, retry]);

  useEffect(() => {
    if (!handsLayer || cameraStatus !== 'active' || hands.current) return;
    let cancelled = false;
    const session = useSession.getState();
    session.set({ handTracker: 'loading' });
    withTimeout(createHandLandmarker(), TRACKER_INIT_TIMEOUT_MS, 'Loading the hand tracker')
      .then(({ task }) => {
        if (cancelled) {
          task.close();
          return;
        }
        hands.current = task;
        if (loop.current) loop.current.hands = task;
        session.set({ handTracker: 'ready' });
      })
      .catch((err) => {
        if (!cancelled) {
          session.set({ handTracker: 'error' });
          session.toast('error', `Hand tracking unavailable: ${errorMessage(err)}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [handsLayer, cameraStatus, retry]);

  useEffect(() => {
    if (!bodyLayer || cameraStatus !== 'active' || pose.current) return;
    let cancelled = false;
    const session = useSession.getState();
    session.set({ poseTracker: 'loading' });
    withTimeout(createPoseLandmarker(), TRACKER_INIT_TIMEOUT_MS, 'Loading the body tracker')
      .then(({ task }) => {
        if (cancelled) {
          task.close();
          return;
        }
        pose.current = task;
        if (loop.current) loop.current.pose = task;
        session.set({ poseTracker: 'ready' });
      })
      .catch((err) => {
        if (!cancelled) {
          session.set({ poseTracker: 'error' });
          session.toast('error', `Body tracking unavailable: ${errorMessage(err)}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bodyLayer, cameraStatus, retry]);

  // Throttled status for the UI (never per-frame React updates).
  useEffect(() => {
    let lastLuma = 0;
    const id = window.setInterval(() => {
      const live: Parameters<ReturnType<typeof useSession.getState>['setLive']>[0] = {
        facePresent: frameState.face.present,
        handsCount: frameState.hands.filter((h) => h.present).length,
        bodyPresent: frameState.pose.present,
        trackingFps: Math.round(frameState.stats.trackingFps),
      };
      const now = performance.now();
      const video = getVideo();
      if (video && useSession.getState().cameraStatus === 'active' && now - lastLuma > 1500) {
        lastLuma = now;
        const region = frameState.face.present ? landmarkBounds(frameState.face.landmarks, FACE_OVAL) : undefined;
        const luma = sampleVideoLuma(video, region);
        if (luma !== null) live.lowLight = luma < LOW_LIGHT_THRESHOLD;
      }
      useSession.getState().setLive(live);
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  // Pause-safe: when the tab becomes visible again, smoothing filters restart from fresh data.
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) frameState.resetRequested = true;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(
    () => () => {
      loop.current?.stop();
      face.current?.close();
      hands.current?.close();
      pose.current?.close();
      face.current = null;
      hands.current = null;
      pose.current = null;
    },
    [],
  );
}
