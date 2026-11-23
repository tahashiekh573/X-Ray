import type { Intersection, Object3D } from 'three';

function visibleChain(o: Object3D | null): boolean {
  for (let n: Object3D | null = o; n; n = n.parent) if (!n.visible) return false;
  return true;
}

/** First visible intersected anatomical structure (raycast results are sorted by distance). */
export function pickStructure(intersections: readonly Intersection[]): string | null {
  for (const hit of intersections) {
    const sid = hit.object.userData?.structureId as string | undefined;
    if (!sid || !visibleChain(hit.object)) continue;
    const mat = (hit.object as { material?: { uniforms?: Record<string, { value: number }> } }).material;
    const alpha = mat?.uniforms?.uLayerAlpha?.value ?? 1;
    if (alpha < 0.5) continue;
    return sid;
  }
  return null;
}
