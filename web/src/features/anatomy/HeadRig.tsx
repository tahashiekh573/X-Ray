import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Euler, Group, Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { frameState } from '@/features/tracking/frameState';
import { OneEuroFilter, OneEuroVector3, QuaternionSmoother } from '@/features/tracking/smoothing';
import { calibrationMatrix } from '@/features/calibration/calibrationMath';
import { sceneRegistry } from '@/features/rendering/sceneRegistry';
import { useSession } from '@/stores/sessionStore';
import { useSettings } from '@/stores/settingsStore';
import type { LayerId } from '@/types/settings';
import { DEG, expAlpha } from '@/utils/math';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAssets } from './assetStore';
import { findNode } from './assetLoader';
import { headPresence, jawUniform, layerAlpha } from './rigUniforms';
import { HeadOutline } from './HeadOutline';
import { pickStructure } from './picking';

const LAYERS: LayerId[] = ['skull', 'brain', 'muscles', 'eyes', 'outline', 'hands', 'body'];
/** `present` turns false as soon as a detection finds no face; this only guards against stalls. */
const LOST_AFTER_MS = 1500;

/** Pose used when no camera is running: a clearly-labelled rotating model preview. */
function previewPose(t: number, still: boolean, out: Matrix4): Matrix4 {
  const yaw = still ? 0.45 : Math.sin(t * 0.45) * 0.75;
  const q = new Quaternion().setFromEuler(new Euler(0.08, yaw, 0, 'YXZ'));
  return out.compose(new Vector3(0, -3, -50), q, new Vector3(1, 1, 1));
}

