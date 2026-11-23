import { Quaternion, Vector3, Matrix4 } from 'three';
import { frameState } from '@/features/tracking/frameState';
import { isFrontal } from '@/features/tracking/faceMath';
import { useSession } from '@/stores/sessionStore';
import { useSettings } from '@/stores/settingsStore';
import { CAMERA_FOV } from '@/features/rendering/constants';
import { observeHeadSpace, solveCalibration } from './calibrationMath';

/** ~0.5 s at 30 fps; slow devices simply take longer (bounded by the timeout). */
const SAMPLES_NEEDED = 16;
const TIMEOUT_MS = 25000;
const MAX_JITTER_CM = 0.6;

let cancelRun: (() => void) | null = null;

/**
 * Assisted calibration:
 *  1. ask the user to face the camera, 2. wait for a stable frontal face,
 *  3. measure face proportions in the head frame over ~1 s, 4. apply the solved transform.
 * The user can then fine-tune with the manual sliders.
 */
export function startAutoCalibration(centre: Vector3): void {
  cancelRun?.();
  const session = useSession.getState();
  if (session.cameraStatus !== 'active') {
    session.setCalibrationRun({ phase: 'failed', progress: 0, message: 'Start the camera first.' });
    return;
  }
  session.setCalibrationRun({ phase: 'waiting', progress: 0, message: 'Look straight at the camera and keep still…' });

  const samples: Map<number, Vector3>[] = [];
  const nasions: Vector3[] = [];
  const started = performance.now();
  let lastSeq = -1;
  let raf = 0;
  const q = new Quaternion();
  const pos = new Vector3();
  const scl = new Vector3();

  const finish = (phase: 'done' | 'failed', message: string) => {
    cancelAnimationFrame(raf);
    cancelRun = null;
    useSession.getState().setCalibrationRun({ phase, progress: phase === 'done' ? 1 : 0, message });
  };

  const step = () => {
    const face = frameState.face;
    if (performance.now() - started > TIMEOUT_MS) {
      finish('failed', 'Could not get a steady, frontal view. Improve lighting, face the camera and try again.');
      return;
    }
    if (frameState.seq !== lastSeq && face.present && face.hasMatrix) {
      lastSeq = frameState.seq;
      new Matrix4().fromArray(Array.from(face.matrix)).decompose(pos, q, scl);
      if (isFrontal(q, 9)) {
        const obs = observeHeadSpace(face.landmarks, face.matrix, frameState.videoWidth, frameState.videoHeight, CAMERA_FOV);
        const nasion = obs.get(168);
        if (nasion) {
          // restart collection if the head moved (unstable)
          if (nasions.length > 0 && nasion.distanceTo(nasions[0]) > MAX_JITTER_CM) {
            samples.length = 0;
            nasions.length = 0;
          }
          samples.push(obs);
          nasions.push(nasion);
          useSession.getState().setCalibrationRun({
            phase: 'collecting',
            progress: samples.length / SAMPLES_NEEDED,
            message: 'Hold still…',
          });
        }
      } else {
        useSession.getState().setCalibrationRun({ phase: 'waiting', progress: 0, message: 'Turn to face the camera directly.' });
      }
      if (samples.length >= SAMPLES_NEEDED) {
        try {
          const settings = useSettings.getState();
          settings.setCalibration(solveCalibration(samples, centre, settings.calibration));
          finish('done', 'Calibrated. Fine-tune with the sliders if needed.');
        } catch (err) {
          finish('failed', err instanceof Error ? err.message : 'Calibration failed.');
        }
        return;
      }
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  cancelRun = () => {
    cancelAnimationFrame(raf);
    cancelRun = null;
  };
}

export function cancelAutoCalibration(): void {
  cancelRun?.();
  useSession.getState().setCalibrationRun({ phase: 'idle', progress: 0, message: '' });
}
