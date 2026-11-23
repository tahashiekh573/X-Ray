import { useSession } from '@/stores/sessionStore';
import { useSettings } from '@/stores/settingsStore';
import { clearTracking } from '@/features/tracking/frameState';
import { CameraController } from './cameraController';
import { mapGetUserMediaError, type CameraErrorInfo } from './cameraErrors';

/**
 * App-wide camera service: one controller, one <video> element. Exposed as plain functions so
 * the toolbar, keyboard shortcuts and empty-state UI can all drive it.
 */
const controller = new CameraController();
let video: HTMLVideoElement | null = null;
let stream: MediaStream | null = null;

const isCameraError = (e: unknown): e is CameraErrorInfo =>
  typeof e === 'object' && e !== null && 'code' in e && 'title' in e;

controller.subscribe((event) => {
  const session = useSession.getState();
  if (event.type === 'ended') {
    detachStream();
    clearTracking();
    session.set({ cameraStatus: 'error', cameraError: event.error, resolution: null });
  } else {
    session.set({ devices: event.devices });
  }
});

function detachStream(): void {
  stream = null;
  if (video) {
    video.pause();
    video.srcObject = null;
  }
}

export function attachVideo(el: HTMLVideoElement | null): void {
  video = el;
  if (el && stream && el.srcObject !== stream) {
    el.srcObject = stream;
    void el.play().catch(() => undefined);
  }
}

export function getVideo(): HTMLVideoElement | null {
  return video;
}

export function isCameraSupported(): boolean {
  return CameraController.isSupported();
}

export async function refreshDevices(): Promise<void> {
  try {
    useSession.getState().set({ devices: await controller.listDevices() });
  } catch {
    /* enumerateDevices can fail in restricted contexts; the selector simply stays empty */
  }
}

export async function startCamera(deviceId: string | null = useSession.getState().deviceId): Promise<void> {
  const session = useSession.getState();
  session.set({ cameraStatus: 'requesting', cameraError: null });
  try {
    const result = await controller.start(deviceId, useSettings.getState().performance);
    stream = result.stream;
    if (video) {
      video.srcObject = result.stream;
      await video.play().catch(() => undefined);
    }
    session.set({
      cameraStatus: 'active',
      deviceId: result.deviceId,
      resolution: { width: result.width, height: result.height },
    });
    await refreshDevices(); // labels become available after permission is granted
  } catch (err) {
    detachStream();
    const info = isCameraError(err) ? err : mapGetUserMediaError(err);
    if (info.code === 'aborted') return; // superseded by a newer request
    session.set({ cameraStatus: 'error', cameraError: info });
  }
}

export function stopCamera(): void {
  controller.stop();
  detachStream();
  clearTracking();
  useSession.getState().set({ cameraStatus: 'idle', resolution: null, cameraError: null });
}

export async function switchCamera(deviceId: string): Promise<void> {
  useSession.getState().set({ deviceId });
  if (useSession.getState().cameraStatus === 'active') await startCamera(deviceId);
}

/** Release the camera when the page is being torn down. */
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => controller.stop());
}
