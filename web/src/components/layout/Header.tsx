import { Keyboard, ShieldCheck, SlidersHorizontal, Crosshair } from 'lucide-react';

interface Props {
  onShowShortcuts: () => void;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  leftOpen: boolean;
  rightOpen: boolean;
}

export function Header({ onShowShortcuts, onToggleLeft, onToggleRight, leftOpen, rightOpen }: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 px-4">
      <button
        type="button"
        className="rounded-lg border border-white/10 p-2 text-slate-200 lg:hidden"
        aria-label="Anatomy controls"
        aria-expanded={leftOpen}
        aria-controls="left-panel"
        onClick={onToggleLeft}
      >
        <SlidersHorizontal className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2.5">
        <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden="true">
          <defs>
            <radialGradient id="g" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="32" cy="30" r="28" fill="url(#g)" />
          <path d="M32 9c-11 0-19 8-19 19 0 6 2.6 10.6 6.5 13.6V49a4 4 0 0 0 4 4h17a4 4 0 0 0 4-4v-7.4C48.4 38.6 51 34 51 28 51 17 43 9 32 9Z" fill="none" stroke="#7dd3fc" strokeWidth="3" />
          <circle cx="25" cy="29" r="4.5" fill="#7dd3fc" />
          <circle cx="39" cy="29" r="4.5" fill="#7dd3fc" />
        </svg>
        <div className="leading-tight">
          <h1 className="text-[15px] font-semibold tracking-wide text-white">
            X-Ray Mirror <span className="text-ice-300">Pro</span>
          </h1>
          <p className="hidden text-[11px] text-muted sm:block">Real-time anatomy mirror · educational overlay</p>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span className="hidden items-center gap-1.5 rounded-full border border-ok/25 bg-ok/5 px-2.5 py-1 text-[11px] text-emerald-200 md:inline-flex" title="No camera data leaves this device">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Private: processed on-device
        </span>
        <button type="button" onClick={onShowShortcuts} className="rounded-lg border border-white/10 p-2 text-slate-300 hover:text-white" aria-label="Keyboard shortcuts">
          <Keyboard className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="rounded-lg border border-white/10 p-2 text-slate-200 lg:hidden"
          aria-label="Calibration controls"
          aria-expanded={rightOpen}
          aria-controls="right-panel"
          onClick={onToggleRight}
        >
          <Crosshair className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
