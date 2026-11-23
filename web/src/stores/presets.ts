import type {
  LayerVisibility,
  LookSettings,
  MixedRealitySettings,
  PresetId,
} from '@/types/settings';

export interface PresetDefinition {
  id: PresetId;
  name: string;
  description: string;
  layers: LayerVisibility;
  look?: Partial<LookSettings>;
  mixed?: Partial<MixedRealitySettings>;
  showLabels?: boolean;
  learningMode?: boolean;
}

const none: LayerVisibility = {
  skull: false,
  brain: false,
  muscles: false,
  eyes: false,
  outline: false,
  hands: false,
  body: false,
};

export const PRESETS: readonly PresetDefinition[] = [
  {
    id: 'full-skull',
    name: 'Full Skull',
    description: 'Opaque, lit skull with articulated jaw.',
    layers: { ...none, skull: true, eyes: true, hands: true },
    look: { mode: 'solid', opacity: 1, wireframe: false },
    mixed: { reveal: 'full', showThrough: 0.15 },
  },
  {
    id: 'transparent-skull',
    name: 'Transparent Skull',
    description: 'Glowing X-ray skull over your face.',
    layers: { ...none, skull: true, eyes: true, hands: true },
    look: { mode: 'xray', opacity: 0.9, wireframe: false },
    mixed: { reveal: 'follow', showThrough: 0.45 },
  },
  {
    id: 'brain-explorer',
    name: 'Brain Explorer',
    description: 'Brain inside a faint skull, with labels.',
    layers: { ...none, skull: true, brain: true },
    look: { mode: 'xray', opacity: 0.85 },
    mixed: { reveal: 'follow', showThrough: 0.25 },
    showLabels: true,
  },
  {
    id: 'facial-muscles',
    name: 'Facial Muscles',
    description: 'Schematic muscles of expression and chewing.',
    layers: { ...none, skull: true, muscles: true },
    look: { mode: 'solid', opacity: 0.85 },
    mixed: { reveal: 'full', showThrough: 0.35 },
    showLabels: true,
  },
  {
    id: 'hand-skeleton',
    name: 'Hand Skeleton',
    description: 'Wrist and finger bones on both hands.',
    layers: { ...none, hands: true },
    look: { mode: 'xray', opacity: 0.95 },
    mixed: { reveal: 'full', showThrough: 0.6 },
  },
  {
    id: 'full-body',
    name: 'Full Body',
    description: 'Whole skeleton: spine, ribs, pelvis, arms, legs.',
    layers: { ...none, skull: true, hands: true, body: true },
    look: { mode: 'xray', opacity: 0.95 },
    mixed: { reveal: 'full', showThrough: 0.5 },
  },
  {
    id: 'mixed-reality',
    name: 'Mixed Reality',
    description: 'Movable X-ray lens over the live camera.',
    layers: { ...none, skull: true, brain: true, eyes: true, hands: true },
    look: { mode: 'xray', opacity: 0.9 },
    mixed: { reveal: 'lens', showThrough: 0.3, lensSize: 0.32, feather: 0.4 },
  },
  {
    id: 'education',
    name: 'Education Mode',
    description: 'Labels, learning panel and click-to-explore.',
    layers: { ...none, skull: true, brain: true, eyes: true, outline: true },
    look: { mode: 'xray', opacity: 0.85 },
    mixed: { reveal: 'full', showThrough: 0.4 },
    showLabels: true,
    learningMode: true,
  },
];

export type LayerPresetId = 'skull' | 'brain' | 'muscles' | 'everything';

export const LAYER_PRESETS: Record<LayerPresetId, LayerVisibility> = {
  skull: { ...none, skull: true, eyes: true },
  brain: { ...none, skull: true, brain: true },
  muscles: { ...none, skull: true, muscles: true },
  everything: { skull: true, brain: true, muscles: true, eyes: true, outline: true, hands: true, body: true },
};

export const presetById = (id: PresetId): PresetDefinition => {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown preset ${id}`);
  return preset;
};
