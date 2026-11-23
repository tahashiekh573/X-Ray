import { useEffect, useRef, useState } from 'react';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { useSession } from '@/stores/sessionStore';
import { sceneRegistry } from '@/features/rendering/sceneRegistry';
import { frameState } from './frameState';
import { headAngles } from './faceMath';
import { FACE_OVAL, HAND_CONNECTIONS, POSE_CONNECTIONS } from './landmarks';

interface Metrics {
  yaw: number;
  pitch: number;
  roll: number;
  mouth: number;
  jaw: number;
  eyeL: number;
  eyeR: number;
  pos: [number, number, number];
  scale: number;
  faceMs: number;
  handMs: number;
  poseMs: number;
  latency: number | null;
  trackingFps: number;
  hands: { label: string; score: number }[];
}

/**
 * Optional debug view: raw landmarks (mirrored to match the display) and live metrics.
 * Only values the APIs actually provide are shown; MediaPipe's FaceLandmarker exposes no
 * per-face confidence score, which is stated rather than invented.
 */
export function TrackingDebugOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderFps = useSession((s) => s.live.renderFps);
  const [m, setM] = useState<Metrics | null>(null);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
      if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const px = (lm: Float32Array, i: number): [number, number] => [(1 - lm[i * 3]) * w, lm[i * 3 + 1] * h];
      const face = frameState.face;
      if (face.present) {
        ctx.fillStyle = 'rgba(52, 211, 153, 0.75)';
        for (let i = 0; i < 478; i++) {
          const [x, y] = px(face.landmarks, i);
          ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
        }
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        FACE_OVAL.forEach((id, k) => {
          const [x, y] = px(face.landmarks, id);
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
      }
      const pose = frameState.pose;
      if (pose.present) {
        ctx.strokeStyle = 'rgba(167, 139, 250, 0.95)';
        ctx.lineWidth = 2.5;
        for (const [a, b] of POSE_CONNECTIONS) {
          if (pose.visibility[a] < 0.5 || pose.visibility[b] < 0.5) continue;
          const [x1, y1] = px(pose.landmarks, a);
          const [x2, y2] = px(pose.landmarks, b);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }
      for (const hand of frameState.hands) {
        if (!hand.present) continue;
        ctx.strokeStyle = hand.handedness === 'Left' ? 'rgba(244, 114, 182, 0.95)' : 'rgba(96, 165, 250, 0.95)';
        ctx.lineWidth = 2;
        for (const [a, b] of HAND_CONNECTIONS) {
          const [x1, y1] = px(hand.landmarks, a);
          const [x2, y2] = px(hand.landmarks, b);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 21; i++) {
          const [x, y] = px(hand.landmarks, i);
          ctx.beginPath();
          ctx.arc(x, y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    raf = requestAnimationFrame(draw);

    const pos = new Vector3();
    const q = new Quaternion();
    const s = new Vector3();
    const mat = new Matrix4();
    const timer = window.setInterval(() => {
      const face = frameState.face;
      let angles = { yaw: 0, pitch: 0, roll: 0 };
      if (face.hasMatrix) {
        mat.fromArray(face.matrix).decompose(pos, q, s);
        angles = headAngles(q);
      }
      const head = sceneRegistry.headSpace;
      const modelPos: [number, number, number] = [0, 0, 0];
      let modelScale = 1;
      if (head) {
        head.matrixWorld.decompose(pos, q, s);
        modelPos[0] = pos.x;
        modelPos[1] = pos.y;
        modelPos[2] = pos.z;
        modelScale = Math.abs(s.y);
      }
      setM({
        ...angles,
        mouth: face.mouthRatio,
        jaw: face.jawOpen,
        eyeL: face.eyeOpenLeft,
        eyeR: face.eyeOpenRight,
        pos: modelPos,
        scale: modelScale,
        faceMs: frameState.stats.faceMs,
        handMs: frameState.stats.handMs,
        poseMs: frameState.stats.poseMs,
        latency: frameState.stats.latencyMs,
        trackingFps: frameState.stats.trackingFps,
        hands: frameState.hands.filter((h) => h.present).map((h) => ({ label: h.handedness, score: h.score })),
      });
    }, 200);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(timer);
    };
  }, []);

  const f = (v: number, d = 1) => v.toFixed(d);
  return (
    <>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-10 h-full w-full" aria-hidden="true" />
      {m && (
        <div className="glass pointer-events-none absolute right-3 top-14 z-20 w-60 rounded-xl p-3 font-mono text-[10.5px] leading-[1.55] text-slate-200" aria-live="off">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-ice-300">Tracking data</div>
          <Row k="Render FPS" v={String(renderFps)} />
          <Row k="Tracking FPS" v={f(m.trackingFps)} />
          <Row k="Face / hand / body" v={`${f(m.faceMs)} / ${f(m.handMs)} / ${f(m.poseMs)} ms`} />
          <Row k="Capture latency" v={m.latency === null ? 'not exposed' : `${f(m.latency)} ms`} />
          <Row k="Yaw / Pitch / Roll" v={`${f(m.yaw)}° ${f(m.pitch)}° ${f(m.roll)}°`} />
          <Row k="Mouth ratio" v={f(m.mouth, 3)} />
          <Row k="Jaw opening" v={`${f(m.jaw * 100, 0)} %`} />
          <Row k="Eye openness L/R" v={`${f(m.eyeL, 2)} / ${f(m.eyeR, 2)}`} />
          <Row k="Model pos (cm)" v={m.pos.map((p) => f(p)).join(', ')} />
          <Row k="Model scale" v={f(m.scale, 3)} />
          <Row k="Face confidence" v="not exposed by API" />
          {m.hands.map((h) => (
            <Row key={h.label} k={`${h.label} hand score`} v={f(h.score, 2)} />
          ))}
        </div>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted">{k}</span>
      <span className="text-right tabular-nums">{v}</span>
    </div>
  );
}
