import { useState, type ReactNode, type RefObject } from 'react';
import {
  Camera,
  CameraOff,
  Expand,
  Minimize,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  Hand,
  AlertTriangle,
  Loader2,
  Crop,
  SunDim,
  Layers,
} from 'lucide-react';
import { startCamera, stopCamera, switchCamera, isCameraSupported } from '@/features/camera/cameraService';
import { useAssets } from '@/features/anatomy/assetStore';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useSession } from '@/stores/sessionStore';
import { useSettings } from '@/stores/settingsStore';
import type { AssetId } from '@/types/anatomy';
import { Button, IconButton, StatusChip } from '@/components/ui/controls';
import { resetTracking, takeScreenshot } from './stageActions';

interface Props {
  fit: 'cover' | 'contain';
  onToggleFit: () => void;
  stageRef: RefObject<HTMLDivElement | null>;
  onRestoreRenderer: () => void;
}

export function StageHud({ fit, onToggleFit, stageRef, onRestoreRenderer }: Props) {
  const s = useSession();
  const mode = useSettings((st) => st.look.mode);
  const setLook = useSettings((st) => st.setLook);
  const handsLayer = useSettings((st) => st.layers.hands);
  const bodyLayer = useSettings((st) => st.layers.body);
  const manifestError = useAssets((st) => st.manifestError);
  const fullscreen = useFullscreen(stageRef);
  const [busy, setBusy] = useState(false);
  const active = s.cameraStatus === 'active';
  const failedAssets = (Object.entries(s.assets) as [AssetId, (typeof s.assets)[AssetId]][]).filter(
    ([, st]) => st.state === 'error',
  );
  const loadingAssets = Object.values(s.assets).some((st) => st.state === 'loading');

  const faceChip = !active ? (
    <StatusChip tone="off">Face: camera off</StatusChip>
  ) : s.faceTracker === 'loading' ? (
    <StatusChip tone="info">Loading face tracker…</StatusChip>
  ) : s.faceTracker === 'error' ? (
    <StatusChip tone="error">Face tracking failed</StatusChip>
  ) : s.live.facePresent ? (
    <StatusChip tone="ok">Face tracked</StatusChip>
  ) : (
    <StatusChip tone="warn">Searching for face…</StatusChip>
  );

  return (
    <>
      {/* Status bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-center gap-1.5 p-3" aria-live="polite">
        <StatusChip tone={active ? 'ok' : s.cameraStatus === 'error' ? 'error' : 'off'}>
          <Camera className="h-3 w-3" aria-hidden="true" />
          {active ? `Camera ${s.resolution ? `${s.resolution.width}×${s.resolution.height}` : 'on'}` : s.cameraStatus === 'requesting' ? 'Requesting camera…' : 'Camera off'}
        </StatusChip>
        {faceChip}
        {handsLayer && active && (
          <StatusChip tone={s.handTracker === 'error' ? 'error' : s.live.handsCount > 0 ? 'ok' : s.handTracker === 'loading' ? 'info' : 'off'}>
            <Hand className="h-3 w-3" aria-hidden="true" />
            {s.handTracker === 'loading' ? 'Loading hand tracker…' : s.handTracker === 'error' ? 'Hands unavailable' : `${s.live.handsCount} hand${s.live.handsCount === 1 ? '' : 's'}`}
          </StatusChip>
        )}
        {bodyLayer && active && (
          <StatusChip tone={s.poseTracker === 'error' ? 'error' : s.live.bodyPresent ? 'ok' : s.poseTracker === 'loading' ? 'info' : 'warn'}>
            {s.poseTracker === 'loading' ? 'Loading body tracker…' : s.poseTracker === 'error' ? 'Body unavailable' : s.live.bodyPresent ? 'Body tracked' : 'Step back: show shoulders'}
          </StatusChip>
        )}
        <StatusChip tone="info" title="Render frames per second (measured)">
          {s.live.renderFps} FPS{active ? ` · track ${s.live.trackingFps}` : ''}
        </StatusChip>
        {s.delegate && <StatusChip tone="off" title="MediaPipe inference backend">{s.delegate}</StatusChip>}
        <span className="ml-auto">
          <StatusChip tone="ok" title="Camera frames and landmarks are processed in this browser and never uploaded.">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" /> On-device
          </StatusChip>
        </span>
      </div>

      {/* Hints */}
      <div className="pointer-events-none absolute inset-x-0 top-12 z-20 flex flex-col items-center gap-2 px-3">
        {!active && s.cameraStatus !== 'error' && s.webgl === 'ok' && (
          <span className="rounded-full border border-ice-300/20 bg-void/80 px-3 py-1 text-[11px] text-ice-100">
            Model preview — start the camera to enable live tracking
          </span>
        )}
        {active && s.live.lowLight && (
          <span className="flex items-center gap-1.5 rounded-full border border-warn/30 bg-void/85 px-3 py-1 text-[11px] text-amber-200">
            <SunDim className="h-3.5 w-3.5" aria-hidden="true" /> Low light — tracking may be unstable. Face a light source.
          </span>
        )}
        {active && s.faceTracker === 'ready' && !s.live.facePresent && (
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-void/85 px-3 py-1 text-[11px] text-slate-200">
            <ScanFace className="h-3.5 w-3.5" aria-hidden="true" /> Face not found — center your face in view
          </span>
        )}
        {loadingAssets && (
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-void/85 px-3 py-1 text-[11px] text-slate-200">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Loading anatomy models…
          </span>
        )}
        {s.calibrationRun.phase === 'waiting' || s.calibrationRun.phase === 'collecting' ? (
          <div className="glass w-64 rounded-xl p-3 text-center text-[12px]" role="status">
            <div className="text-ice-100">{s.calibrationRun.message}</div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-ice-400 transition-[width]" style={{ width: `${Math.round(s.calibrationRun.progress * 100)}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      {/* Blocking states */}
      <div className="absolute inset-0 z-10 flex items-center justify-center p-4" style={{ pointerEvents: 'none' }}>
        {s.webgl === 'unsupported' && (
          <ErrorCard title="WebGL 2 is unavailable" body="The 3D renderer needs WebGL 2. Enable hardware acceleration in your browser settings or try a recent Chrome, Edge, Firefox or Safari. The camera image still works without it." />
        )}
        {s.webgl === 'lost' && (
          <ErrorCard title="The graphics context was lost" body="This can happen when the GPU is busy or a driver resets." action={<Button variant="primary" onClick={onRestoreRenderer}>Restore renderer</Button>} />
        )}
        {s.cameraStatus === 'error' && s.cameraError && (
          <ErrorCard
            title={s.cameraError.title}
            body={s.cameraError.message}
            action={s.cameraError.retryable ? <Button variant="primary" onClick={() => void startCamera()}><RefreshCw className="h-3.5 w-3.5" />Try again</Button> : undefined}
          />
        )}
        {active && s.faceTracker === 'error' && (
          <ErrorCard
            title="Face tracking could not start"
            body={`${s.trackerError ?? 'Unknown error'}. Check that the MediaPipe assets are installed (npm run setup:mediapipe).`}
            action={<Button variant="primary" onClick={() => s.set({ trackerRetry: s.trackerRetry + 1 })}><RefreshCw className="h-3.5 w-3.5" />Retry</Button>}
          />
        )}
        {!isCameraSupported() && (
          <ErrorCard title="Camera not supported" body="This browser does not expose camera access (navigator.mediaDevices). Use a recent desktop or mobile browser over HTTPS." />
        )}
      </div>

      {(failedAssets.length > 0 || manifestError) && (
        <div className="absolute bottom-16 right-3 z-30 flex max-w-xs flex-col gap-2">
          {failedAssets.map(([id, st]) => (
            <div key={id} className="glass rounded-xl p-3 text-[12px]" role="alert">
              <div className="flex items-center gap-1.5 font-semibold text-red-200">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> {id === 'hand' ? 'Hand model' : `${id[0].toUpperCase()}${id.slice(1)} model`} failed to load
              </div>
              <div className="mt-1 text-muted">{st.state === 'error' ? st.message : ''}</div>
              {id === 'hand' && <div className="mt-1 text-amber-200">Showing the simplified joint-and-bone fallback.</div>}
              <Button className="mt-2" onClick={() => void useAssets.getState().ensure(id)}>
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="absolute inset-x-0 bottom-0 z-30 flex flex-wrap items-center justify-center gap-2 p-3">
        {active ? (
          <Button variant="danger" onClick={stopCamera}>
            <CameraOff className="h-4 w-4" /> Stop camera
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={s.cameraStatus === 'requesting' || !isCameraSupported()}
            onClick={async () => {
              setBusy(true);
              await startCamera();
              setBusy(false);
            }}
          >
            {busy || s.cameraStatus === 'requesting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Start camera
          </Button>
        )}
        {s.devices.length > 1 && (
          <label className="sr-only" htmlFor="camera-select">Camera</label>
        )}
        {s.devices.length > 1 && (
          <select
            id="camera-select"
            value={s.deviceId ?? ''}
            onChange={(e) => void switchCamera(e.target.value)}
            className="max-w-[11rem] rounded-xl border border-white/10 bg-void/80 px-2 py-2 text-[12px] text-slate-100"
          >
            {s.devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-void/60 p-1 backdrop-blur">
          <IconButton label={mode === 'xray' ? 'Switch to solid mode (X)' : 'Switch to X-ray mode (X)'} onClick={() => setLook({ mode: mode === 'xray' ? 'solid' : 'xray' })} active={mode === 'solid'}>
            <Layers className="h-4 w-4" />
          </IconButton>
          <IconButton label="Take screenshot (S)" onClick={() => void takeScreenshot(stageRef.current)}>
            <Camera className="h-4 w-4" />
          </IconButton>
          <IconButton label="Reset tracking (R)" onClick={resetTracking} disabled={!active}>
            <RefreshCw className="h-4 w-4" />
          </IconButton>
          <IconButton label={fit === 'cover' ? 'Fit whole camera image' : 'Fill the viewport'} onClick={onToggleFit} active={fit === 'contain'}>
            <Crop className="h-4 w-4" />
          </IconButton>
          {fullscreen.supported && (
            <IconButton label={fullscreen.active ? 'Exit fullscreen (F)' : 'Fullscreen (F)'} onClick={() => void fullscreen.toggle()} active={fullscreen.active}>
              {fullscreen.active ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
            </IconButton>
          )}
        </div>
      </div>
    </>
  );
}

function ErrorCard({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div role="alert" className="glass pointer-events-auto max-w-sm rounded-2xl p-5 text-center">
      <AlertTriangle className="mx-auto h-6 w-6 text-warn" aria-hidden="true" />
      <h2 className="mt-2 text-[15px] font-semibold text-white">{title}</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-slate-300">{body}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}
