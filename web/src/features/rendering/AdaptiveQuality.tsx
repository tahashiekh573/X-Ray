import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useSession } from '@/stores/sessionStore';
import { useSettings } from '@/stores/settingsStore';
import { DPR_RANGE, nextDpr } from './adaptiveDpr';

/**
 * Measures render FPS and adapts the device pixel ratio within the range of the selected
 * performance mode, so slower GPUs keep a usable frame rate automatically.
 */
export function AdaptiveQuality() {
  const setDpr = useThree((s) => s.setDpr);
  const mode = useSettings((s) => s.performance);
  const frames = useRef(0);
  const windowStart = useRef(performance.now());
  const dpr = useRef(1);

  useEffect(() => {
    const [, max] = DPR_RANGE[mode];
    dpr.current = Math.min(max, window.devicePixelRatio || 1);
    setDpr(dpr.current);
  }, [mode, setDpr]);

  useFrame(() => {
    frames.current++;
    const now = performance.now();
    const elapsed = now - windowStart.current;
    if (elapsed < 1000) return;
    const fps = (frames.current * 1000) / elapsed;
    frames.current = 0;
    windowStart.current = now;
    useSession.getState().setLive({ renderFps: Math.round(fps) });
    if (document.hidden) return;
    const next = nextDpr(dpr.current, fps, [DPR_RANGE[mode][0], Math.min(DPR_RANGE[mode][1], window.devicePixelRatio || 1)]);
    if (Math.abs(next - dpr.current) > 0.01) {
      dpr.current = next;
      setDpr(next);
    }
  });
  return null;
}
