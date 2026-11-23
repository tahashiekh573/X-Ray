import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LayersPanel, LookPanel, MixedRealityPanel } from './AnatomyControls';
import { CalibrationPanel } from './CalibrationPanel';
import { PresetsPanel } from './ExtrasPanels';
import { StructureInfoPanel } from '@/features/anatomy/StructureInfoPanel';
import { useSettings } from '@/stores/settingsStore';
import { useSession } from '@/stores/sessionStore';
import { useAssets } from '@/features/anatomy/assetStore';
import { BUNDLED_CONTENT } from '@/services/contentService';
import manifest from '../../../public/models/anatomy_manifest.json';
import type { AnatomyManifest } from '@/types/anatomy';

const settings0 = useSettings.getState();
const session0 = useSession.getState();
beforeEach(() => {
  useSettings.setState(settings0, true);
  useSession.setState(session0, true);
});

describe('LayersPanel', () => {
  it('toggles individual layers in the store', async () => {
    render(<LayersPanel />);
    const brain = screen.getByLabelText('Brain');
    expect(brain).not.toBeChecked();
    await userEvent.click(brain);
    expect(useSettings.getState().layers.brain).toBe(true);
    await userEvent.click(screen.getByLabelText('Show Labels'));
    expect(useSettings.getState().showLabels).toBe(true);
  });

  it('applies the Everything layer preset', async () => {
    render(<LayersPanel />);
    await userEvent.click(screen.getByRole('button', { name: 'Everything' }));
    expect(Object.values(useSettings.getState().layers).every(Boolean)).toBe(true);
    expect(screen.getByLabelText('Hand Bones')).toBeChecked();
  });

  it('marks the muscle layer as schematic and shows the hand fallback state', () => {
    useSession.getState().setAsset('muscles', { state: 'ready' });
    useSession.getState().setAsset('hand', { state: 'error', message: '404' });
    render(<LayersPanel />);
    expect(screen.getByText('schematic')).toBeInTheDocument();
    expect(screen.getByText('fallback')).toBeInTheDocument();
  });
});

describe('LookPanel', () => {
  it('switches render modes and resets appearance', async () => {
    render(<LookPanel />);
    await userEvent.click(screen.getByRole('radio', { name: 'Solid Mode' }));
    expect(useSettings.getState().look.mode).toBe('solid');
    await userEvent.click(screen.getByLabelText('Wireframe'));
    expect(useSettings.getState().look.wireframe).toBe(true);
    await userEvent.click(screen.getByRole('radio', { name: 'Amber' }));
    expect(useSettings.getState().look.tint).toBe('#fbbf24');
    await userEvent.click(screen.getByRole('button', { name: /reset appearance/i }));
    expect(useSettings.getState().look.mode).toBe('xray');
    expect(useSettings.getState().look.wireframe).toBe(false);
  });

  it('exposes accessible sliders with value text', () => {
    render(<LookPanel />);
    const opacity = screen.getByRole('slider', { name: 'Opacity' });
    expect(opacity).toHaveAttribute('aria-valuetext', '90%');
  });
});

describe('MixedRealityPanel', () => {
  it('offers all six reveal modes and enables lens size only when relevant', async () => {
    render(<MixedRealityPanel />);
    const select = screen.getByLabelText('Reveal mode');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Full Head X-Ray',
      'Circular X-Ray Lens',
      'Follow Face',
      'Split Face',
      'Anatomy Only',
      'Real Camera Only',
    ]);
    expect(screen.getByRole('slider', { name: 'Lens size' })).toBeDisabled();
    await userEvent.selectOptions(select, 'lens');
    expect(useSettings.getState().mixed.reveal).toBe('lens');
    expect(screen.getByRole('slider', { name: 'Lens size' })).toBeEnabled();
  });
});

describe('CalibrationPanel', () => {
  it('requires the camera for auto calibration and shows the disclaimer', () => {
    render(<CalibrationPanel />);
    expect(screen.getByRole('button', { name: /auto calibration/i })).toBeDisabled();
    expect(screen.getByText(/does not show your actual anatomy/i)).toBeInTheDocument();
    expect(screen.getByText(/no per-frame face confidence/i)).toBeInTheDocument();
  });

  it('manual sliders change the calibration and Reset Fit restores it', async () => {
    render(<CalibrationPanel />);
    // jsdom does not implement keyboard stepping for range inputs, so fire the change directly
    fireEvent.change(screen.getByRole('slider', { name: 'Up / Down' }), { target: { value: '1.5' } });
    expect(useSettings.getState().calibration.offsetY).toBeCloseTo(1.5);
    expect(screen.getByRole('slider', { name: 'Up / Down' })).toHaveAttribute('aria-valuetext', '+1.50 cm');
    await userEvent.click(screen.getByRole('button', { name: /reset fit/i }));
    expect(useSettings.getState().calibration.offsetY).toBe(0);
  });
});

describe('PresetsPanel', () => {
  it('applies a preset and marks it pressed', async () => {
    render(<PresetsPanel />);
    const button = screen.getByRole('button', { name: 'Brain Explorer' });
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(useSettings.getState().layers.brain).toBe(true);
  });
});

describe('StructureInfoPanel', () => {
  it('shows curated content and navigates related structures', async () => {
    useAssets.setState({ manifest: manifest as unknown as AnatomyManifest });
    useSession.setState({ content: BUNDLED_CONTENT });
    useSettings.setState({ selectedStructure: 'mandible' });
    render(<StructureInfoPanel />);
    expect(screen.getByRole('heading', { name: 'Mandible' })).toBeInTheDocument();
    expect(screen.getByText(/lower jawbone/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Masseter' }));
    expect(useSettings.getState().selectedStructure).toBe('masseter');
    expect(await screen.findByText(/schematic approximation/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /close structure details/i }));
    expect(useSettings.getState().selectedStructure).toBeNull();
  });
});
