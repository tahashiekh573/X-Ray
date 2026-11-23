import type { AssetId } from '@/types/anatomy';
import type { LayerId } from '@/types/settings';

/** Natural (solid-mode) colours per structure; X-ray mode blends these towards the tint. */
export const STRUCTURE_COLORS: Record<string, string> = {
  upper_teeth: '#f6f0dc',
  lower_teeth: '#f6f0dc',
  left_cerebral_hemisphere: '#e7a3b4',
  right_cerebral_hemisphere: '#e7a3b4',
  cerebellum: '#d98ca4',
  brainstem: '#d6a07f',
  ventricular_system: '#7fd0ff',
  eyeball: '#f2f4f7',
  cornea: '#b8e3ff',
  iris: '#5a7a96',
  lens: '#e8f6ff',
  optic_nerve: '#f2d16b',
  extraocular_muscles: '#c9504f',
  tongue_muscles: '#c75a5f',
};

export const LAYER_COLORS: Record<LayerId, string> = {
  skull: '#e9e2cf',
  brain: '#e7a3b4',
  muscles: '#c8484f',
  eyes: '#f2f4f7',
  outline: '#7dd3fc',
  hands: '#e9e2cf',
  body: '#e9e2cf',
};

export const LAYER_ASSET: Partial<Record<LayerId, AssetId>> = {
  skull: 'skull',
  brain: 'brain',
  muscles: 'muscles',
  eyes: 'eyes',
  hands: 'hand',
  body: 'body',
};

export const ASSET_LAYER: Record<AssetId, LayerId> = {
  skull: 'skull',
  brain: 'brain',
  muscles: 'muscles',
  eyes: 'eyes',
  hand: 'hands',
  body: 'body',
};

export const colorFor = (structureId: string, layer: LayerId): string =>
  STRUCTURE_COLORS[structureId] ?? LAYER_COLORS[layer];

/**
 * GLB node name -> educational structure id: "eyeball__left" -> "eyeball",
 * hand bones are grouped ("metacarpal_3" -> "metacarpal_bones").
 */
export function structureIdFromNode(name: string): string {
  const base = name.split('__')[0];
  if (base === 'carpals') return 'carpal_bones';
  if (base.startsWith('metacarpal_')) return 'metacarpal_bones';
  if (base.includes('phalanx')) return 'phalanges';
  return base;
}
