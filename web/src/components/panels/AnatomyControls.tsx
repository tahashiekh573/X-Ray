import { Bone, Brain, Eye, Layers, Palette, ScanFace, Sparkles, Hand, Tag, RotateCcw, FlaskConical, PersonStanding } from 'lucide-react';
import { Button, Section, Segmented, Select, Slider, Toggle } from '@/components/ui/controls';
import { useSession } from '@/stores/sessionStore';
import { useSettings } from '@/stores/settingsStore';
import type { LayerPresetId } from '@/stores/presets';
import type { BlendMode, LayerId, RevealMode } from '@/types/settings';

const pct = (v: number) => `${Math.round(v * 100)}%`;

const LAYER_ROWS: { id: LayerId; label: string; icon: typeof Bone }[] = [
  { id: 'skull', label: 'Skull', icon: Bone },
  { id: 'brain', label: 'Brain', icon: Brain },
  { id: 'muscles', label: 'Muscles', icon: Sparkles },
  { id: 'eyes', label: 'Eyes', icon: Eye },
  { id: 'outline', label: 'Head Outline', icon: ScanFace },
  { id: 'hands', label: 'Hand Bones', icon: Hand },
  { id: 'body', label: 'Full Body Skeleton', icon: PersonStanding },
];

const TINTS = [
  { name: 'Ice', value: '#9fdcff' },
  { name: 'Cyan', value: '#5eead4' },
  { name: 'Bone', value: '#f1e7cf' },
  { name: 'Amber', value: '#fbbf24' },
  { name: 'Violet', value: '#c4b5fd' },
];

const REVEAL_OPTIONS: { value: RevealMode; label: string }[] = [
  { value: 'full', label: 'Full Head X-Ray' },
  { value: 'lens', label: 'Circular X-Ray Lens' },
  { value: 'follow', label: 'Follow Face' },
  { value: 'split', label: 'Split Face' },
  { value: 'anatomy', label: 'Anatomy Only' },
  { value: 'camera', label: 'Real Camera Only' },
];

function LayerBadge({ id }: { id: LayerId }) {
  const asset = useSession((s) => (id === 'outline' ? null : s.assets[id === 'hands' ? 'hand' : id]));
  const poseTracker = useSession((s) => s.poseTracker);
  if (id === 'body' && poseTracker === 'loading') return <span className="text-[10px] text-ice-300">loading tracker…</span>;
  if (!asset) return null;
  if (asset.state === 'loading') return <span className="text-[10px] text-ice-300">loading…</span>;
  if (asset.state === 'error') return <span className="text-[10px] text-danger">{id === 'hands' ? 'fallback' : 'error'}</span>;
  if (id === 'muscles') {
    return (
      <span title="Facial muscles are schematic: BodyParts3D has no muscles of expression" className="inline-flex items-center gap-0.5 text-[10px] text-amber-300">
        <FlaskConical className="h-3 w-3" aria-hidden="true" />schematic
      </span>
    );
  }
  return null;
}

export function LayersPanel() {
  const layers = useSettings((s) => s.layers);
  const setLayer = useSettings((s) => s.setLayer);
  const applyLayerPreset = useSettings((s) => s.applyLayerPreset);
  const showLabels = useSettings((s) => s.showLabels);
  const setShowLabels = useSettings((s) => s.setShowLabels);
  const presets: { id: LayerPresetId; label: string }[] = [
    { id: 'skull', label: 'Skull' },
    { id: 'brain', label: 'Brain' },
    { id: 'muscles', label: 'Muscles' },
    { id: 'everything', label: 'Everything' },
  ];
  return (
    <Section title="Layers" icon={<Layers className="h-3.5 w-3.5" aria-hidden="true" />}>
      <div className="mb-2 grid grid-cols-2 gap-1.5">
        {presets.map((p) => (
          <Button key={p.id} onClick={() => applyLayerPreset(p.id)}>
            {p.label}
          </Button>
        ))}
      </div>
      <div className="flex flex-col">
        {LAYER_ROWS.map(({ id, label, icon: Icon }) => (
          <Toggle
            key={id}
            label={label}
            checked={layers[id]}
            onChange={(v) => setLayer(id, v)}
            badge={
              <span className="flex items-center gap-1.5">
                <LayerBadge id={id} />
                <Icon className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
              </span>
            }
          />
        ))}
        <div className="my-1 border-t border-white/5" />
        <Toggle label="Show Labels" checked={showLabels} onChange={setShowLabels} badge={<Tag className="h-3.5 w-3.5 text-muted" aria-hidden="true" />} />
      </div>
    </Section>
  );
}

