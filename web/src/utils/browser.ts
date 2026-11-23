/** Returns true when a WebGL2 context can be created (required for the renderer). */
export function detectWebGL2(doc: Document = document): boolean {
  try {
    const canvas = doc.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    (gl.getExtension('WEBGL_lose_context') as { loseContext?: () => void } | null)?.loseContext?.();
    return true;
  } catch {
    return false;
  }
}

export function isSecureEnough(): boolean {
  return window.isSecureContext || ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
}

export const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
