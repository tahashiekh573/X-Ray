import { create } from 'zustand';
import type {
  Calibration,
  LayerId,
  LayerVisibility,
  LookSettings,
  MixedRealitySettings,
  PerformanceMode,
  PresetId,
} from '@/types/settings';
import { LAYER_PRESETS, presetById, type LayerPresetId } from './presets';

export const DEFAULT_LAYERS: LayerVisibility = {
  skull: true,
  brain: false,
  muscles: false,
  eyes: true,
  outline: false,
  hands: true,
  body: false,
};

export const DEFAULT_LOOK: LookSettings = {
  mode: 'xray',
  wireframe: false,
  brightness: 1,
  opacity: 0.9,
  tint: '#9fdcff',
};

export const DEFAULT_MIXED: MixedRealitySettings = {
  showThrough: 0.4,
  feather: 0.35,
  reveal: 'full',
  lensSize: 0.3,
  blend: 0.9,
  blendMode: 'normal',
  splitSide: 'left',
  lensCenter: { x: 0.5, y: 0.45 },
};

export const DEFAULT_CALIBRATION: Calibration = {
  scale: 1,
  width: 1,
  height: 1,
  depth: 1,
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
};

/** Starts slower devices in Low mode (few CPU cores or little memory); users can override. */
export function defaultPerformance(nav: Partial<Navigator> & { deviceMemory?: number } = globalThis.navigator ?? {}): PerformanceMode {
  const cores = nav.hardwareConcurrency ?? 8;
  const memory = nav.deviceMemory ?? 8;
  return cores <= 4 || memory <= 4 ? 'low' : 'balanced';
}

export interface SettingsState {
  layers: LayerVisibility;
  showLabels: boolean;
  look: LookSettings;
  mixed: MixedRealitySettings;
  calibration: Calibration;
  rememberCalibration: boolean;
  performance: PerformanceMode;
  showTrackingData: boolean;
  learningMode: boolean;
  selectedStructure: string | null;
  activePreset: PresetId | null;

  setLayer: (layer: LayerId, visible: boolean) => void;
  applyLayerPreset: (preset: LayerPresetId) => void;
  setShowLabels: (v: boolean) => void;
  setLook: (patch: Partial<LookSettings>) => void;
  resetLook: () => void;
  setMixed: (patch: Partial<MixedRealitySettings>) => void;
  setCalibration: (patch: Partial<Calibration>) => void;
  resetCalibration: () => void;
  setRememberCalibration: (v: boolean) => void;
  setPerformance: (mode: PerformanceMode) => void;
  setShowTrackingData: (v: boolean) => void;
  setLearningMode: (v: boolean) => void;
  selectStructure: (id: string | null) => void;
  applyPreset: (id: PresetId) => void;
}

export const useSettings = create<SettingsState>()((set) => ({
  layers: DEFAULT_LAYERS,
  showLabels: false,
  look: DEFAULT_LOOK,
  mixed: DEFAULT_MIXED,
  calibration: DEFAULT_CALIBRATION,
  rememberCalibration: false,
  performance: defaultPerformance(),
  showTrackingData: false,
  learningMode: false,
  selectedStructure: null,
  activePreset: null,

  setLayer: (layer, visible) =>
    set((s) => ({ layers: { ...s.layers, [layer]: visible }, activePreset: null })),
  applyLayerPreset: (preset) =>
    set({ layers: { ...LAYER_PRESETS[preset] }, activePreset: null }),
  setShowLabels: (showLabels) => set({ showLabels }),
  setLook: (patch) => set((s) => ({ look: { ...s.look, ...patch }, activePreset: null })),
  resetLook: () => set({ look: DEFAULT_LOOK }),
  setMixed: (patch) => set((s) => ({ mixed: { ...s.mixed, ...patch } })),
  setCalibration: (patch) => set((s) => ({ calibration: { ...s.calibration, ...patch } })),
  resetCalibration: () => set({ calibration: DEFAULT_CALIBRATION }),
  setRememberCalibration: (rememberCalibration) => set({ rememberCalibration }),
  setPerformance: (performance) => set({ performance }),
  setShowTrackingData: (showTrackingData) => set({ showTrackingData }),
  setLearningMode: (learningMode) =>
    set((s) => ({ learningMode, showLabels: learningMode ? true : s.showLabels })),
  selectStructure: (selectedStructure) => set({ selectedStructure }),
  applyPreset: (id) =>
    set((s) => {
      const p = presetById(id);
      return {
        activePreset: id,
        layers: { ...p.layers },
        look: { ...DEFAULT_LOOK, tint: s.look.tint, brightness: s.look.brightness, ...p.look },
        mixed: { ...s.mixed, ...p.mixed },
        showLabels: p.showLabels ?? false,
        learningMode: p.learningMode ?? false,
      };
    }),
}));
