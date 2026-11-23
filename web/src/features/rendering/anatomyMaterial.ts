import {
  AddEquation,
  Color,
  CustomBlending,
  DoubleSide,
  FrontSide,
  Matrix4,
  NormalBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  SrcAlphaFactor,
  type IUniform,
} from 'three';

/**
 * Uniforms shared by every anatomy material (one object, referenced by all materials), so
 * global look changes cost a single assignment instead of a scene traversal.
 */
export const sharedUniforms = {
  /** 0 = X-ray, 1 = solid; animated for smooth transitions */
  uSolid: { value: 0 } as IUniform<number>,
  uBrightness: { value: 1 } as IUniform<number>,
  uOpacity: { value: 0.9 } as IUniform<number>,
  /** X-ray tint colour and how strongly it replaces the natural layer colour */
  uTint: { value: new Color('#9fdcff') } as IUniform<Color>,
  uTintMix: { value: 0.55 } as IUniform<number>,
  uTime: { value: 0 } as IUniform<number>,
};

export interface AnatomyMaterialOptions {
  color: string;
  /** per-layer fade (0..1), shared by all materials of a layer */
  layerAlpha: IUniform<number>;
  /** tracking presence fade (0..1), shared by a rig (head or one hand) */
  presence: IUniform<number>;
  /** mandible transform for jaw-weighted (skinned) vertices, in the asset root frame */
  jawMatrix?: IUniform<Matrix4>;
  /** mesh carries COLOR_0 = (jaw weight, fibre coordinate, edge taper) */
  muscle?: boolean;
  doubleSided?: boolean;
  /** draw on top of other anatomy (hand bones, which sit in front of the head) */
  alwaysOnTop?: boolean;
}

const vertexShader = /* glsl */ `
  uniform mat4 uJawMatrix;
  uniform float uUseJaw;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vMuscle;
  void main() {
    vec3 pos = position;
    vec3 nrm = normal;
    vMuscle = vec3(0.0, 0.0, 1.0);
    #ifdef USE_COLOR
      float w = color.r * uUseJaw;
      vec3 jp = (uJawMatrix * vec4(position, 1.0)).xyz;
      vec3 jn = mat3(uJawMatrix) * normal;
      pos = mix(position, jp, w);
      nrm = normalize(mix(normal, jn, w));
      vMuscle = color.rgb;
    #endif
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vViewPos = mv.xyz;
    vNormalV = normalize(normalMatrix * nrm);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uTint;
  uniform float uTintMix;
  uniform float uSolid;
  uniform float uBrightness;
  uniform float uOpacity;
  uniform float uLayerAlpha;
  uniform float uPresence;
  uniform float uHighlight;
  uniform float uTime;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vMuscle;

  void main() {
    vec3 N = normalize(vNormalV);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(-vViewPos);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 2.4);

    float stripe = 1.0;
    float taper = 1.0;
    #ifdef USE_COLOR
      stripe = 0.78 + 0.22 * sin(vMuscle.g * 6.2831853 * 16.0);
      taper = smoothstep(0.0, 0.6, vMuscle.b);
    #endif

    // X-ray: Fresnel rim glow, faint core so internal structures read through.
    vec3 xBase = mix(uColor, uTint, uTintMix);
    vec3 xray = xBase * (0.10 + 1.55 * fres) * stripe;
    float xAlpha = clamp(0.08 + 0.92 * fres, 0.0, 1.0);

    // Solid: two-light Lambert + Blinn specular + subtle rim.
    vec3 L1 = normalize(vec3(0.35, 0.55, 0.75));
    vec3 L2 = normalize(vec3(-0.65, 0.15, 0.45));
    float diff = max(dot(N, L1), 0.0) * 0.85 + max(dot(N, L2), 0.0) * 0.3 + 0.22;
    float spec = pow(max(dot(N, normalize(L1 + V)), 0.0), 40.0) * 0.28;
    vec3 solid = uColor * diff * stripe + spec + uColor * fres * 0.18;

    vec3 col = mix(xray, solid, uSolid) * uBrightness;
    float alpha = mix(xAlpha, 1.0, uSolid) * uOpacity * taper;

    // Selection highlight: pulsing ice-blue rim.
    float pulse = 0.75 + 0.25 * sin(uTime * 4.0);
    col += uHighlight * vec3(0.35, 0.85, 1.0) * (0.25 + 1.2 * fres) * pulse;
    alpha = max(alpha, uHighlight * 0.55 * uOpacity);

    alpha *= uLayerAlpha * uPresence;
    gl_FragColor = vec4(col, alpha);
  }
`;

export function createAnatomyMaterial(opts: AnatomyMaterialOptions): ShaderMaterial {
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      ...sharedUniforms,
      uColor: { value: new Color(opts.color) },
      uLayerAlpha: opts.layerAlpha,
      uPresence: opts.presence,
      uHighlight: { value: 0 },
      uJawMatrix: opts.jawMatrix ?? { value: new Matrix4() },
      uUseJaw: { value: opts.jawMatrix ? 1 : 0 },
    },
    vertexColors: !!opts.muscle,
    transparent: true,
    side: opts.doubleSided ? DoubleSide : FrontSide,
  });
  material.userData.alwaysOnTop = !!opts.alwaysOnTop;
  if (opts.muscle) {
    // Muscle sheets lie directly on bone; bias them towards the camera to avoid z-fighting
    // where the generic skull sits very close to the skin surface.
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -8;
  }
  applyRenderMode(material, 'xray', false);
  return material;
}

/** Switches blending/depth state; colours are interpolated separately via uSolid. */
export function applyRenderMode(material: ShaderMaterial, mode: 'xray' | 'solid', wireframe: boolean): void {
  material.wireframe = wireframe;
  const onTop = material.userData.alwaysOnTop === true;
  if (mode === 'xray') {
    // Additive colour (glow accumulates) but standard "over" alpha (coverage for compositing).
    material.blending = CustomBlending;
    material.blendEquation = AddEquation;
    material.blendSrc = SrcAlphaFactor;
    material.blendDst = OneFactor;
    material.blendEquationAlpha = AddEquation;
    material.blendSrcAlpha = OneFactor;
    material.blendDstAlpha = OneMinusSrcAlphaFactor;
    material.depthWrite = false;
  } else {
    material.blending = NormalBlending;
    material.depthWrite = true;
  }
  material.depthTest = !onTop;
  material.needsUpdate = true;
}

export function setHighlight(material: ShaderMaterial, on: boolean): void {
  material.uniforms.uHighlight.value = on ? 1 : 0;
}
