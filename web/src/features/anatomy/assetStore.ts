import { create } from 'zustand';
import type { Group, ShaderMaterial } from 'three';
import type { AnatomyManifest, AssetId } from '@/types/anatomy';
import { useSession } from '@/stores/sessionStore';
import { createAnatomyMaterial } from '@/features/rendering/anatomyMaterial';
import { RENDER_LAYER } from '@/features/rendering/sceneRegistry';
import { loadAsset, loadManifest, meshesOf } from './assetLoader';
import { ASSET_LAYER, colorFor, structureIdFromNode } from './layerStyle';
import { bodyPresence, handPresence, headPresence, jawUniform, layerAlpha } from './rigUniforms';

export interface PreparedAsset {
  root: Group;
  materials: ShaderMaterial[];
  /** structure id -> materials, for highlighting */
  byStructure: Map<string, ShaderMaterial[]>;
}

interface AssetState {
  manifest: AnatomyManifest | null;
  manifestError: string | null;
  head: Partial<Record<Exclude<AssetId, 'hand' | 'body'>, PreparedAsset>>;
  /** pose-driven full-body skeleton */
  body: PreparedAsset | null;
  /** two independently-materialised copies of the hand skeleton (slot 0 left, 1 right) */
  hands: [PreparedAsset, PreparedAsset] | null;
  ensureManifest: () => Promise<AnatomyManifest | null>;
  ensure: (id: AssetId) => Promise<void>;
}

function prepare(root: Group, asset: AssetId, presence = headPresence): PreparedAsset {
  const layer = ASSET_LAYER[asset];
  const materials: ShaderMaterial[] = [];
  const byStructure = new Map<string, ShaderMaterial[]>();
  for (const mesh of meshesOf(root)) {
    const sid = structureIdFromNode(mesh.name || mesh.parent?.name || '');
    const muscle = !!mesh.geometry.getAttribute('color');
    const material = createAnatomyMaterial({
      color: colorFor(sid, layer),
      layerAlpha: layerAlpha[layer],
      presence,
      jawMatrix: muscle ? jawUniform : undefined,
      muscle,
      doubleSided: asset === 'muscles',
    });
    mesh.material = material;
    mesh.userData.structureId = sid;
    mesh.layers.set(asset === 'hand' ? RENDER_LAYER.hands : RENDER_LAYER.head);
    materials.push(material);
    byStructure.set(sid, [...(byStructure.get(sid) ?? []), material]);
  }
  return { root, materials, byStructure };
}

const inflight = new Map<AssetId, Promise<void>>();

export const useAssets = create<AssetState>()((set, get) => ({
  manifest: null,
  manifestError: null,
  head: {},
  body: null,
  hands: null,

  ensureManifest: async () => {
    if (get().manifest) return get().manifest;
    try {
      const manifest = await loadManifest();
      set({ manifest, manifestError: null });
      return manifest;
    } catch (err) {
      set({ manifestError: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  ensure: (id) => {
    const loaded = id === 'hand' ? get().hands : id === 'body' ? get().body : get().head[id];
    if (loaded) return Promise.resolve();
    const pending = inflight.get(id);
    if (pending) return pending;
    const session = useSession.getState();
    const job = (async () => {
      const manifest = await get().ensureManifest();
      if (!manifest) {
        session.setAsset(id, { state: 'error', message: get().manifestError ?? 'Manifest unavailable' });
        return;
      }
      session.setAsset(id, { state: 'loading' });
      try {
        const root = await loadAsset(id, manifest);
        if (id === 'hand') {
          const left = prepare(root.clone(true), 'hand', handPresence[0]);
          const right = prepare(root.clone(true), 'hand', handPresence[1]);
          set({ hands: [left, right] });
        } else if (id === 'body') {
          set({ body: prepare(root, 'body', bodyPresence) });
        } else {
          set((s) => ({ head: { ...s.head, [id]: prepare(root, id) } }));
        }
        session.setAsset(id, { state: 'ready' });
      } catch (err) {
        session.setAsset(id, { state: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    })().finally(() => inflight.delete(id));
    inflight.set(id, job);
    return job;
  },
}));