export function HeadRig() {
  const manifest = useAssets((s) => s.manifest);
  const head = useAssets((s) => s.head);
  const cameraActive = useSession((s) => s.cameraStatus === 'active');
  const reducedMotion = useReducedMotion();
  const pose = useRef<Group>(null);
  const calib = useRef<Group>(null);

  const filters = useMemo(
    () => ({
      position: new OneEuroVector3(1.0, 0.06),
      rotation: new QuaternionSmoother(1.4, 0.55),
      scale: new OneEuroVector3(0.6, 0.0),
      jaw: new OneEuroFilter(3.0, 0.4),
      gaze: [new OneEuroFilter(2, 0.2), new OneEuroFilter(2, 0.2), new OneEuroFilter(2, 0.2), new OneEuroFilter(2, 0.2)],
    }),
    [],
  );
  const scratch = useMemo(
    () => ({
      m: new Matrix4(),
      p: new Vector3(),
      q: new Quaternion(),
      s: new Vector3(),
      sp: new Vector3(),
      sq: new Quaternion(),
      ss: new Vector3(),
      hinge: new Vector3(),
      jawRot: new Matrix4(),
      calibKey: null as unknown,
    }),
    [],
  );

  const jawPivots = useMemo(() => {
    const nodes: Object3D[] = [];
    for (const asset of Object.values(head)) {
      const n = asset && findNode(asset.root, 'jaw_pivot');
      if (n) nodes.push(n);
    }
    return nodes;
  }, [head]);

  const eyePivots = useMemo(() => {
    const eyes = head.eyes?.root;
    return {
      left: eyes ? findNode(eyes, 'eye_pivot_left') : null,
      right: eyes ? findNode(eyes, 'eye_pivot_right') : null,
    };
  }, [head]);

  useEffect(() => {
    if (manifest) scratch.hinge.fromArray(manifest.jaw.hinge);
  }, [manifest, scratch]);

  useEffect(() => {
    sceneRegistry.headSpace = calib.current;
    return () => {
      sceneRegistry.headSpace = null;
    };
  }, []);

  useFrame((state, delta) => {
    const g = pose.current;
    const c = calib.current;
    if (!g || !c) return;
    const settings = useSettings.getState();
    const face = frameState.face;
    const now = performance.now();
    const t = now / 1000;

    if (frameState.resetRequested) {
      filters.position.reset();
      filters.rotation.reset();
      filters.scale.reset();
      filters.jaw.reset();
      filters.gaze.forEach((f) => f.reset());
      frameState.resetRequested = false;
    }

    // --- head pose -------------------------------------------------------------------------
    let presenceTarget = 1;
    if (cameraActive) {
      const fresh = face.present && face.hasMatrix && now - face.lastSeen < LOST_AFTER_MS;
      presenceTarget = fresh ? 1 : 0;
      if (fresh) {
        scratch.m.fromArray(face.matrix).decompose(scratch.p, scratch.q, scratch.s);
        filters.position.filter(scratch.p, t, scratch.sp);
        filters.rotation.filter(scratch.q, t, scratch.sq);
        filters.scale.filter(scratch.s, t, scratch.ss);
        g.matrix.compose(scratch.sp, scratch.sq, scratch.ss);
      }
    } else {
      previewPose(state.clock.elapsedTime, reducedMotion, g.matrix);
    }
    g.matrixWorldNeedsUpdate = true;
    headPresence.value += (presenceTarget - headPresence.value) * expAlpha(delta, presenceTarget ? 0.12 : 0.2);

    // --- calibration (recomputed only when the settings object changes) --------------------
    if (manifest && scratch.calibKey !== settings.calibration) {
      scratch.calibKey = settings.calibration;
      calibrationMatrix(settings.calibration, new Vector3(...manifest.headCentre), c.matrix);
      c.matrixWorldNeedsUpdate = true;
    }

    // --- layer fades -----------------------------------------------------------------------
    for (const layer of LAYERS) {
      const target = settings.layers[layer] ? 1 : 0;
      const u = layerAlpha[layer];
      u.value += (target - u.value) * expAlpha(delta, 0.15);
      if (Math.abs(u.value - target) < 0.002) u.value = target;
    }
    for (const [id, asset] of Object.entries(head)) {
      if (asset) asset.root.visible = layerAlpha[id as LayerId].value > 0.003;
    }

    // --- articulated jaw -------------------------------------------------------------------
    if (manifest) {
      const raw = cameraActive ? (presenceTarget ? face.jawOpen : 0) : reducedMotion ? 0.2 : (Math.sin(state.clock.elapsedTime * 1.3) * 0.5 + 0.5) * 0.6;
      const amount = Math.max(0, filters.jaw.filter(raw, t));
      const angle = amount * manifest.jaw.maxOpenDeg * DEG;
      const glide = amount * amount * manifest.jaw.maxProtrusion; // condyle glides forward late in opening
      for (const pivot of jawPivots) {
        pivot.position.set(scratch.hinge.x, scratch.hinge.y, scratch.hinge.z + glide);
        pivot.rotation.set(angle, 0, 0);
      }
      scratch.jawRot.makeRotationX(angle);
      jawUniform.value
        .makeTranslation(scratch.hinge.x, scratch.hinge.y, scratch.hinge.z + glide)
        .multiply(scratch.jawRot)
        .multiply(scratch.m.makeTranslation(-scratch.hinge.x, -scratch.hinge.y, -scratch.hinge.z));
      sceneRegistry.jawMatrix.copy(jawUniform.value);
    }

    // --- eye gaze from blendshapes ---------------------------------------------------------
    const bs = face.blendshapes;
    const gaze = (name: string) => (cameraActive ? (bs.get(name) ?? 0) : 0);
    const yawL = filters.gaze[0].filter((gaze('eyeLookOutLeft') - gaze('eyeLookInLeft')) * 28 * DEG, t);
    const pitchL = filters.gaze[1].filter(-(gaze('eyeLookUpLeft') - gaze('eyeLookDownLeft')) * 20 * DEG, t);
    const yawR = filters.gaze[2].filter((gaze('eyeLookInRight') - gaze('eyeLookOutRight')) * 28 * DEG, t);
    const pitchR = filters.gaze[3].filter(-(gaze('eyeLookUpRight') - gaze('eyeLookDownRight')) * 20 * DEG, t);
    eyePivots.left?.rotation.set(pitchL, yawL, 0, 'YXZ');
    eyePivots.right?.rotation.set(pitchR, yawR, 0, 'YXZ');
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const sid = pickStructure(e.intersections);
    if (sid) {
      e.stopPropagation();
      useSettings.getState().selectStructure(sid);
    }
  };

  return (
    <group ref={pose} matrixAutoUpdate={false} name="head_pose">
      <group ref={calib} matrixAutoUpdate={false} name="head_space" onClick={onClick}>
        {Object.entries(head).map(([id, asset]) => (asset ? <primitive key={id} object={asset.root} /> : null))}
        <HeadOutline />
      </group>
    </group>
  );
}
