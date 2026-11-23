import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineLoop } from 'three';
import { frameState } from '@/features/tracking/frameState';
import { FACE_OVAL } from '@/features/tracking/landmarks';
import { focalPx } from '@/features/tracking/faceMath';
import { CAMERA_FOV } from '@/features/rendering/constants';
import { headPresence, layerAlpha } from './rigUniforms';

/**
 * Live face silhouette from the tracked landmarks, placed in camera space. Landmark depth is
 * reconstructed from the head depth (facial transformation matrix) plus MediaPipe's relative z.
 */
export function FaceContour() {
  const { line, positions, material } = useMemo(() => {
    const positions = new Float32Array(FACE_OVAL.length * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const material = new LineBasicMaterial({ color: '#bae6fd', transparent: true, opacity: 0, depthWrite: false, depthTest: false });
    const line = new LineLoop(geometry, material);
    line.frustumCulled = false;
    return { line, positions, material };
  }, []);

  useFrame(() => {
    const face = frameState.face;
    const a = layerAlpha.outline.value * headPresence.value;
    line.visible = a > 0.003 && face.present && face.hasMatrix;
    material.opacity = 0.8 * a;
    if (!line.visible) return;
    const w = frameState.videoWidth;
    const h = frameState.videoHeight;
    const f = focalPx(CAMERA_FOV, h);
    const depth0 = -face.matrix[14];
    FACE_OVAL.forEach((id, k) => {
      const x = face.landmarks[id * 3];
      const y = face.landmarks[id * 3 + 1];
      const depth = depth0 + (face.landmarks[id * 3 + 2] * w * depth0) / f;
      positions[k * 3] = ((x - 0.5) * w * depth) / f;
      positions[k * 3 + 1] = (-(y - 0.5) * h * depth) / f;
      positions[k * 3 + 2] = -depth;
    });
    line.geometry.attributes.position.needsUpdate = true;
  });

  return <primitive object={line} />;
}
