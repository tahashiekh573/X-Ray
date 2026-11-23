import { clearTracking } from '@/features/tracking/frameState';
import { latestLabels } from '@/features/anatomy/labelSnapshot';
import { useSession } from '@/stores/sessionStore';
import { captureScreenshot, downloadBlob, screenshotFilename } from './screenshot';

export async function takeScreenshot(stage: HTMLElement | null): Promise<void> {
  const session = useSession.getState();
  const canvas = stage?.querySelector('canvas');
  if (!canvas) {
    session.toast('error', 'Screenshot needs the 3D renderer (WebGL).');
    return;
  }
  try {
    const blob = await captureScreenshot(canvas, latestLabels.items);
    downloadBlob(blob, screenshotFilename());
    session.toast('success', 'Screenshot saved as PNG (stays on your device).');
  } catch (err) {
    session.toast('error', err instanceof Error ? err.message : 'Screenshot failed');
  }
}

export function resetTracking(): void {
  clearTracking();
  const s = useSession.getState();
  if (s.faceTracker === 'error' || s.handTracker === 'error') s.set({ trackerRetry: s.trackerRetry + 1, handTracker: 'idle' });
  s.toast('info', 'Tracking reset — look at the camera to reacquire.');
}
