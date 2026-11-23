import type { LayerId } from './settings';

export type AssetId = 'skull' | 'brain' | 'eyes' | 'muscles' | 'hand' | 'body';

export interface ManifestStructure {
  asset: AssetId;
  layer: LayerId;
  nodes: string[];
  anchor: [number, number, number];
  schematic: boolean;
  label: boolean;
  /** body skeleton anchors are local to the torso or to a limb segment */
  frame?: 'torso' | 'segment';
}

export interface HandBoneRig {
  name: string;
  length: number;
  /** [proximal, distal] MediaPipe landmark ids; -1 = model palm base point */
  landmarks: [number, number];
  parent: string | null;
  restXPalm: [number, number, number];
  basePalm: [number, number, number];
}

export interface BodySegmentRig {
  name: string;
  length: number;
  /** [proximal, distal] MediaPipe Pose landmark ids */
  landmarks: [number, number];
  parent: string | null;
  /** rest +X / +Z in the parent's native frame (torso frame for root segments) */
  restX: [number, number, number];
  restZ: [number, number, number];
}

export interface BodyRigData {
  shoulderWidth: number;
  torsoLength: number;
  torsoNodes: string[];
  segments: BodySegmentRig[];
}

export interface AnatomyManifest {
  version: number;
  units: 'cm';
  frame: string;
  attribution: string;
  fit: { scale: number; residual_cm: Record<string, number> };
  jaw: {
    hinge: [number, number, number];
    axis: [number, number, number];
    maxOpenDeg: number;
    maxProtrusion: number;
  };
  eyes: { left: [number, number, number]; right: [number, number, number] };
  headCentre: [number, number, number];
  assets: Record<AssetId, { file: string; triangles: number }>;
  structures: Record<string, ManifestStructure>;
  hand: { wristToMcp3: number; palmWidth: number; bones: HandBoneRig[] };
  body: BodyRigData;
}

export interface StructureContent {
  id: string;
  name: string;
  category: string;
  description: string;
  function: string;
  related: string[];
}

export interface CategoryContent {
  id: string;
  name: string;
  description: string;
}

export interface AnatomyContent {
  version: number;
  disclaimer: string;
  categories: CategoryContent[];
  structures: StructureContent[];
}

export type AssetStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'error'; message: string };
