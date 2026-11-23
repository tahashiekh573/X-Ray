export type LayerId = 'skull' | 'brain' | 'muscles' | 'eyes' | 'outline' | 'hands' | 'body';

export type LayerVisibility = Record<LayerId, boolean>;

export type RenderMode = 'xray' | 'solid';

export type RevealMode = 'full' | 'lens' | 'follow' | 'split' | 'anatomy' | 'camera';

export type BlendMode = 'normal' | 'screen' | 'additive';

export type PerformanceMode = 'low' | 'balanced' | 'high';

export interface LookSettings {
  mode: RenderMode;
  wireframe: boolean;
  /** 0.2 .. 2 */
  brightness: number;
  /** 0 .. 1 */
  opacity: number;
  /** hex colour used to tint X-ray rendering */
  tint: string;
}

export interface MixedRealitySettings {
  /** 0 .. 1: how much of the real face remains visible inside the revealed region */
  showThrough: number;
  /** 0 .. 1: softness of reveal-mask edges */
  feather: number;
  reveal: RevealMode;
  /** 0 .. 1: lens radius / follow-face ellipse scale */
  lensSize: number;
  /** 0 .. 1: anatomy strength over the video */
  blend: number;
  blendMode: BlendMode;
  splitSide: 'left' | 'right';
  /** lens centre in normalised screen coordinates (0..1, origin top-left) */
  lensCenter: { x: number; y: number };
}

export interface Calibration {
  scale: number;
  width: number;
  height: number;
  depth: number;
  /** offsets in centimetres, head-local */
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  /** degrees */
  pitch: number;
  yaw: number;
  roll: number;
}

export type PresetId =
  | 'full-skull'
  | 'transparent-skull'
  | 'brain-explorer'
  | 'facial-muscles'
  | 'hand-skeleton'
  | 'full-body'
  | 'mixed-reality'
  | 'education';
