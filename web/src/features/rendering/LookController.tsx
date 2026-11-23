import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ShaderMaterial } from 'three';
import { useAssets, type PreparedAsset } from '@/features/anatomy/assetStore';
import { useSettings } from '@/stores/settingsStore';
import { expAlpha } from '@/utils/math';
import { applyRenderMode, setHighlight, sharedUniforms } from './anatomyMaterial';

/** Pushes "Look" settings into the shared uniforms and per-material render state. */
export function LookController() {
  const head = useAssets((s) => s.head);
  const hands = useAssets((s) => s.hands);
  const body = useAssets((s) => s.body);
  const mode = useSettings((s) => s.look.mode);
  const wireframe = useSettings((s) => s.look.wireframe);
  const selected = useSettings((s) => s.selectedStructure);

  const prepared = useMemo<PreparedAsset[]>(
    () => [...Object.values(head).filter((a): a is PreparedAsset => !!a), ...(hands ?? []), ...(body ? [body] : [])],
    [head, hands, body],
  );

  useEffect(() => {
    for (const asset of prepared) for (const m of asset.materials) applyRenderMode(m, mode, wireframe);
  }, [prepared, mode, wireframe]);

  useEffect(() => {
    const on: ShaderMaterial[] = [];
    for (const asset of prepared) {
      for (const m of asset.materials) setHighlight(m, false);
      if (selected) on.push(...(asset.byStructure.get(selected) ?? []));
    }
    for (const m of on) setHighlight(m, true);
  }, [prepared, selected]);

  useFrame((state, delta) => {
    const look = useSettings.getState().look;
    const target = look.mode === 'solid' ? 1 : 0;
    const u = sharedUniforms;
    u.uSolid.value += (target - u.uSolid.value) * expAlpha(delta, 0.12);
    u.uBrightness.value = look.brightness;
    u.uOpacity.value = look.opacity;
    u.uTint.value.set(look.tint);
    u.uTime.value = state.clock.elapsedTime;
  });

  return null;
}
