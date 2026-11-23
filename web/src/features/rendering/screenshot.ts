/** Screenshot capture: frame grab from the WebGL canvas + labels + disclaimer watermark. */

export interface LabelSnapshot {
  text: string;
  /** label pill position in CSS pixels relative to the canvas */
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
}

let pending: ((blob: Blob | null) => void) | null = null;

/** Called by the render pipeline right after the final composite draw of a frame. */
export function servicePendingCapture(canvas: HTMLCanvasElement): void {
  if (!pending) return;
  const resolve = pending;
  pending = null;
  // toBlob snapshots the drawing buffer synchronously, so this works without preserveDrawingBuffer.
  canvas.toBlob(resolve, 'image/png');
}

/** Resolves with a PNG of the next rendered frame. */
export function requestFrameCapture(timeoutMs = 2000): Promise<Blob | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (pending) pending = null;
      resolve(null);
    }, timeoutMs);
    pending = (blob) => {
      clearTimeout(timer);
      resolve(blob);
    };
  });
}

export const WATERMARK = 'X-Ray Mirror Pro · generic anatomical overlay · not a medical image';

export function screenshotFilename(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `xray-mirror-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}.png`;
}

type Ctx = Pick<
  CanvasRenderingContext2D,
  | 'drawImage'
  | 'fillText'
  | 'measureText'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
  | 'fill'
  | 'arc'
  | 'roundRect'
  | 'fillRect'
  | 'save'
  | 'restore'
> & {
  font: string;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  textBaseline: CanvasTextBaseline;
};

/**
 * Draws the captured frame, then labels (scaled from CSS to image pixels) and the watermark.
 * Kept free of DOM lookups so it can be unit-tested with a mock context.
 */
export function composeScreenshot(
  ctx: Ctx,
  frame: CanvasImageSource,
  width: number,
  height: number,
  cssWidth: number,
  labels: LabelSnapshot[],
): void {
  ctx.drawImage(frame, 0, 0, width, height);
  const s = width / Math.max(1, cssWidth);
  ctx.save();
  ctx.font = `${Math.round(12 * s)}px Inter, Segoe UI, sans-serif`;
  ctx.textBaseline = 'middle';
  for (const l of labels) {
    const x = l.x * s;
    const y = l.y * s;
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.7)';
    ctx.lineWidth = Math.max(1, s);
    ctx.beginPath();
    ctx.moveTo(l.anchorX * s, l.anchorY * s);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = '#7dd3fc';
    ctx.beginPath();
    ctx.arc(l.anchorX * s, l.anchorY * s, 2.5 * s, 0, Math.PI * 2);
    ctx.fill();
    const tw = ctx.measureText(l.text).width;
    const padX = 8 * s;
    const h = 20 * s;
    ctx.fillStyle = 'rgba(8, 12, 18, 0.82)';
    ctx.beginPath();
    ctx.roundRect(x - tw / 2 - padX, y - h / 2, tw + padX * 2, h, 10 * s);
    ctx.fill();
    ctx.fillStyle = '#e6f6ff';
    ctx.fillText(l.text, x - tw / 2, y);
  }
  ctx.font = `${Math.round(11 * s)}px Inter, Segoe UI, sans-serif`;
  const wm = ctx.measureText(WATERMARK).width;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(width - wm - 24 * s, height - 26 * s, wm + 16 * s, 20 * s);
  ctx.fillStyle = 'rgba(230, 246, 255, 0.9)';
  ctx.fillText(WATERMARK, width - wm - 16 * s, height - 16 * s);
  ctx.restore();
}

export async function captureScreenshot(canvas: HTMLCanvasElement, labels: LabelSnapshot[]): Promise<Blob> {
  const frame = await requestFrameCapture();
  if (!frame) throw new Error('The renderer did not produce a frame (is the tab visible?)');
  const bitmap = await createImageBitmap(frame);
  const out = document.createElement('canvas');
  out.width = bitmap.width;
  out.height = bitmap.height;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  composeScreenshot(ctx, bitmap, out.width, out.height, canvas.clientWidth, labels);
  bitmap.close();
  return new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
