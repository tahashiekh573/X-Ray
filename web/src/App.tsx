import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Toasts } from '@/components/layout/Toasts';
import { LayersPanel, LookPanel, MixedRealityPanel } from '@/components/panels/AnatomyControls';
import { CalibrationPanel } from '@/components/panels/CalibrationPanel';
import { LearningPanel, PerformancePanel, PresetsPanel } from '@/components/panels/ExtrasPanels';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MirrorStage } from '@/features/rendering/MirrorStage';
import { resetTracking, takeScreenshot } from '@/features/rendering/stageActions';
import { startCamera, stopCamera, refreshDevices } from '@/features/camera/cameraService';
import { useTracking } from '@/features/tracking/useTracking';
import { useAnatomyAssetLoading } from '@/features/anatomy/useAnatomyAssetLoading';
import { clearCalibration, loadCalibration, saveCalibration } from '@/features/calibration/calibrationStorage';
import { useKeyboardShortcuts, type Shortcut } from '@/hooks/useKeyboardShortcuts';
import { fetchContent } from '@/services/contentService';
import { useSession } from '@/stores/sessionStore';
import { useSettings } from '@/stores/settingsStore';
import { detectWebGL2 } from '@/utils/browser';

function useAppInit() {
  useEffect(() => {
    useSession.getState().set({ webgl: detectWebGL2() ? 'ok' : 'unsupported' });
    void fetchContent().then(({ content, source }) => useSession.getState().set({ content, contentSource: source }));
    void refreshDevices();
    const stored = loadCalibration();
    if (stored) useSettings.setState({ calibration: stored, rememberCalibration: true });
  }, []);

  // Persist calibration only while the user has opted in.
  const calibration = useSettings((s) => s.calibration);
  const remember = useSettings((s) => s.rememberCalibration);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (remember) saveCalibration(calibration);
    else clearCalibration();
  }, [calibration, remember]);
}

export default function App() {
  useAppInit();
  useTracking();
  useAnatomyAssetLoading();
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { key: 'c', description: 'Start / stop camera', run: () => (useSession.getState().cameraStatus === 'active' ? stopCamera() : void startCamera()) },
      { key: 'x', description: 'Toggle X-ray / solid', run: () => { const s = useSettings.getState(); s.setLook({ mode: s.look.mode === 'xray' ? 'solid' : 'xray' }); } },
      { key: 's', description: 'Screenshot (PNG)', run: () => void takeScreenshot(stageRef.current?.querySelector('[data-testid="mirror-stage"]') as HTMLElement | null) },
      { key: 'f', description: 'Fullscreen', run: () => { const el = stageRef.current; if (document.fullscreenElement) void document.exitFullscreen(); else void el?.requestFullscreen?.().catch(() => undefined); } },
      { key: 'l', description: 'Toggle labels', run: () => { const s = useSettings.getState(); s.setShowLabels(!s.showLabels); } },
      { key: 'd', description: 'Toggle tracking data', run: () => { const s = useSettings.getState(); s.setShowTrackingData(!s.showTrackingData); } },
      { key: 'r', description: 'Reset tracking', run: resetTracking },
      { key: 'Escape', description: 'Close details / dialogs', run: () => { useSettings.getState().selectStructure(null); setHelpOpen(false); setLeftOpen(false); setRightOpen(false); } },
      { key: '?', description: 'Show shortcuts', run: () => setHelpOpen((o) => !o) },
    ],
    [],
  );
  useKeyboardShortcuts(shortcuts);

  const drawer = (open: boolean, side: 'left' | 'right') =>
    `fixed inset-y-0 ${side === 'left' ? 'left-0' : 'right-0'} z-40 w-[min(320px,88vw)] overflow-y-auto bg-void/95 p-3 pt-16 transition-transform duration-200 lg:static lg:z-auto lg:w-auto lg:translate-x-0 lg:bg-transparent lg:p-0 ${
      open ? 'translate-x-0' : side === 'left' ? '-translate-x-full' : 'translate-x-full'
    }`;

  return (
    <div className="flex h-full flex-col bg-void text-slate-100">
      <a href="#stage" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-ice-400 focus:px-3 focus:py-1 focus:text-void">
        Skip to mirror
      </a>
      <Header
        onShowShortcuts={() => setHelpOpen(true)}
        onToggleLeft={() => setLeftOpen((o) => !o)}
        onToggleRight={() => setRightOpen((o) => !o)}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
      />
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 px-3 pb-3 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <aside id="left-panel" aria-label="Anatomy controls" className={`${drawer(leftOpen, 'left')} scrollbar-thin flex flex-col gap-3`}>
          <button type="button" className="self-end rounded-lg p-1.5 text-muted lg:hidden" aria-label="Close anatomy controls" onClick={() => setLeftOpen(false)}>
            <X className="h-4 w-4" />
          </button>
          <LayersPanel />
          <LookPanel />
          <MixedRealityPanel />
        </aside>
        <section id="stage" ref={stageRef} aria-label="Live anatomy mirror" className="min-h-[60vh] lg:min-h-0">
          <ErrorBoundary>
            <MirrorStage />
          </ErrorBoundary>
        </section>
        <aside id="right-panel" aria-label="Calibration and options" className={`${drawer(rightOpen, 'right')} scrollbar-thin flex flex-col gap-3`}>
          <button type="button" className="self-end rounded-lg p-1.5 text-muted lg:hidden" aria-label="Close calibration controls" onClick={() => setRightOpen(false)}>
            <X className="h-4 w-4" />
          </button>
          <CalibrationPanel />
          <PresetsPanel />
          <LearningPanel />
          <PerformancePanel />
          <p className="px-1 pb-2 text-[10.5px] leading-relaxed text-muted">
            3D anatomy: BodyParts3D, © The Database Center for Life Science, CC BY 4.0. Facial muscle sheets are schematic. Tracking: Google MediaPipe (Apache-2.0). Not a medical device.
          </p>
        </aside>
        {(leftOpen || rightOpen) && (
          <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" aria-hidden="true" onClick={() => { setLeftOpen(false); setRightOpen(false); }} />
        )}
      </main>
      {helpOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setHelpOpen(false)}>
          <div className="glass w-full max-w-sm rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center">
              <h2 id="shortcuts-title" className="flex-1 text-[15px] font-semibold">Keyboard shortcuts</h2>
              <button type="button" aria-label="Close" autoFocus onClick={() => setHelpOpen(false)} className="rounded p-1 text-muted hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
              {shortcuts.map((s) => (
                <div key={s.key} className="contents">
                  <dt>
                    <kbd className="rounded border border-white/15 bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] uppercase">{s.key === 'Escape' ? 'Esc' : s.key}</kbd>
                  </dt>
                  <dd className="text-slate-300">{s.description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
      <Toasts />
    </div>
  );
}
