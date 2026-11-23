import { useEffect } from 'react';
import { useSettings } from '@/stores/settingsStore';
import type { LayerId } from '@/types/settings';
import { useAssets } from './assetStore';
import { LAYER_ASSET } from './layerStyle';

/** Lazily loads the GLB for each enabled layer (skull first; others on demand). */
export function useAnatomyAssetLoading(): void {
  const layers = useSettings((s) => s.layers);
  useEffect(() => {
    const { ensure, ensureManifest } = useAssets.getState();
    void ensureManifest().then(() => {
      const order: LayerId[] = ['skull', 'eyes', 'brain', 'muscles', 'hands', 'body'];
      for (const layer of order) {
        const asset = LAYER_ASSET[layer];
        if (asset && layers[layer]) void ensure(asset);
      }
    });
  }, [layers]);
}
