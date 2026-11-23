import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Mesh,
} from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { frameState } from '@/features/tracking/frameState';
import { handLandmarksToCamera, solveHandPose, type HandPoseResult } from '@/features/tracking/handMath';
import { HAND_CONNECTIONS } from '@/features/tracking/landmarks';
import { OneEuroVector3 } from '@/features/tracking/smoothing';
import { CAMERA_FOV } from '@/features/rendering/constants';
import { RENDER_LAYER, sceneRegistry } from '@/features/rendering/sceneRegistry';
import { useSession } from '@/stores/sessionStore';
import { useSettings } from '@/stores/settingsStore';
import { expAlpha } from '@/utils/math';
import { useAssets } from './assetStore';
import { meshesOf } from './assetLoader';
import { handPresence, layerAlpha } from './rigUniforms';
import { pickStructure } from './picking';

/** `present` turns false as soon as a detection misses the hand; this only guards against stalls. */
const LOST_AFTER_MS = 1500;
const UP = new Vector3(0, 1, 0);

/** Extra segments that fill the palm for the occluder proxy. */
const PALM_FILL: ReadonlyArray<readonly [number, number]> = [[0, 9], [0, 13], [1, 5], [5, 17], [2, 5]];
const SEGMENTS = [...HAND_CONNECTIONS, ...PALM_FILL];

function segmentMatrix(a: Vector3, b: Vector3, radius: number, out: Matrix4): Matrix4 {
  const dir = new Vector3().subVectors(b, a);
  const len = Math.max(dir.length(), 1e-4);
  const q = new Quaternion().setFromUnitVectors(UP, dir.divideScalar(len));
  return out.compose(new Vector3().addVectors(a, b).multiplyScalar(0.5), q, new Vector3(radius, len, radius));
}

interface Props {
  slot: 0 | 1;
}

/**
 * One tracked hand. Renders the BodyParts3D hand skeleton (or a clearly labelled simplified
 * joint-and-bone fallback when that asset is unavailable) plus an invisible depth-only proxy of
 * the real hand so head anatomy behind a raised hand is occluded (depth-aware compositing).
 */
