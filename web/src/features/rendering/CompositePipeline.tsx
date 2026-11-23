import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  HalfFloatType,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  Vector2,
  UnsignedByteType,
  Vector4,
  VideoTexture,
  WebGLRenderTarget,
} from 'three';
import { getVideo } from '@/features/camera/cameraService';
import { frameState } from '@/features/tracking/frameState';
import { faceRegion } from '@/features/tracking/faceMath';
import { headPresence } from '@/features/anatomy/rigUniforms';
import { useSession } from '@/stores/sessionStore';
import { useSettings } from '@/stores/settingsStore';
import { expAlpha } from '@/utils/math';
import { BLEND_INDEX, REVEAL_INDEX, compositeFragmentShader, compositeVertexShader } from './compositeShader';
import { RENDER_LAYER, emitAfterRender, sceneRegistry } from './sceneRegistry';
import { servicePendingCapture } from './screenshot';

/**
 * Custom frame pipeline (takes over R3F's render via a positive useFrame priority):
 *   1. head anatomy + depth-only hand occluders  -> anatomy render target
 *   2. clear depth, hand skeletons              -> same target
 *   3. full-screen composite (video + anatomy + reveal mask) -> screen
 */
export function CompositePipeline() {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const performanceMode = useSettings((s) => s.performance);
  const cameraStatus = useSession((s) => s.cameraStatus);
  const high = performanceMode === 'high';

  // Half-float + MSAA only in High mode; 8-bit targets halve bandwidth on slower GPUs.
  const target = useMemo(
    () =>
      new WebGLRenderTarget(1, 1, {
        type: high ? HalfFloatType : UnsignedByteType,
        samples: high ? 4 : 0,
        depthBuffer: true,
      }),
    [high],
  );
  useEffect(() => () => target.dispose(), [target]);
  useEffect(() => {
    target.setSize(Math.max(1, Math.round(size.width * dpr)), Math.max(1, Math.round(size.height * dpr)));
  }, [target, size.width, size.height, dpr]);

  const videoTexture = useMemo(() => {
    const video = getVideo();
    if (!video || cameraStatus !== 'active') return null;
    const tex = new VideoTexture(video);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }, [cameraStatus]);
  useEffect(() => () => videoTexture?.dispose(), [videoTexture]);

  const composite = useMemo(() => {
    const material = new ShaderMaterial({
      vertexShader: compositeVertexShader,
      fragmentShader: compositeFragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uVideo: { value: null },
        uAnatomy: { value: null },
        uHasVideo: { value: 0 },
        uResolution: { value: new Vector2(1, 1) },
        uReveal: { value: 0 },
        uLensCenter: { value: new Vector2(0.5, 0.45) },
        uLensRadius: { value: 0.3 },
        uFeather: { value: 0.35 },
        uFace: { value: new Vector4(0.5, 0.45, 0.2, 0.3) },
        uFaceAngle: { value: 0 },
        uFacePresence: { value: 0 },
        uSplitSign: { value: -1 },
        uShowThrough: { value: 0.4 },
        uStrength: { value: 0.9 },
        uBlendMode: { value: 0 },
        uTime: { value: 0 },
      },
    });
    const mesh = new Mesh(new PlaneGeometry(2, 2), material);
    mesh.frustumCulled = false;
    const scene = new Scene();
    scene.add(mesh);
    return { scene, material, camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1) };
  }, []);
  useEffect(
    () => () => {
      composite.material.dispose();
      (composite.scene.children[0] as Mesh).geometry.dispose();
    },
    [composite],
  );

  const smoothedFace = useMemo(() => new Vector4(0.5, 0.45, 0.2, 0.3), []);

  useFrame((state, delta) => {
    const { scene, camera, clock } = state;
    const settings = useSettings.getState();
    const mixed = settings.mixed;
    const u = composite.material.uniforms;
    const hasVideo = !!videoTexture && (getVideo()?.readyState ?? 0) >= 2;

    // Face region for follow / split masks (display space, smoothed).
    const face = frameState.face;
    if (face.present) {
      const r = faceRegion(face.landmarks, frameState.videoWidth / frameState.videoHeight);
      const k = expAlpha(delta, 0.06);
      smoothedFace.x += (r.cx - smoothedFace.x) * k;
      smoothedFace.y += (r.cy - smoothedFace.y) * k;
      smoothedFace.z += (r.rx - smoothedFace.z) * k;
      smoothedFace.w += (r.ry - smoothedFace.w) * k;
      u.uFaceAngle.value += (r.angle - u.uFaceAngle.value) * k;
    }

    u.uVideo.value = videoTexture;
    u.uHasVideo.value = hasVideo ? 1 : 0;
    u.uAnatomy.value = target.texture;
    u.uResolution.value.set(target.width, target.height);
    u.uReveal.value = REVEAL_INDEX[mixed.reveal];
    u.uLensCenter.value.set(mixed.lensCenter.x, mixed.lensCenter.y);
    u.uLensRadius.value = mixed.lensSize;
    u.uFeather.value = mixed.feather;
    u.uFace.value.copy(smoothedFace);
    u.uFacePresence.value = hasVideo ? headPresence.value : 0;
    u.uSplitSign.value = mixed.splitSide === 'left' ? -1 : 1;
    u.uShowThrough.value = hasVideo ? mixed.showThrough : 1;
    u.uStrength.value = mixed.blend;
    u.uBlendMode.value = BLEND_INDEX[mixed.blendMode];
    u.uTime.value = clock.elapsedTime;

    const autoClear = gl.autoClear;
    gl.autoClear = false;
    gl.setRenderTarget(target);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, true, true);
    camera.layers.set(RENDER_LAYER.head);
    gl.render(scene, camera);
    gl.clearDepth();
    camera.layers.set(RENDER_LAYER.hands);
    gl.render(scene, camera);
    camera.layers.enableAll();

    gl.setRenderTarget(null);
    gl.clear(true, true, true);
    gl.render(composite.scene, composite.camera);
    gl.autoClear = autoClear;

    servicePendingCapture(gl.domElement);
    sceneRegistry.camera = camera;
    emitAfterRender({ camera, width: size.width, height: size.height, time: clock.elapsedTime });
  }, 1);

  return null;
}
