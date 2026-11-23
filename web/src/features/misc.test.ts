import { describe, expect, it, vi } from 'vitest';
import { layoutLabels } from '@/features/anatomy/labelLayout';
import { structureIdFromNode } from '@/features/anatomy/layerStyle';
import { pickStructure } from '@/features/anatomy/picking';
import { AssetLoadError, loadManifest, resetAssetCache, validateManifest } from '@/features/anatomy/assetLoader';
import { nextDpr } from '@/features/rendering/adaptiveDpr';
import { fitFrame } from '@/features/rendering/fitFrame';
import { composeScreenshot, screenshotFilename, WATERMARK } from '@/features/rendering/screenshot';
import { meanLuma, landmarkBounds } from '@/features/tracking/lowLight';
import { BUNDLED_CONTENT, fetchContent, findStructure } from '@/services/contentService';
import manifest from '../../public/models/anatomy_manifest.json';
import { Mesh, Object3D } from 'three';

describe('label layout', () => {
  const opts = { centerX: 500, offset: 70, spacing: 24, width: 1000, height: 600, margin: 16 };
  it('places labels on the side of their anchor', () => {
    const [l, r] = layoutLabels([{ id: 'a', ax: 400, ay: 100 }, { id: 'b', ax: 600, ay: 100 }], opts);
    expect(l).toMatchObject({ side: 'left', x: 330 });
    expect(r).toMatchObject({ side: 'right', x: 670 });
  });
  it('resolves vertical overlaps on the same side', () => {
    const out = layoutLabels([{ id: 'a', ax: 400, ay: 100 }, { id: 'b', ax: 410, ay: 105 }, { id: 'c', ax: 420, ay: 110 }], opts);
    const ys = out.map((o) => o.y).sort((p, q) => p - q);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(24);
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(24);
  });
  it('keeps labels inside the viewport', () => {
    const [l] = layoutLabels([{ id: 'a', ax: 20, ay: 590 }], opts);
    expect(l.x).toBeGreaterThanOrEqual(16);
    expect(l.y).toBeLessThanOrEqual(584);
  });
});

describe('structure ids and picking', () => {
  it('maps GLB node names to educational structure ids', () => {
    expect(structureIdFromNode('eyeball__left')).toBe('eyeball');
    expect(structureIdFromNode('frontalis__right')).toBe('frontalis');
    expect(structureIdFromNode('metacarpal_3')).toBe('metacarpal_bones');
    expect(structureIdFromNode('distal_phalanx_1')).toBe('phalanges');
    expect(structureIdFromNode('carpals')).toBe('carpal_bones');
    expect(structureIdFromNode('mandible')).toBe('mandible');
  });

  it('skips hidden and faded structures when picking', () => {
    const hiddenParent = new Object3D();
    hiddenParent.visible = false;
    const hidden = new Mesh();
    hidden.userData.structureId = 'brainstem';
    hiddenParent.add(hidden);
    const faded = new Mesh();
    faded.userData.structureId = 'cerebellum';
    (faded as unknown as { material: unknown }).material = { uniforms: { uLayerAlpha: { value: 0.1 } } };
    const visible = new Mesh();
    visible.userData.structureId = 'mandible';
    const hits = [hidden, faded, visible].map((object, i) => ({ object, distance: i, point: null as never }));
    expect(pickStructure(hits as never)).toBe('mandible');
    expect(pickStructure([])).toBeNull();
  });
});

describe('asset manifest', () => {
  it('accepts the generated manifest', () => {
    expect(validateManifest(manifest).units).toBe('cm');
  });
  it('rejects malformed manifests', () => {
    expect(() => validateManifest({ units: 'mm' })).toThrow(AssetLoadError);
    expect(() => validateManifest(null)).toThrow(AssetLoadError);
  });
  it('reports HTTP failures and allows a retry', async () => {
    resetAssetCache();
    const fail = vi.fn(async () => new Response('nope', { status: 404 }));
    await expect(loadManifest(fail as never)).rejects.toThrow(/HTTP 404/);
    const ok = vi.fn(async () => new Response(JSON.stringify(manifest), { status: 200 }));
    await expect(loadManifest(ok as never)).resolves.toMatchObject({ units: 'cm' });
    resetAssetCache();
  });
  it('lists every anatomical layer and a jaw hinge', () => {
    const m = validateManifest(manifest);
    expect(Object.keys(m.assets).sort()).toEqual(['body', 'brain', 'eyes', 'hand', 'muscles', 'skull']);
    expect(m.body.segments).toHaveLength(10);
    expect(m.structures.mandible.asset).toBe('skull');
    expect(m.hand.bones).toHaveLength(19);
    expect(Math.abs(m.jaw.axis[0])).toBeGreaterThan(0.99);
  });
});