export function HandRig({ slot }: Props) {
  const manifest = useAssets((s) => s.manifest);
  const hands = useAssets((s) => s.hands);
  const assetFailed = useSession((s) => s.assets.hand.state === 'error');
  const prepared = hands?.[slot] ?? null;

  const filters = useMemo(() => Array.from({ length: 21 }, () => new OneEuroVector3(1.6, 0.04)), []);
  const points = useMemo(() => Array.from({ length: 21 }, () => new Vector3()), []);
  const smoothed = useMemo(() => Array.from({ length: 21 }, () => new Vector3()), []);
  const poseResult = useMemo<HandPoseResult>(() => ({ carpals: new Matrix4(), bones: new Map(), scale: 1 }), []);

  const boneMeshes = useMemo(() => {
    const map = new Map<string, Mesh>();
    if (prepared) {
      for (const m of meshesOf(prepared.root)) {
        m.matrixAutoUpdate = false;
        m.frustumCulled = false;
        map.set(m.name, m);
      }
    }
    return map;
  }, [prepared]);

  const occluder = useMemo(() => {
    const material = new MeshBasicMaterial({ colorWrite: false, depthWrite: true });
    const cylinders = new InstancedMesh(new CylinderGeometry(1, 1, 1, 10, 1), material, SEGMENTS.length);
    const spheres = new InstancedMesh(new SphereGeometry(1, 10, 8), material, 21);
    for (const m of [cylinders, spheres]) {
      m.frustumCulled = false;
      m.renderOrder = -10;
      m.layers.set(RENDER_LAYER.head);
    }
    return { cylinders, spheres };
  }, []);

  const fallback = useMemo(() => {
    const material = new MeshBasicMaterial({ color: '#fbbf24', transparent: true, opacity: 0.85, depthTest: false });
    const sticks = new InstancedMesh(new CylinderGeometry(1, 1, 1, 8, 1), material, HAND_CONNECTIONS.length);
    const joints = new InstancedMesh(new SphereGeometry(1, 12, 10), material, 21);
    for (const m of [sticks, joints]) {
      m.frustumCulled = false;
      m.layers.set(RENDER_LAYER.hands);
    }
    return { sticks, joints, material };
  }, []);

  useFrame((_, delta) => {
    const hand = frameState.hands[slot];
    const now = performance.now();
    const enabled = useSettings.getState().layers.hands;
    const cameraActive = useSession.getState().cameraStatus === 'active';
    const fresh = cameraActive && enabled && hand.present && now - hand.timestamp < LOST_AFTER_MS;
    const presence = handPresence[slot];
    presence.value += ((fresh ? 1 : 0) - presence.value) * expAlpha(delta, fresh ? 0.08 : 0.15);
    const visible = presence.value > 0.01 && layerAlpha.hands.value > 0.01;

    if (fresh && manifest) {
      handLandmarksToCamera(hand.landmarks, hand.world, frameState.videoWidth, frameState.videoHeight, CAMERA_FOV, points);
      const t = now / 1000;
      for (let i = 0; i < 21; i++) filters[i].filter(points[i], t, smoothed[i]);
      solveHandPose(smoothed, manifest.hand, slot === 0, poseResult);

      for (const [name, mesh] of boneMeshes) {
        const m = name === 'carpals' ? poseResult.carpals : poseResult.bones.get(name);
        if (m) mesh.matrix.copy(m);
        mesh.matrixWorldNeedsUpdate = true;
      }
      // occluder proxy: finger radius ~0.85 cm scaled with the hand, palm a bit thicker
      const r = 0.85 * poseResult.scale;
      const tmp = new Matrix4();
      SEGMENTS.forEach(([a, b], k) => {
        occluder.cylinders.setMatrixAt(k, segmentMatrix(smoothed[a], smoothed[b], k >= HAND_CONNECTIONS.length ? r * 1.6 : r, tmp));
      });
      smoothed.forEach((p, k) => occluder.spheres.setMatrixAt(k, tmp.makeScale(r, r, r).setPosition(p)));
      occluder.cylinders.instanceMatrix.needsUpdate = true;
      occluder.spheres.instanceMatrix.needsUpdate = true;

      if (!prepared) {
        const fr = 0.35 * poseResult.scale;
        HAND_CONNECTIONS.forEach(([a, b], k) => fallback.sticks.setMatrixAt(k, segmentMatrix(smoothed[a], smoothed[b], fr, tmp)));
        smoothed.forEach((p, k) => fallback.joints.setMatrixAt(k, tmp.makeScale(fr * 1.7, fr * 1.7, fr * 1.7).setPosition(p)));
        fallback.sticks.instanceMatrix.needsUpdate = true;
        fallback.joints.instanceMatrix.needsUpdate = true;
      }
      sceneRegistry.handAnchors[slot] = poseResult.carpals;
      sceneRegistry.handPoses[slot] = poseResult;
    }
    if (!visible) {
      sceneRegistry.handAnchors[slot] = null;
      sceneRegistry.handPoses[slot] = null;
    }

    if (prepared) prepared.root.visible = visible;
    occluder.cylinders.visible = occluder.spheres.visible = fresh;
    const showFallback = visible && !prepared && assetFailed;
    fallback.sticks.visible = fallback.joints.visible = showFallback;
    fallback.material.opacity = 0.85 * presence.value * layerAlpha.hands.value;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const sid = pickStructure(e.intersections);
    if (sid) {
      e.stopPropagation();
      useSettings.getState().selectStructure(sid);
    }
  };

  return (
    <group name={`hand_${slot}`}>
      {prepared && (
        <group onClick={onClick}>
          <primitive object={prepared.root} />
        </group>
      )}
      <primitive object={occluder.cylinders} />
      <primitive object={occluder.spheres} />
      <primitive object={fallback.sticks} />
      <primitive object={fallback.joints} />
    </group>
  );
}
