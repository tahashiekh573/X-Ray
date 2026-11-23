import { Vector3 } from 'three';
import { Crosshair, Info, RotateCcw, Wand2, Activity, Save } from 'lucide-react';
import { Button, Section, Slider, Toggle } from '@/components/ui/controls';
import { CALIBRATION_LIMITS } from '@/features/calibration/calibrationMath';
import { cancelAutoCalibration, startAutoCalibration } from '@/features/calibration/autoCalibration';
import { useAssets } from '@/features/anatomy/assetStore';
import { useSession } from '@/stores/sessionStore';
import { useSettings } from '@/stores/settingsStore';
import type { Calibration } from '@/types/settings';

const ROWS: { key: keyof Calibration; label: string; step: number; unit: string; group: 'size' | 'position' | 'rotation' }[] = [
  { key: 'scale', label: 'Overall size', step: 0.01, unit: '×', group: 'size' },
  { key: 'width', label: 'Width', step: 0.01, unit: '×', group: 'size' },
  { key: 'height', label: 'Height', step: 0.01, unit: '×', group: 'size' },
  { key: 'depth', label: 'Depth', step: 0.01, unit: '×', group: 'size' },
  { key: 'offsetX', label: 'Left / Right', step: 0.05, unit: 'cm', group: 'position' },
  { key: 'offsetY', label: 'Up / Down', step: 0.05, unit: 'cm', group: 'position' },
  { key: 'offsetZ', label: 'Forward / Backward', step: 0.05, unit: 'cm', group: 'position' },
  { key: 'pitch', label: 'Tilt (pitch)', step: 0.5, unit: '°', group: 'rotation' },
  { key: 'yaw', label: 'Turn (yaw)', step: 0.5, unit: '°', group: 'rotation' },
  { key: 'roll', label: 'Roll', step: 0.5, unit: '°', group: 'rotation' },
];

const fmt = (v: number, unit: string) => (unit === '×' ? `${v.toFixed(2)}×` : `${v > 0 ? '+' : ''}${v.toFixed(unit === '°' ? 1 : 2)} ${unit}`);

export function CalibrationPanel() {
  const calibration = useSettings((s) => s.calibration);
  const setCalibration = useSettings((s) => s.setCalibration);
  const resetCalibration = useSettings((s) => s.resetCalibration);
  const remember = useSettings((s) => s.rememberCalibration);
  const setRemember = useSettings((s) => s.setRememberCalibration);
  const showTrackingData = useSettings((s) => s.showTrackingData);
  const setShowTrackingData = useSettings((s) => s.setShowTrackingData);
  const run = useSession((s) => s.calibrationRun);
  const cameraActive = useSession((s) => s.cameraStatus === 'active');
  const facePresent = useSession((s) => s.live.facePresent);
  const manifest = useAssets((s) => s.manifest);
  const running = run.phase === 'waiting' || run.phase === 'collecting';

  return (
    <Section title="Fit to my head" icon={<Crosshair className="h-3.5 w-3.5" aria-hidden="true" />}>
      <div className="mb-2 grid grid-cols-2 gap-1.5">
        <Button
          variant="primary"
          disabled={!cameraActive || !manifest}
          onClick={() => (running ? cancelAutoCalibration() : manifest && startAutoCalibration(new Vector3(...manifest.headCentre)))}
          title={cameraActive ? 'Measure your face proportions and fit the model' : 'Start the camera first'}
        >
          <Wand2 className="h-3.5 w-3.5" /> {running ? 'Cancel' : 'Auto Calibration'}
        </Button>
        <Button onClick={resetCalibration}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset Fit
        </Button>
      </div>
      {run.phase !== 'idle' && (
        <p role="status" className={`mb-2 rounded-lg px-2 py-1.5 text-[11.5px] ${run.phase === 'failed' ? 'bg-danger/10 text-red-200' : run.phase === 'done' ? 'bg-ok/10 text-emerald-200' : 'bg-ice-400/10 text-ice-100'}`}>
          {run.message}
        </p>
      )}
      <details className="group mb-1 rounded-lg border border-white/5 px-2 py-1 text-[11.5px] text-muted">
        <summary className="cursor-pointer select-none text-slate-300">Calibration steps</summary>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4">
          <li>Start the camera and face it directly in even light.</li>
          <li>Press <em>Auto Calibration</em> and hold still for about a second.</li>
          <li>Fine-tune with the manual sliders below (open your mouth to check the jaw).</li>
          <li>Optionally remember the fit on this device.</li>
        </ol>
      </details>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">Manual calibration</div>
      {ROWS.map((row, i) => {
        const [min, max] = CALIBRATION_LIMITS[row.key];
        return (
          <div key={row.key}>
            {i > 0 && ROWS[i - 1].group !== row.group && <div className="my-1 border-t border-white/5" />}
            <Slider
              label={row.label}
              value={calibration[row.key]}
              min={min}
              max={max}
              step={row.step}
              onChange={(v) => setCalibration({ [row.key]: v })}
              format={(v) => fmt(v, row.unit)}
            />
          </div>
        );
      })}
      <div className="mt-1 border-t border-white/5 pt-1">
        <Toggle label="Remember fit on this device" checked={remember} onChange={setRemember} badge={<Save className="h-3.5 w-3.5 text-muted" aria-hidden="true" />} />
        <Toggle label="Show Tracking Data" checked={showTrackingData} onChange={setShowTrackingData} badge={<Activity className="h-3.5 w-3.5 text-muted" aria-hidden="true" />} />
      </div>
      <div className="mt-2 rounded-lg border border-white/5 bg-panel-2/60 p-2 text-[11.5px]">
        <div className="flex items-center justify-between">
          <span className="text-slate-300">Tracking confidence</span>
          <span className={facePresent ? 'text-emerald-300' : 'text-muted'}>{!cameraActive ? 'camera off' : facePresent ? 'face locked' : 'searching'}</span>
        </div>
        <p className="mt-1 text-muted">
          MediaPipe reports face presence but no per-frame face confidence score, so none is shown. Hand scores appear in the tracking data.
        </p>
      </div>
      <p className="mt-2 flex gap-1.5 rounded-lg border border-ice-300/15 bg-ice-400/5 p-2 text-[11.5px] leading-relaxed text-ice-100/90">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        The anatomy is a generic adult model approximately aligned with camera-based tracking. It does not show your actual anatomy, and a webcam cannot measure your skull.
      </p>
    </Section>
  );
}
