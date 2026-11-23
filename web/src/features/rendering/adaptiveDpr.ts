import type { PerformanceMode } from '@/types/settings';
import { clamp } from '@/utils/math';

export const DPR_RANGE: Record<PerformanceMode, [number, number]> = {
  low: [0.5, 0.75],
  balanced: [0.6, 1],
  high: [0.75, 2],
};

/** Next device-pixel-ratio given a measured frame rate (pure; unit-tested). */
export function nextDpr(current: number, fps: number, [min, max]: [number, number]): number {
  if (fps < 24) return clamp(current - 0.1, min, max);
  if (fps > 50) return clamp(current + 0.05, min, max);
  return current;
}