describe('screenshot', () => {
  it('builds a timestamped PNG filename', () => {
    expect(screenshotFilename(new Date(2026, 0, 2, 3, 4, 5))).toBe('xray-mirror-20260102-030405.png');
  });
  it('draws the frame, labels and the disclaimer watermark', () => {
    const calls: string[] = [];
    const ctx = new Proxy(
      { measureText: () => ({ width: 50 }) },
      {
        get: (target, prop) => {
          if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
          return (...args: unknown[]) => calls.push(`${String(prop)}:${typeof args[0] === 'string' ? args[0] : ''}`);
        },
        set: () => true,
      },
    );
    composeScreenshot(ctx as never, {} as CanvasImageSource, 1280, 720, 640, [{ text: 'Mandible', x: 100, y: 100, anchorX: 120, anchorY: 120 }]);
    expect(calls[0]).toMatch(/^drawImage/);
    expect(calls).toContain('fillText:Mandible');
    expect(calls).toContain(`fillText:${WATERMARK}`);
  });
});

describe('viewport helpers', () => {
  it('covers or contains the container with the video aspect', () => {
    const cover = fitFrame(1000, 1000, 16 / 9, 'cover');
    expect(cover.height).toBe(1000);
    expect(cover.width).toBeCloseTo(1777.8, 0);
    expect(cover.left).toBeLessThan(0);
    const contain = fitFrame(1000, 1000, 16 / 9, 'contain');
    expect(contain.width).toBe(1000);
    expect(contain.top).toBeGreaterThan(0);
  });
  it('adapts DPR to frame rate within bounds', () => {
    expect(nextDpr(1, 15, [0.6, 1])).toBeCloseTo(0.9);
    expect(nextDpr(0.6, 10, [0.6, 1])).toBe(0.6);
    expect(nextDpr(0.9, 60, [0.6, 1])).toBeCloseTo(0.95);
    expect(nextDpr(1, 40, [0.6, 1])).toBe(1);
  });
  it('measures luma for low-light detection', () => {
    expect(meanLuma(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]))).toBeCloseTo(0.5);
    expect(meanLuma([])).toBe(0);
    const lm = new Float32Array(478 * 3);
    lm.set([0.2, 0.3, 0], 10 * 3);
    lm.set([0.4, 0.7, 0], 152 * 3);
    expect(landmarkBounds(lm, [10, 152])).toEqual({ x: expect.closeTo(0.2), y: expect.closeTo(0.3), w: expect.closeTo(0.2), h: expect.closeTo(0.4) });
  });
});

describe('educational content service', () => {
  it('falls back to bundled content when the API is unreachable', async () => {
    const res = await fetchContent(vi.fn(async () => { throw new TypeError('network'); }) as never);
    expect(res.source).toBe('bundled');
    expect(res.content.structures.length).toBeGreaterThan(30);
  });
  it('uses the API when available', async () => {
    const fetcher = vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.endsWith('categories') ? { categories: BUNDLED_CONTENT.categories } : { disclaimer: 'd', structures: BUNDLED_CONTENT.structures.slice(0, 2) })),
    );
    const res = await fetchContent(fetcher as never);
    expect(res.source).toBe('api');
    expect(res.content.structures).toHaveLength(2);
    // privacy: only GETs without credentials or bodies
    for (const call of fetcher.mock.calls as unknown as [string, RequestInit][]) {
      expect(call[1]?.method ?? 'GET').toBe('GET');
      expect(call[1]?.body).toBeUndefined();
      expect(call[1]?.credentials).toBe('omit');
    }
  });
  it('finds structures by id', () => {
    expect(findStructure(BUNDLED_CONTENT, 'mandible')?.name).toBe('Mandible');
    expect(findStructure(BUNDLED_CONTENT, 'nope')).toBeNull();
  });
});
