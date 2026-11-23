import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bvh } from '@react-three/drei';
import type { Group } from 'three';
import { attachVideo } from '@/features/camera/cameraService';
import { HeadRig } from '@/features/anatomy/HeadRig';
import { HandRig } from '@/features/anatomy/HandRig';
import { BodyRig } from '@/features/anatomy/BodyRig';
import { FaceContour } from '@/features/anatomy/FaceContour';
import { LabelLayer } from '@/features/anatomy/LabelLayer';
import { StructureInfoPanel } from '@/features/anatomy/StructureInfoPanel';
import { TrackingDebugOverlay } from '@/features/tracking/TrackingDebugOverlay';
import { useSession } from '@/stores/sessionStore';
import { useSettings } from '@/stores/settingsStore';
import { AdaptiveQuality } from './AdaptiveQuality';
import { CompositePipeline } from './CompositePipeline';
import { LookController } from './LookController';
import { CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR } from './constants';
import { sceneRegistry } from './sceneRegistry';
import { StageHud } from './StageHud';
import { fitFrame } from './fitFrame';

function MirrorRoot() {
  const ref = useRef<Group>(null);
  useEffect(() => {
    sceneRegistry.mirrorRoot = ref.current;
    return () => {
      sceneRegistry.mirrorRoot = null;
    };
  }, []);
  // Everything is authored in unmirrored camera space; this group mirrors it like a mirror.
  return (
    <group ref={ref} scale={[-1, 1, 1]} name="mirror_root">
      <HeadRig />
      <FaceContour />
      <BodyRig />
      <HandRig slot={0} />
      <HandRig slot={1} />
    </group>
  );
}

export function MirrorStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [fit, setFit] = useState<'cover' | 'contain'>('cover');
  const [canvasKey, setCanvasKey] = useState(0);
  const resolution = useSession((s) => s.resolution);
  const webgl = useSession((s) => s.webgl);
  const showDebug = useSettings((s) => s.showTrackingData);
  const reveal = useSettings((s) => s.mixed.reveal);
  const [videoAspect, setVideoAspect] = useState(16 / 9);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (resolution) setVideoAspect(resolution.width / resolution.height);
  }, [resolution]);

  const videoRef = useCallback((el: HTMLVideoElement | null) => {
    attachVideo(el);
    if (el) {
      el.onloadedmetadata = () => {
        if (el.videoWidth && el.videoHeight) setVideoAspect(el.videoWidth / el.videoHeight);
      };
    }
  }, []);

  const frame = fitFrame(box.w, box.h, videoAspect, fit);

  // Drag to move the X-ray lens (a plain click still selects structures).
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const onPointerDown = (e: ReactPointerEvent) => {
    if (reveal !== 'lens') return;
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    const el = frameRef.current;
    if (!d || !el) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
    d.moved = true;
    const r = el.getBoundingClientRect();
    useSettings.getState().setMixed({
      lensCenter: {
        x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
        y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      },
    });
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden rounded-2xl bg-void" data-testid="mirror-stage">
      <div
        ref={frameRef}
        className="absolute touch-none"
        style={{ width: frame.width, height: frame.height, left: frame.left, top: frame.top }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        {/* Mirrored video underneath: also the fallback view when WebGL is unavailable. */}
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
          playsInline
          muted
          autoPlay
          aria-label="Your mirrored camera image"
        />
        {webgl === 'ok' && box.w > 0 && (
          <Canvas
            key={canvasKey}
            className="!absolute inset-0"
            gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
            camera={{ fov: CAMERA_FOV, near: CAMERA_NEAR, far: CAMERA_FAR, position: [0, 0, 0], rotation: [0, 0, 0] }}
            dpr={1}
            onCreated={({ gl, raycaster }) => {
              raycaster.layers.enableAll();
              gl.domElement.setAttribute('aria-label', 'Anatomy mirror rendering');
              gl.domElement.addEventListener('webglcontextlost', (e) => {
                e.preventDefault();
                useSession.getState().set({ webgl: 'lost' });
              });
            }}
          >
            <LookController />
            <AdaptiveQuality />
            <CompositePipeline />
            <Bvh firstHitOnly>
              <MirrorRoot />
            </Bvh>
          </Canvas>
        )}
        <LabelLayer />
        {showDebug && <TrackingDebugOverlay />}
      </div>
      <StructureInfoPanel />
      <StageHud
        fit={fit}
        onToggleFit={() => setFit((f) => (f === 'cover' ? 'contain' : 'cover'))}
        stageRef={containerRef}
        onRestoreRenderer={() => {
          useSession.getState().set({ webgl: 'ok' });
          setCanvasKey((k) => k + 1);
        }}
      />
    </div>
  );
}
