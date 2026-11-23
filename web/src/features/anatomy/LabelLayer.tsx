import { useEffect, useMemo, useRef } from 'react';
import { Vector3 } from 'three';
import { onAfterRender, sceneRegistry } from '@/features/rendering/sceneRegistry';
import type { LabelSnapshot } from '@/features/rendering/screenshot';
import { latestLabels } from './labelSnapshot';
import { useSession } from '@/stores/sessionStore';
import { useSettings } from '@/stores/settingsStore';
import { useAssets } from './assetStore';
import { layoutLabels, type LabelPoint } from './labelLayout';
import { headPresence, layerAlpha } from './rigUniforms';

const JAW_STRUCTURES = new Set(['mandible', 'lower_teeth', 'tongue_muscles']);
const HAND_STRUCTURES = ['carpal_bones', 'metacarpal_bones', 'phalanges'] as const;
const MAX_LABELS = 14;
/** Labelled only in learning mode (or when selected) to keep the default view uncluttered. */
const SECONDARY = new Set(['occipital_bone', 'sphenoid_bone', 'upper_teeth', 'lower_teeth', 'ventricular_system', 'extraocular_muscles', 'optic_nerve', 'tongue_muscles']);

interface Item {
  id: string;
  name: string;
  layer: string;
  anchor: Vector3;
  hand: boolean;
  body: boolean;
  frame?: 'torso' | 'segment';
  nodes: string[];
}

/**
 * Anatomical labels as a DOM overlay: React only re-renders when the *set* of labels changes;
 * positions are written directly to the DOM after every rendered frame.
 */
