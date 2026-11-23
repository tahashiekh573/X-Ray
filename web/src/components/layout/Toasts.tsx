import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useSession, type Toast } from '@/stores/sessionStore';

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useSession((s) => s.dismissToast);
  useEffect(() => {
    const id = window.setTimeout(() => dismiss(toast.id), toast.kind === 'error' ? 7000 : 3500);
    return () => window.clearTimeout(id);
  }, [toast, dismiss]);
  const tone = {
    info: 'border-ice-300/30 text-ice-50',
    success: 'border-ok/40 text-emerald-100',
    warning: 'border-warn/40 text-amber-100',
    error: 'border-danger/50 text-red-100',
  }[toast.kind];
  return (
    <div role={toast.kind === 'error' ? 'alert' : 'status'} className={`glass flex items-start gap-2 rounded-xl border px-3 py-2 text-[12.5px] ${tone}`}>
      <span className="flex-1">{toast.message}</span>
      <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)} className="text-muted hover:text-white">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function Toasts() {
  const toasts = useSession((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto w-full max-w-sm">
          <ToastItem toast={t} />
        </div>
      ))}
    </div>
  );
}
