import type { RevealMode, BlendMode } from '@/types/settings';

export const REVEAL_INDEX: Record<RevealMode, number> = {
  full: 0,
  lens: 1,
  follow: 2,
  split: 3,
  anatomy: 4,
  camera: 5,
};

export const BLEND_INDEX: Record<BlendMode, number> = { normal: 0, screen: 1, additive: 2 };

export const compositeVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Final compositing: mirrored camera video + anatomy render target.
 * Display space p: origin top-left, x to the right (matches mirrored landmark coordinates).
 */
export const compositeFragmentShader = /* glsl */ `
  uniform sampler2D uVideo;
  uniform sampler2D uAnatomy;
  uniform float uHasVideo;
  uniform vec2 uResolution;
  uniform int uReveal;
  uniform vec2 uLensCenter;
  uniform float uLensRadius;
  uniform float uFeather;
  uniform vec4 uFace;        // cx, cy, rx, ry (display space, normalised)
  uniform float uFaceAngle;
  uniform float uFacePresence;
  uniform float uSplitSign;  // -1 anatomy on screen-left half of the face, +1 right
  uniform float uShowThrough;
  uniform float uStrength;
  uniform int uBlendMode;
  uniform float uTime;
  varying vec2 vUv;

  float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

  vec3 background(vec2 p) {
    // linear-space values: these encode to a near-black navy after sRGB output conversion
    float v = 1.0 - 0.6 * length((p - 0.5) * vec2(1.2, 1.0));
    return vec3(0.0016, 0.0030, 0.0055) * v * 2.0;
  }

  // Face frame: x across the face, y along the chin->forehead axis (pixels).
  vec2 faceLocal(vec2 px) {
    vec2 d = px - uFace.xy * uResolution;
    float ca = cos(uFaceAngle), sa = sin(uFaceAngle);
    return vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
  }

  float ellipseMask(vec2 q, float scale, float feather) {
    vec2 radii = max(uFace.zw * uResolution * scale, vec2(1.0));
    float e = length(q / radii);
    return (1.0 - smoothstep(1.0 - 0.75 * feather - 0.02, 1.0, e)) * uFacePresence;
  }

  float splitMask(vec2 q) {
    float w = max(uFace.z * uResolution.x, 8.0);
    float s = q.x * uSplitSign / w;
    float m = smoothstep(-0.02 - 0.5 * uFeather, 0.02 + 0.5 * uFeather, s);
    return mix(1.0, m, uFacePresence);
  }

  float lensMask(vec2 px) {
    float r = length(px - uLensCenter * uResolution);
    float R = uLensRadius * min(uResolution.x, uResolution.y);
    return 1.0 - smoothstep(R * (1.0 - 0.85 * uFeather) - 1.0, R, r);
  }

  /** x: where anatomy is revealed, y: where the real image gets the X-ray film treatment. */
  vec2 masks(vec2 p) {
    vec2 px = p * uResolution;
    vec2 q = faceLocal(px);
    float head = ellipseMask(q, 1.08, 0.55);
    if (uReveal == 0) return vec2(1.0, head);           // full head
    if (uReveal == 1) { float l = lensMask(px); return vec2(l, l); }
    if (uReveal == 2) { float e = ellipseMask(q, 0.5 + 2.0 * uLensRadius, uFeather); return vec2(e, e); }
    if (uReveal == 3) { float s = splitMask(q); return vec2(s, s * head); }
    if (uReveal == 4) return vec2(1.0, 0.0);           // anatomy only
    return vec2(0.0, 0.0);                             // camera only
  }

  void main() {
    vec2 p = vec2(vUv.x, 1.0 - vUv.y);
    vec3 video = uHasVideo > 0.5 ? texture2D(uVideo, vec2(1.0 - vUv.x, vUv.y)).rgb : background(p);
    vec2 mk = masks(p);
    float mask = mk.x;

    // Inside the film region the real image is pushed towards an "X-ray film" look.
    float l = luma(video);
    vec3 film = vec3(0.004, 0.008, 0.014) + vec3(0.45, 0.7, 1.0) * l * 0.3;
    vec3 base = uReveal == 4 ? background(p) : mix(video, mix(film, video, uShowThrough), mk.y);

    vec4 ana = texture2D(uAnatomy, vUv);
    float k = mask * uStrength;
    vec3 c = ana.rgb * k;
    float a = clamp(ana.a * k, 0.0, 1.0);
    vec3 outColor;
    if (uBlendMode == 1) outColor = 1.0 - (1.0 - base) * (1.0 - clamp(c, 0.0, 1.0));
    else if (uBlendMode == 2) outColor = base + c;
    else outColor = base * (1.0 - a) + c;

    gl_FragColor = vec4(outColor, 1.0);
    #include <colorspace_fragment>
  }
`;
