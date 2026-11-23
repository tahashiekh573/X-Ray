import { beforeEach, describe, expect, it } from 'vitest';
import { PRESETS } from './presets';
import { DEFAULT_CALIBRATION, DEFAULT_LOOK, useSettings } from './settingsStore';

const initial = useSettings.getState();
beforeEach(() => useSettings.setState(initial, true));

describe('layer visibility', () => {
  it('toggles individual layers independently', () => {
    useSettings.getState().setLayer('brain', true);
    useSettings.getState().setLayer('skull', false);
    const { layers } = useSettings.getState();
    expect(layers.brain).toBe(true);
    expect(layers.skull).toBe(false);
    expect(layers.eyes).toBe(initial.layers.eyes);
  });

  it('applies layer presets', () => {
    useSettings.getState().applyLayerPreset('brain');
    expect(useSettings.getState().layers).toMatchObject({ skull: true, brain: true, muscles: false });
    useSettings.getState().applyLayerPreset('everything');
    expect(Object.values(useSettings.getState().layers).every(Boolean)).toBe(true);
  });
});

describe('presets', () => {
  it('defines the seven required presets plus Full Body', () => {
    expect(PRESETS.map((p) => p.name)).toEqual([
      'Full Skull',
      'Transparent Skull',
      'Brain Explorer',
      'Facial Muscles',
      'Hand Skeleton',
      'Full Body',
      'Mixed Reality',
      'Education Mode',
    ]);
  });

  it.each(PRESETS.map((p) => [p.id, p] as const))('%s applies its configuration', (id, preset) => {
    useSettings.getState().applyPreset(id);
    const s = useSettings.getState();
    expect(s.activePreset).toBe(id);
    expect(s.layers).toEqual(preset.layers);
    if (preset.look?.mode) expect(s.look.mode).toBe(preset.look.mode);
    if (preset.mixed?.reveal) expect(s.mixed.reveal).toBe(preset.mixed.reveal);
    expect(s.learningMode).toBe(preset.learningMode ?? false);
  });

  it('keeps the user tint and brightness across presets', () => {
    useSettings.getState().setLook({ tint: '#ff0000', brightness: 1.5 });
    useSettings.getState().applyPreset('full-skull');
    expect(useSettings.getState().look).toMatchObject({ tint: '#ff0000', brightness: 1.5, mode: 'solid' });
  });

  it('manual edits clear the active preset', () => {
    useSettings.getState().applyPreset('brain-explorer');
    useSettings.getState().setLayer('hands', true);
    expect(useSettings.getState().activePreset).toBeNull();
  });
});

describe('look & calibration', () => {
  it('resets appearance', () => {
    useSettings.getState().setLook({ mode: 'solid', opacity: 0.2, wireframe: true });
    useSettings.getState().resetLook();
    expect(useSettings.getState().look).toEqual(DEFAULT_LOOK);
  });
  it('resets calibration', () => {
    useSettings.getState().setCalibration({ scale: 1.2, offsetY: 2 });
    expect(useSettings.getState().calibration.scale).toBe(1.2);
    useSettings.getState().resetCalibration();
    expect(useSettings.getState().calibration).toEqual(DEFAULT_CALIBRATION);
  });
  it('learning mode turns labels on', () => {
    useSettings.getState().setLearningMode(true);
    expect(useSettings.getState().showLabels).toBe(true);
  });
});

describe('default performance mode', () => {
  it('starts low-end devices in Low mode', async () => {
    const { defaultPerformance } = await import('./settingsStore');
    expect(defaultPerformance({ hardwareConcurrency: 4 })).toBe('low');
    expect(defaultPerformance({ hardwareConcurrency: 8, deviceMemory: 2 })).toBe('low');
    expect(defaultPerformance({ hardwareConcurrency: 12, deviceMemory: 8 })).toBe('balanced');
  });
});