export function LabelLayer() {
  const manifest = useAssets((s) => s.manifest);
  const content = useSession((s) => s.content);
  const layers = useSettings((s) => s.layers);
  const showLabels = useSettings((s) => s.showLabels);
  const selected = useSettings((s) => s.selectedStructure);
  const selectStructure = useSettings((s) => s.selectStructure);
  const learningMode = useSettings((s) => s.learningMode);
  const pillRefs = useRef(new Map<string, HTMLButtonElement>());
  const lineRefs = useRef(new Map<string, SVGLineElement>());
  const dotRefs = useRef(new Map<string, SVGCircleElement>());

  const items = useMemo<Item[]>(() => {
    if (!manifest || !content || !showLabels) return [];
    const names = new Map(content.structures.map((s) => [s.id, s.name] as const));
    const out: Item[] = [];
    for (const [id, s] of Object.entries(manifest.structures)) {
      if (!s.label || !layers[s.layer] || !names.has(id)) continue;
      if (SECONDARY.has(id) && !learningMode && id !== selected) continue;
      const hand = (HAND_STRUCTURES as readonly string[]).includes(id);
      out.push({ id, name: names.get(id)!.replace(' (schematic)', ''), layer: s.layer, anchor: new Vector3(...s.anchor), hand, body: s.asset === 'body', frame: s.frame, nodes: s.nodes });
    }
    return out.slice(0, MAX_LABELS + HAND_STRUCTURES.length);
  }, [manifest, content, layers, showLabels, learningMode, selected]);

  useEffect(() => {
    if (items.length === 0) {
      latestLabels.items = [];
      return;
    }
    const world = new Vector3();
    const headCentre = new Vector3();
    const boneLength = new Map(manifest?.hand.bones.map((b) => [b.name, b.length]) ?? []);

    return onAfterRender(({ camera, width, height }) => {
      const head = sceneRegistry.headSpace;
      const mirror = sceneRegistry.mirrorRoot;
      const toScreen = (v: Vector3) => {
        v.project(camera);
        return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height, behind: v.z > 1 };
      };
      const headVisible = headPresence.value > 0.5;
      let cx = width / 2;
      if (head && manifest) {
        headCentre.fromArray(manifest.headCentre).applyMatrix4(head.matrixWorld);
        cx = toScreen(headCentre).x;
      }
      const handPose = sceneRegistry.handPoses[0] ?? sceneRegistry.handPoses[1];
      const points: LabelPoint[] = [];
      const visible = new Set<string>();
      for (const item of items) {
        if (item.body) {
          const bp = sceneRegistry.bodyPose;
          if (!bp || !mirror || layerAlpha.body.value < 0.5) continue;
          if (item.frame === 'torso') world.copy(item.anchor).applyMatrix4(bp.torso);
          else {
            const node = item.nodes.find((n) => !bp.hidden.has(n) && bp.segments.has(n));
            if (!node) continue;
            world.copy(item.anchor).applyMatrix4(bp.segments.get(node)!);
          }
          world.applyMatrix4(mirror.matrixWorld);
        } else if (item.hand) {
          if (!handPose || !mirror || layerAlpha.hands.value < 0.5) continue;
          if (item.id === 'carpal_bones') world.set(0, 0, 0).applyMatrix4(handPose.carpals);
          else {
            const bone = item.id === 'metacarpal_bones' ? 'metacarpal_3' : 'proximal_phalanx_3';
            const m = handPose.bones.get(bone);
            if (!m) continue;
            world.set(0, (boneLength.get(bone) ?? 4) * 0.5, 0).applyMatrix4(m);
          }
          world.applyMatrix4(mirror.matrixWorld);
        } else {
          if (!head || !headVisible) continue;
          if ((layerAlpha as Record<string, { value: number }>)[item.layer]?.value < 0.5) continue;
          world.copy(item.anchor);
          if (JAW_STRUCTURES.has(item.id)) world.applyMatrix4(sceneRegistry.jawMatrix);
          world.applyMatrix4(head.matrixWorld);
        }
        const p = toScreen(world);
        if (p.behind) continue;
        points.push({ id: item.id, ax: p.x, ay: p.y });
        visible.add(item.id);
      }
      const placed = layoutLabels(points, { centerX: cx, offset: 70, spacing: 24, width, height, margin: 16 });
      const snapshot: LabelSnapshot[] = [];
      for (const item of items) {
        const pill = pillRefs.current.get(item.id);
        const line = lineRefs.current.get(item.id);
        const dot = dotRefs.current.get(item.id);
        const l = placed.find((q) => q.id === item.id);
        const show = !!l && visible.has(item.id);
        if (pill) pill.style.opacity = show ? '1' : '0';
        if (pill) pill.style.pointerEvents = show ? 'auto' : 'none';
        if (line) line.style.opacity = show ? '1' : '0';
        if (dot) dot.style.opacity = show ? '1' : '0';
        if (!l || !show) continue;
        // whole-pixel positions: no sub-pixel shimmer, and labels are stable click targets
        l.x = Math.round(l.x);
        l.y = Math.round(l.y);
        l.ax = Math.round(l.ax);
        l.ay = Math.round(l.ay);
        if (pill) pill.style.transform = `translate(${l.x}px, ${l.y}px) translate(${l.side === 'left' ? '-100%' : '0'}, -50%)`;
        line?.setAttribute('x1', String(l.ax));
        line?.setAttribute('y1', String(l.ay));
        line?.setAttribute('x2', String(l.x));
        line?.setAttribute('y2', String(l.y));
        dot?.setAttribute('cx', String(l.ax));
        dot?.setAttribute('cy', String(l.ay));
        const pillWidth = pill?.offsetWidth ?? 80;
        snapshot.push({ text: item.name, x: l.side === 'left' ? l.x - pillWidth / 2 : l.x + pillWidth / 2, y: l.y, anchorX: l.ax, anchorY: l.ay });
      }
      latestLabels.items = snapshot;
    });
  }, [items, manifest]);

  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-label="Anatomical labels">
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        {items.map((item) => (
          <g key={item.id}>
            <line
              ref={(el) => {
                if (el) lineRefs.current.set(item.id, el);
                else lineRefs.current.delete(item.id);
              }}
              stroke="rgba(125,211,252,0.55)"
              strokeWidth={1}
              style={{ opacity: 0 }}
            />
            <circle
              ref={(el) => {
                if (el) dotRefs.current.set(item.id, el);
                else dotRefs.current.delete(item.id);
              }}
              r={2.5}
              fill="#7dd3fc"
              style={{ opacity: 0 }}
            />
          </g>
        ))}
      </svg>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          ref={(el) => {
            if (el) pillRefs.current.set(item.id, el);
            else pillRefs.current.delete(item.id);
          }}
          onClick={() => selectStructure(item.id)}
          className={`label-pill whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium shadow-lg transition-colors ${
            selected === item.id
              ? 'border-ice-300 bg-ice-400/25 text-white'
              : 'border-ice-300/25 bg-void/80 text-ice-50 hover:border-ice-300/60'
          }`}
          style={{ opacity: 0 }}
        >
          {item.name}
        </button>
      ))}
    </div>
  );
}
