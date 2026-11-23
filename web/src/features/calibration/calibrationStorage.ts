import type { Calibration } from '@/types/settings';
import { clampCalibration } from './calibrationMath';

const KEY = 'xray-mirror-pro:calibration:v1';

/** Calibration is stored only on this device, and only when the user opts in. */
export function loadCalibration(storage: Storage | undefined = globalThis.localStorage): Calibration | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Calibration>;
    const keys: (keyof Calibration)[] = ['scale', 'width', 'height', 'depth', 'offsetX', 'offsetY', 'offsetZ', 'pitch', 'yaw', 'roll'];
    if (!keys.every((k) => typeof parsed[k] === 'number')) return null;
    return clampCalibration(parsed as Calibration);
  } catch {
    return null;
  }
}

export function saveCalibration(c: Calibration, storage: Storage | undefined = globalThis.localStorage): boolean {
  try {
    storage?.setItem(KEY, JSON.stringify(c));
    return true;
  } catch {
    return false;
  }
}

export function clearCalibration(storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    /* storage unavailable (private mode) */
  }
}
