export interface FrameBox {
  width: number;
  height: number;
  left: number;
  top: number;
}

/** Size of the video frame box that covers (or fits inside) the container. Pure. */
export function fitFrame(cw: number, ch: number, aspect: number, mode: 'cover' | 'contain'): FrameBox {
  const scale = mode === 'cover' ? Math.max(cw / aspect, ch) : Math.min(cw / aspect, ch);
  const height = scale;
  const width = scale * aspect;
  return { width, height, left: (cw - width) / 2, top: (ch - height) / 2 };
}
