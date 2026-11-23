import { BookOpen, Gauge, LayoutGrid } from 'lucide-react';
import { Section, Segmented, Toggle } from '@/components/ui/controls';
import { PRESETS } from '@/stores/presets';
import { useSession } from '@/stores/sessionStore';
import { useSettings } from '@/stores/settingsStore';
import { startCamera } from '@/features/camera/cameraService';
import type { PerformanceMode } from '@/types/settings';

export function PresetsPanel() {
  const active = useSettings((s) => s.activePreset);
  const apply = useSettings((s) => s.applyPreset);
  return (
    <Section title="Presets" icon={<LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />}>
      <div className="grid grid-cols-2 gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={active === p.id}
            title={p.description}
            onClick={() => apply(p.id)}
            className={`rounded-lg border px-2 py-1.5 text-left text-[12px] transition-all ${
              active === p.id ? 'border-ice-400/70 bg-ice-400/15 text-white' : 'border-line bg-panel-2/60 text-slate-300 hover:border-ice-400/30 hover:text-white'
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>
    </Section>
  );
}

const PERF_HELP: Record<PerformanceMode, string> = {
  low: '640×480 camera, face every 2nd frame, hands every 3rd, low resolution rendering.',
  balanced: '720p camera, face every frame, hands every 2nd frame, adaptive resolution.',
  high: '720p@60 camera, every frame tracked, up to 2× resolution with 4× MSAA.',
};

export function PerformancePanel() {
  const mode = useSettings((s) => s.performance);
  const setMode = useSettings((s) => s.setPerformance);
  return (
    <Section title="Performance" icon={<Gauge className="h-3.5 w-3.5" aria-hidden="true" />} defaultOpen={false}>
      <Segmented<PerformanceMode>
        label="Performance mode"
        value={mode}
        onChange={(m) => {
          const qualityChanged = (m === 'low') !== (mode === 'low') || m === 'high' || mode === 'high';
          setMode(m);
          if (qualityChanged && useSession.getState().cameraStatus === 'active') void startCamera();
        }}
        options={[
          { value: 'low', label: 'Low' },
          { value: 'balanced', label: 'Balanced' },
          { value: 'high', label: 'High' },
        ]}
      />
      <p className="mt-2 text-[11.5px] text-muted">{PERF_HELP[mode]}</p>
    </Section>
  );
}

export function LearningPanel() {
  const learning = useSettings((s) => s.learningMode);
  const setLearning = useSettings((s) => s.setLearningMode);
  const content = useSession((s) => s.content);
  const source = useSession((s) => s.contentSource);
  const selected = useSettings((s) => s.selectedStructure);
  const select = useSettings((s) => s.selectStructure);
  const layers = useSettings((s) => s.layers);
  const setLayer = useSettings((s) => s.setLayer);
  return (
    <Section title="Anatomy learning" icon={<BookOpen className="h-3.5 w-3.5" aria-hidden="true" />} defaultOpen={false}>
      <Toggle label="Learning mode (labels + explorer)" checked={learning} onChange={setLearning} />
      {learning && content && (
        <div className="mt-1 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
          {content.categories.map((cat) => (
            <div key={cat.id} className="mb-2">
              <div className="sticky top-0 bg-panel/95 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-ice-300">{cat.name}</div>
              <ul>
                {content.structures
                  .filter((s) => s.category === cat.id)
                  .map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => {
                          const layer = cat.id === 'hands' ? 'hands' : (cat.id as keyof typeof layers);
                          if (layer in layers && !layers[layer]) setLayer(layer, true);
                          select(s.id);
                        }}
                        className={`w-full rounded-md px-2 py-1 text-left text-[12px] ${selected === s.id ? 'bg-ice-400/15 text-white' : 'text-slate-300 hover:bg-white/5'}`}
                      >
                        {s.name}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          <p className="text-[10.5px] text-muted">Content source: {source === 'api' ? 'backend API' : 'offline copy bundled with the app'}.</p>
        </div>
      )}
    </Section>
  );
}
