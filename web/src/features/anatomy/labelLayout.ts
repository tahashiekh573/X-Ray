export interface LabelPoint {
  id: string;
  /** anchor in CSS px */
  ax: number;
  ay: number;
}

export interface PlacedLabel extends LabelPoint {
  x: number;
  y: number;
  side: 'left' | 'right';
}

export interface LayoutOptions {
  centerX: number;
  offset: number;
  spacing: number;
  width: number;
  height: number;
  margin: number;
}

/**
 * Places label pills to the left/right of the head (by anchor side), offset horizontally from
 * their anchors, then resolves vertical overlaps per side. Pure function.
 */
export function layoutLabels(points: LabelPoint[], opts: LayoutOptions): PlacedLabel[] {
  const placed: PlacedLabel[] = points.map((p) => {
    const side = p.ax < opts.centerX ? 'left' : 'right';
    const x = side === 'left' ? p.ax - opts.offset : p.ax + opts.offset;
    return { ...p, side, x, y: p.ay };
  });
  for (const side of ['left', 'right'] as const) {
    const group = placed.filter((l) => l.side === side).sort((a, b) => a.y - b.y);
    for (let i = 1; i < group.length; i++) {
      const min = group[i - 1].y + opts.spacing;
      if (group[i].y < min) group[i].y = min;
    }
    // if pushed past the bottom, shift the stack up
    const overflow = group.length ? group[group.length - 1].y - (opts.height - opts.margin) : 0;
    if (overflow > 0) for (const l of group) l.y -= overflow;
  }
  for (const l of placed) {
    l.x = Math.min(opts.width - opts.margin, Math.max(opts.margin, l.x));
    l.y = Math.min(opts.height - opts.margin, Math.max(opts.margin, l.y));
  }
  return placed;
}
