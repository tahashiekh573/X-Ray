import { useEffect, useRef } from 'react';

export interface Shortcut {
  key: string;
  description: string;
  run: () => void;
}

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

/** Single-key shortcuts, ignored while typing in form fields or with modifier keys held. */
export function useKeyboardShortcuts(shortcuts: Shortcut[]): void {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      // range inputs keep arrow keys, but letter shortcuts are fine
      const s = ref.current.find((k) => k.key.toLowerCase() === e.key.toLowerCase());
      if (s) {
        e.preventDefault();
        s.run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
