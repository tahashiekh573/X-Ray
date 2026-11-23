import { X, FlaskConical } from 'lucide-react';
import { findStructure } from '@/services/contentService';
import { useSession } from '@/stores/sessionStore';
import { useSettings } from '@/stores/settingsStore';
import { useAssets } from './assetStore';

/** Compact info card for the selected structure; never covers more than a corner of the view. */
export function StructureInfoPanel() {
  const content = useSession((s) => s.content);
  const selected = useSettings((s) => s.selectedStructure);
  const select = useSettings((s) => s.selectStructure);
  const manifest = useAssets((s) => s.manifest);
  const structure = findStructure(content, selected);
  if (!structure) return null;
  const category = content?.categories.find((c) => c.id === structure.category)?.name ?? structure.category;
  const schematic = manifest?.structures[structure.id]?.schematic ?? false;

  return (
    <aside
      aria-label={`About ${structure.name}`}
      aria-live="polite"
      className="glass absolute bottom-16 left-3 z-30 w-[min(340px,calc(100%-1.5rem))] rounded-2xl p-4 text-[13px] sm:bottom-4"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ice-300">{category}</div>
          <h2 className="mt-0.5 text-[16px] font-semibold text-white">{structure.name}</h2>
        </div>
        <button
          type="button"
          onClick={() => select(null)}
          aria-label="Close structure details"
          className="rounded-lg p-1 text-muted hover:bg-white/5 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {schematic && (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-warn/30 bg-warn/10 px-2 py-1 text-[11px] text-amber-200">
          <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Schematic approximation — no licensed mesh available
        </p>
      )}
      <p className="mt-2 leading-relaxed text-slate-300">{structure.description}</p>
      <p className="mt-2 leading-relaxed text-slate-300">
        <span className="font-semibold text-ice-200">Function: </span>
        {structure.function}
      </p>
      {structure.related.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] text-muted">Related structures</div>
          <div className="flex flex-wrap gap-1.5">
            {structure.related.map((id) => {
              const r = findStructure(content, id);
              return r ? (
                <button
                  key={id}
                  type="button"
                  onClick={() => select(id)}
                  className="rounded-full border border-ice-300/25 px-2 py-0.5 text-[11px] text-ice-100 hover:border-ice-300/60 hover:bg-ice-400/10"
                >
                  {r.name.replace(' (schematic)', '')}
                </button>
              ) : null;
            })}
          </div>
        </div>
      )}
    </aside>
  );
}
