import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineLoop } from 'three';
import { useAssets } from './assetStore';
import { layerAlpha } from './rigUniforms';

/**
 * Head-space outline rings (sagittal, coronal and axial great circles of an ellipsoid around
 * the cranium). They rotate with the tracked head and complement the live face contour.
 */
function ring(axis: 'x' | 'y' | 'z', rx: number, ry: number, rz: number, cx: number, cy: number, cz: number) {
  const pts: number[] = [];
  const n = 96;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    if (axis === 'x') pts.push(cx, cy + ry * c, cz + rz * s);
    else if (axis === 'y') pts.push(cx + rx * c, cy, cz + rz * s);
    else pts.push(cx + rx * c, cy + ry * s, cz);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts, 3));
  return g;
}

export function HeadOutline() {
  const manifest = useAssets((s) => s.manifest);
  const { lines, material } = useMemo(() => {
    const [cx, cy, cz] = manifest?.headCentre ?? [0, 4, -5];
    const material = new LineBasicMaterial({ color: '#7dd3fc', transparent: true, opacity: 0, depthWrite: false });
    const lines = [
      new LineLoop(ring('x', 0, 11.5, 10.5, cx, cy - 1.5, cz), material),
      new LineLoop(ring('z', 8.2, 11.5, 0, cx, cy - 1.5, cz + 1.5), material),
      new LineLoop(ring('y', 8.0, 0, 10.0, cx, cy + 1.0, cz), material),
    ];
    return { lines, material };
  }, [manifest]);

  useFrame(() => {
    const a = layerAlpha.outline.value;
    material.opacity = 0.55 * a;
    for (const l of lines) l.visible = a > 0.003;
  });

  return (
    <group name="head_outline">
      {lines.map((l, i) => (
        <primitive key={i} object={l} />
      ))}
    </group>
  );
}
