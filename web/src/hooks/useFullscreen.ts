import { useCallback, useEffect, useState, type RefObject } from 'react';

type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
type FsDocument = Document & { webkitExitFullscreen?: () => Promise<void>; webkitFullscreenElement?: Element };

export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const doc = typeof document !== 'undefined' ? (document as FsDocument) : null;
  const [active, setActive] = useState(false);
  const supported = !!doc && (!!document.documentElement.requestFullscreen || !!(document.documentElement as FsElement).webkitRequestFullscreen);

  useEffect(() => {
    const onChange = () => setActive(!!(doc?.fullscreenElement ?? doc?.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, [doc]);

  const toggle = useCallback(async () => {
    const el = ref.current as FsElement | null;
    if (!el || !doc) return;
    try {
      if (doc.fullscreenElement ?? doc.webkitFullscreenElement) {
        await (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      } else {
        await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
      }
    } catch {
      /* user agent refused (e.g. not triggered by a gesture) */
    }
  }, [ref, doc]);

  return { active, supported, toggle };
}
