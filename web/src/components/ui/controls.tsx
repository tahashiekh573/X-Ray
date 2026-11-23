import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
  hint?: string;
}

export function Slider({ label, value, min, max, step = 0.01, onChange, format, disabled, hint }: SliderProps) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  const shown = format ? format(value) : value.toFixed(2);
  return (
    <div className={`py-1.5 ${disabled ? 'opacity-40' : ''}`}>
      <div className="mb-0.5 flex items-center justify-between text-[12px]">
        <label htmlFor={id} className="text-slate-300">
          {label}
        </label>
        <span className="font-mono text-[11px] tabular-nums text-ice-200">{shown}</span>
      </div>
      <input
        id={id}
        type="range"
        className="xr-range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={shown}
        title={hint}
        style={{ ['--fill' as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: ReactNode;
  disabled?: boolean;
  badge?: ReactNode;
}

export function Toggle({ label, checked, onChange, hint, disabled, badge }: ToggleProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={`group flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-[13px] transition-colors hover:bg-white/[0.03] ${
        disabled ? 'pointer-events-none opacity-40' : ''
      }`}
    >
      <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
        <input
          id={id}
          type="checkbox"
          aria-label={label}
          aria-describedby={badge || hint ? `${id}-desc` : undefined}
          className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-slate-600 bg-panel-2 transition-colors checked:border-ice-400 checked:bg-ice-400/90"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <svg viewBox="0 0 12 12" className="pointer-events-none absolute h-2.5 w-2.5 text-void opacity-0 peer-checked:opacity-100" aria-hidden="true">
          <path d="M2 6.5 5 9l5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="flex-1 text-slate-200">{label}</span>
      <span id={`${id}-desc`} className="flex items-center gap-1.5">
        {badge}
        {hint && <span className="text-[11px] text-muted">{hint}</span>}
      </span>
    </label>
  );
}

interface SectionProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  actions?: ReactNode;
}

export function Section({ title, icon, children, defaultOpen = true, actions }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="glass rounded-2xl">
      <div className="flex items-center gap-2 px-3.5 pt-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 rounded-md text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-ice-200/90"
        >
          {icon}
          <span className="flex-1">{title}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-muted transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
        </button>
        {actions}
      </div>
      <div id={id} hidden={!open} className="px-3.5 pb-3 pt-2">
        {children}
      </div>
    </section>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
  columns?: number;
}

export function Segmented<T extends string>({ label, value, options, onChange, columns }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[12px] font-medium transition-all duration-150 ${
              active
                ? 'border-ice-400/70 bg-ice-400/15 text-ice-50 shadow-[0_0_16px_-6px_rgba(56,189,248,0.8)]'
                : 'border-line bg-panel-2/60 text-slate-300 hover:border-ice-400/30 hover:text-white'
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}

export function Select<T extends string>({ label, value, options, onChange, disabled }: SelectProps<T>) {
  const id = useId();
  return (
    <div className="py-1.5">
      <label htmlFor={id} className="mb-1 block text-[12px] text-slate-300">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-[13px] text-slate-100 transition-colors hover:border-ice-400/40 disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  className?: string;
  title?: string;
  type?: 'button' | 'submit';
  ariaLabel?: string;
  ariaPressed?: boolean;
}

export function Button({ children, onClick, variant = 'ghost', disabled, className = '', title, ariaLabel, ariaPressed }: ButtonProps) {
  const styles = {
    primary: 'bg-ice-400 text-void hover:bg-ice-300 shadow-[0_0_24px_-8px_rgba(56,189,248,0.9)]',
    ghost: 'border border-line bg-panel-2/70 text-slate-200 hover:border-ice-400/40 hover:text-white',
    danger: 'border border-danger/50 bg-red-950/85 text-red-100 hover:bg-red-900/90',
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function IconButton({ label, children, onClick, active, disabled }: { label: string; children: ReactNode; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-40 ${
        active ? 'border-ice-400/70 bg-ice-400/20 text-ice-50' : 'border-white/10 bg-void/70 text-slate-200 hover:border-ice-400/40 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

export function StatusChip({ tone, children, title }: { tone: 'ok' | 'warn' | 'off' | 'error' | 'info'; children: ReactNode; title?: string }) {
  const dot = { ok: 'bg-ok', warn: 'bg-warn', off: 'bg-slate-500', error: 'bg-danger', info: 'bg-ice-400' }[tone];
  return (
    <span title={title} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-void/75 px-2.5 py-1 text-[11px] font-medium text-slate-200 backdrop-blur">
      <span className={`h-1.5 w-1.5 rounded-full ${dot} ${tone === 'ok' ? 'shadow-[0_0_8px_rgba(52,211,153,0.9)]' : ''}`} aria-hidden="true" />
      {children}
    </span>
  );
}
