import { Group, Mesh, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AnatomyManifest, AssetId } from '@/types/anatomy';

const BASE = import.meta.env.BASE_URL;
export const MODELS_URL = `${BASE}models`;

export class AssetLoadError extends Error {
  constructor(
    message: string,
    readonly asset: AssetId | 'manifest',
  ) {
    super(message);
    this.name = 'AssetLoadError';
  }
}

export function validateManifest(data: unknown): AnatomyManifest {
  const m = data as Partial<AnatomyManifest> | null;
  if (
    !m ||
    m.units !== 'cm' ||
    typeof m.structures !== 'object' ||
    !m.jaw?.hinge ||
    !m.assets ||
    !m.hand?.bones?.length
  ) {
    throw new AssetLoadError('Anatomy manifest is missing or invalid', 'manifest');
  }
  return m as AnatomyManifest;
}

let manifestPromise: Promise<AnatomyManifest> | null = null;

export function loadManifest(fetcher: typeof fetch = fetch): Promise<AnatomyManifest> {
  manifestPromise ??= fetcher(`${MODELS_URL}/anatomy_manifest.json`)
    .then(async (res) => {
      if (!res.ok) throw new AssetLoadError(`Manifest request failed (HTTP ${res.status})`, 'manifest');
      return validateManifest(await res.json());
    })
    .catch((err) => {
      manifestPromise = null;
      throw err instanceof AssetLoadError ? err : new AssetLoadError(String(err), 'manifest');
    });
  return manifestPromise;
}

const loader = new GLTFLoader();
const cache = new Map<AssetId, Promise<Group>>();

/** Loads (once) and returns the scene root of an anatomy GLB. Failed loads can be retried. */
export function loadAsset(id: AssetId, manifest: AnatomyManifest): Promise<Group> {
  const existing = cache.get(id);
  if (existing) return existing;
  const file = manifest.assets[id]?.file;
  if (!file) return Promise.reject(new AssetLoadError(`No file for asset ${id}`, id));
  const promise = loader
    .loadAsync(`${MODELS_URL}/${file}`)
    .then((gltf) => {
      const root = gltf.scene;
      root.name = `${id}_asset`;
      return root;
    })
    .catch((err: unknown) => {
      cache.delete(id);
      const msg = err instanceof Error ? err.message : String(err);
      throw new AssetLoadError(`Could not load ${file}: ${msg}`, id);
    });
  cache.set(id, promise);
  return promise;
}

export function findNode(root: Object3D, name: string): Object3D | null {
  let found: Object3D | null = null;
  root.traverse((o) => {
    if (!found && o.name === name) found = o;
  });
  return found;
}

export function meshesOf(root: Object3D): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) out.push(o as Mesh);
  });
  return out;
}

/** Test hook. */
export function resetAssetCache(): void {
  cache.clear();
  manifestPromise = null;
}
