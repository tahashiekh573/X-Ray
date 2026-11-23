import { create } from 'zustand';
import type { AnatomyContent, AssetId, AssetStatus } from '@/types/anatomy';
import type { CameraErrorInfo } from '@/features/camera/cameraErrors';

export type CameraStatus = 'idle' | 'requesting' | 'active' | 'error';
export type TrackerStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export interface LiveStatus {
  facePresent: boolean;
  handsCount: number;
  bodyPresent: boolean;
  renderFps: number;
  trackingFps: number;
  lowLight: boolean;
}

export interface CalibrationRun {
  phase: 'idle' | 'waiting' | 'collecting' | 'done' | 'failed';
  progress: number;
  message: string;
}

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface SessionState {
  cameraStatus: CameraStatus;
  cameraError: CameraErrorInfo | null;
  devices: CameraDevice[];
  deviceId: string | null;
  resolution: { width: number; height: number } | null;

  faceTracker: TrackerStatus;
  handTracker: TrackerStatus;
  poseTracker: TrackerStatus;
  trackerError: string | null;
  delegate: 'GPU' | 'CPU' | null;
  /** bump to re-initialise trackers after an error */
  trackerRetry: number;

  live: LiveStatus;
  assets: Record<AssetId, AssetStatus>;
  webgl: 'unknown' | 'ok' | 'unsupported' | 'lost';
  content: AnatomyContent | null;
  contentSource: 'loading' | 'api' | 'bundled';
  calibrationRun: CalibrationRun;
  toasts: Toast[];

  set: (patch: Partial<SessionState>) => void;
  setLive: (patch: Partial<LiveStatus>) => void;
  setAsset: (id: AssetId, status: AssetStatus) => void;
  setCalibrationRun: (patch: Partial<CalibrationRun>) => void;
  toast: (kind: Toast['kind'], message: string) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

export const useSession = create<SessionState>()((set) => ({
  cameraStatus: 'idle',
  cameraError: null,
  devices: [],
  deviceId: null,
  resolution: null,
  faceTracker: 'idle',
  handTracker: 'idle',
  poseTracker: 'idle',
  trackerError: null,
  delegate: null,
  trackerRetry: 0,
  live: { facePresent: false, handsCount: 0, bodyPresent: false, renderFps: 0, trackingFps: 0, lowLight: false },
  assets: {
    skull: { state: 'idle' },
    brain: { state: 'idle' },
    eyes: { state: 'idle' },
    muscles: { state: 'idle' },
    hand: { state: 'idle' },
    body: { state: 'idle' },
  },
  webgl: 'unknown',
  content: null,
  contentSource: 'loading',
  calibrationRun: { phase: 'idle', progress: 0, message: '' },
  toasts: [],

  set: (patch) => set(patch),
  setLive: (patch) =>
    set((s) => {
      const next = { ...s.live, ...patch };
      const changed = (Object.keys(patch) as (keyof LiveStatus)[]).some((k) => s.live[k] !== next[k]);
      return changed ? { live: next } : s;
    }),
  setAsset: (id, status) => set((s) => ({ assets: { ...s.assets, [id]: status } })),
  setCalibrationRun: (patch) => set((s) => ({ calibrationRun: { ...s.calibrationRun, ...patch } })),
  toast: (kind, message) =>
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id: ++toastId, kind, message }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
