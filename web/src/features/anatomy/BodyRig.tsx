import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Matrix4, Vector3, type Mesh } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { frameState } from '@/features/tracking/frameState';
import { poseLandmarksToCamera, solveBodyPose, type BodyPoseResult } from '@/features/tracking/bodyMath';
import { OneEuroVector3 } from '@/features/tracking/smoothing';
import { CAMERA_FOV } from '@/features/rendering/constants';
import { sceneRegistry } from '@/features/rendering/sceneRegistry';
import { useSession } from '@/stores/sessionStore';
import { useSettings } from '@/stores/settingsStore';
import { expAlpha } from '@/utils/math';
import { useAssets } from './assetStore';
import { meshesOf } from './assetLoader';
import { bodyPresence, layerAlpha } from './rigUniforms';
import { pickStructure } from './picking';

const LOST_AFTER_MS = 1500;

/**
 * Pose-driven full-body skeleton (BodyParts3D): rigid torso fitted to shoulders and hips,
 * limb segments between pose landmarks. Limbs whose landmarks are not visible (e.g. legs out
 * of frame) are hidden rather than guessed.
 */
export function BodyRig() {
  const manifest = useAssets((s) => s.manifest);
  const prepared = useAssets((s) => s.body);
  const filters = useMemo(() => Array.from({ length: 33 }, () => new OneEuroVector3(1.2, 0.03)), []);
  const points = useMemo(() => Array.from({ length: 33 }, () => new Vector3()), []);
  const smoothed = useMemo(() => Array.from({ length: 33 }, () => new Vector3()), []);
  const pose = useMemo<BodyPoseResult>(() => ({ torso: new Matrix4(), segments: new Map(), hidden: new Set(), scale: 1 }), []);

  const meshes = useMemo(() => {
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
  const torsoNodes = useMemo(() => new Set(manifest?.body.torsoNodes ?? []), [manifest]);

  useFrame((_, delta) => {
    if (!prepared || !manifest) return;
    const body = frameState.pose;
    const now = performance.now();
    const active = useSession.getState().cameraStatus === 'active' && useSettings.getState().layers.body;
    const fresh = active && body.present && now - body.timestamp < LOST_AFTER_MS;
    bodyPresence.value += ((fresh ? 1 : 0) - bodyPresence.value) * expAlpha(delta, fresh ? 0.1 : 0.2);
    const visible = bodyPresence.value > 0.01 && layerAlpha.body.value > 0.01;
    prepared.root.visible = visible;
    if (!fresh) {
      if (!visible) sceneRegistry.bodyPose = null;
      return;
    }
    poseLandmarksToCamera(body.landmarks, body.world, frameState.videoWidth, frameState.videoHeight, CAMERA_FOV, points);
    const t = now / 1000;
    for (let i = 0; i < 33; i++) filters[i].filter(points[i], t, smoothed[i]);
    const solved = solveBodyPose(smoothed, body.visibility, manifest.body, pose);
    for (const [name, mesh] of meshes) {
      const m = torsoNodes.has(name) ? solved.torso : solved.segments.get(name);
      if (!m) continue;
      mesh.matrix.copy(m);
      mesh.matrixWorldNeedsUpdate = true;
      mesh.visible = !solved.hidden.has(name);
    }
    sceneRegistry.bodyPose = solved;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const sid = pickStructure(e.intersections);
    if (sid) {
      e.stopPropagation();
      useSettings.getState().selectStructure(sid);
    }
  };

  if (!prepared) return null;
  return (
    <group name="body_skeleton" onClick={onClick}>
      <primitive object={prepared.root} />
    </group>
  );
}