export function LookPanel() {
  const look = useSettings((s) => s.look);
  const setLook = useSettings((s) => s.setLook);
  const resetLook = useSettings((s) => s.resetLook);
  return (
    <Section
      title="Look"
      icon={<Palette className="h-3.5 w-3.5" aria-hidden="true" />}
    >
      <Segmented
        label="Rendering mode"
        value={look.mode}
        onChange={(mode) => setLook({ mode })}
        options={[
          { value: 'xray', label: 'X-Ray Mode' },
          { value: 'solid', label: 'Solid Mode' },
        ]}
      />
      <Slider label="Brightness" value={look.brightness} min={0.2} max={2} step={0.05} onChange={(brightness) => setLook({ brightness })} format={pct} />
      <Slider label="Opacity" value={look.opacity} min={0.05} max={1} step={0.01} onChange={(opacity) => setLook({ opacity })} format={pct} />
      <div className="py-1.5">
        <div className="mb-1 flex items-center justify-between text-[12px] text-slate-300">
          <span id="tint-label">Anatomy color</span>
          <input
            type="color"
            aria-label="Custom anatomy color"
            value={look.tint}
            onChange={(e) => setLook({ tint: e.target.value })}
            className="h-5 w-8 cursor-pointer rounded border border-line bg-transparent"
          />
        </div>
        <div role="radiogroup" aria-labelledby="tint-label" className="flex gap-1.5">
          {TINTS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={look.tint === t.value}
              aria-label={t.name}
              title={t.name}
              onClick={() => setLook({ tint: t.value })}
              className={`h-6 flex-1 rounded-md border transition-transform hover:scale-105 ${look.tint === t.value ? 'border-white ring-2 ring-ice-300/50' : 'border-white/10'}`}
              style={{ background: t.value }}
            />
          ))}
        </div>
      </div>
      <Toggle label="Wireframe" checked={look.wireframe} onChange={(wireframe) => setLook({ wireframe })} />
      <Button className="mt-1 w-full" onClick={resetLook}>
        <RotateCcw className="h-3.5 w-3.5" /> Reset appearance
      </Button>
    </Section>
  );
}

export function MixedRealityPanel() {
  const mixed = useSettings((s) => s.mixed);
  const setMixed = useSettings((s) => s.setMixed);
  const usesLens = mixed.reveal === 'lens' || mixed.reveal === 'follow';
  return (
    <Section title="Mixed Reality" icon={<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}>
      <Select label="Reveal mode" value={mixed.reveal} options={REVEAL_OPTIONS} onChange={(reveal) => setMixed({ reveal })} />
      {mixed.reveal === 'lens' && <p className="-mt-0.5 mb-1 text-[11px] text-muted">Drag on the view to move the lens.</p>}
      {mixed.reveal === 'split' && (
        <div className="py-1">
          <Segmented
            label="Anatomy side"
            value={mixed.splitSide}
            onChange={(splitSide) => setMixed({ splitSide })}
            options={[
              { value: 'left', label: 'Your left' },
              { value: 'right', label: 'Your right' },
            ]}
          />
        </div>
      )}
      <Slider label="Real-me showing through" value={mixed.showThrough} min={0} max={1} onChange={(showThrough) => setMixed({ showThrough })} format={pct} disabled={mixed.reveal === 'anatomy' || mixed.reveal === 'camera'} />
      <Slider label="Edge feather" value={mixed.feather} min={0} max={1} onChange={(feather) => setMixed({ feather })} format={pct} disabled={mixed.reveal === 'full' || mixed.reveal === 'anatomy' || mixed.reveal === 'camera'} />
      <Slider label={mixed.reveal === 'follow' ? 'Reveal size' : 'Lens size'} value={mixed.lensSize} min={0.1} max={0.6} onChange={(lensSize) => setMixed({ lensSize })} format={pct} disabled={!usesLens} />
      <Slider label="Anatomy / video blend" value={mixed.blend} min={0} max={1} onChange={(blend) => setMixed({ blend })} format={pct} disabled={mixed.reveal === 'camera'} />
      <Select<BlendMode>
        label="Blend style"
        value={mixed.blendMode}
        onChange={(blendMode) => setMixed({ blendMode })}
        options={[
          { value: 'normal', label: 'Normal (occluding)' },
          { value: 'screen', label: 'Screen (soft glow)' },
          { value: 'additive', label: 'Additive (bright glow)' },
        ]}
      />
    </Section>
  );
}
