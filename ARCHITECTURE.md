# Architecture

X-Ray Mirror Pro is a browser application. All camera processing, tracking and rendering run on
the user's device. A small FastAPI backend serves educational content and static files, and never
receives camera data.

```
┌──────────────────────────── Browser (React + TypeScript) ────────────────────────────┐
│                                                                                      │
│  getUserMedia ─► <video> ─┬─► TrackingLoop (requestVideoFrameCallback, camera rate)   │
│  (CameraController)       │      ├─ MediaPipe FaceLandmarker  (WASM/GPU, self-hosted) │
│                           │      └─ MediaPipe HandLandmarker                          │
│                           │             │ writes                                      │
│                           │             ▼                                             │
│                           │      frameState (plain mutable object, never React state) │
│                           │             │ read every display frame                    │
│                           │             ▼                                             │
│                           │      R3F scene (mirror root, scale x = -1)                │
│                           │        ├─ HeadRig: matrix ─► One-Euro smoothing ─►        │
│                           │        │   calibration ─► skull / brain / eyes / muscles  │
│                           │        │   jaw hinge + condylar glide, eye gaze           │
│                           │        ├─ HandRig ×2: landmarks ─► camera space ─►        │
│                           │        │   per-bone matrices; depth-only hand occluder    │
│                           │        └─ FaceContour (live landmarks)                    │
│                           │             │                                             │
│                           └──► VideoTexture                                          │
│                                         ▼                                             │
│  CompositePipeline: [head + occluders] ─► clear depth ─► [hands] ─► render target     │
│                     composite shader: video + anatomy + reveal masks + X-ray film     │
│                                         ▼                                             │
│  DOM overlays: labels (projected anchors), debug overlay, HUD, info card              │
└──────────────────────────────────────────────────────────────────────────────────────┘
                   │ same-origin GET only (content, models, WASM)
┌──────────────────▼──────────── FastAPI backend ──────────────────────────────────────┐
│ main.py ─► middlewares (privacy guard, security headers/CSP, access log)              │
│        ─► routers (/api/v1/health, /config, /anatomy/*) ─► services ─► repositories   │
│        ─► static SPA (web/dist)                                                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## Key decisions

### Coordinate systems: one virtual camera
* MediaPipe's `facialTransformationMatrixes` map the **canonical face model** (cm, +x
  subject-left, +y up, +z towards the camera) into a camera space that assumes a **63° vertical
  field of view**. The renderer uses the same FOV (`CAMERA_FOV`). The projected canonical face
  therefore lands on the detected landmarks whatever the physical webcam's FOV is. The Playwright
  test `face.spec.ts` checks this with real inference: sweeping the FOV from 50° to 76°, the
  reprojection error is lowest at 61–65° (measured: 63°, 7.4 px mean at 1280×720).
* Every anatomy asset is authored **in the canonical face frame**. The build pipeline fits the
  BodyParts3D skull into it (eye centres, nasion and menton correspondences, then soft-tissue
  depth refinement), so the brain, eyes and muscles share the skull's coordinates automatically.
* Hands use the same virtual camera. Depth is recovered with a pinhole model from the metric
  palm size (world landmarks) and its image size: `Z = f · L_world / L_image`.
* Mirroring is a single `scale.x = -1` group plus mirrored video UVs. Three.js flips face winding
  for negative-determinant transforms, so culling and raycasting stay correct, and an anatomical
  left structure appears over the user's left side as in a real mirror.

### Tracking/render separation
Detection runs once per new camera frame (`requestVideoFrameCallback`), throttled by the
performance mode (`SCHEDULE`). Rendering runs at display rate and smooths whatever tracking data
is newest:

* position: One-Euro filter;
* rotation: speed-adaptive quaternion slerp;
* jaw and gaze: One-Euro filters.

React state is updated at most 4 Hz, for status chips only.

### Jaw
The mandible and lower teeth hang under a `jaw_pivot` node placed at the condyles (found
geometrically in the build). The opening ratio is the inner-lip gap divided by the inner-mouth
width. It passes through a dead zone, an ease-out mapping and a One-Euro filter, then drives a
rotation limited to 28°, plus a small forward condylar glide. Muscle sheets that span the joint
(masseter, temporalis, lower orbicularis oris) are skinned in the vertex shader with per-vertex
jaw weights stored in `COLOR_0.r`.

### Rendering
One `ShaderMaterial` covers every mode:

* **X-ray:** a Fresnel rim and a faint core, with additive colour and "over" alpha, so internal
  structures read through and the render target holds a coverage alpha.
* **Solid:** two-light Lambert with Blinn specular.
* **Wireframe.**

`uSolid` blends smoothly between X-ray and solid. Global look uniforms are shared objects, so a
slider change is one assignment.

The composite shader produces two masks: *anatomy reveal* (full / lens / follow-face ellipse /
split along the face axis / anatomy-only / camera-only) and *X-ray film* (the region where the
real image is darkened, controlled by "Real-me showing through").

**Depth-aware compositing:** invisible capsule proxies of the tracked hands write depth before the
head anatomy, so a raised hand occludes the skull behind it. The hand skeleton renders after a
depth clear.

### Assets
`scripts/assets/` (Python: numpy, trimesh, fast-simplification, scipy):

1. `fetch_bodyparts3d.py` downloads the parts tables and range-reads only the required OBJ
   members from the remote ZIP.
2. `parts_spec.py` maps structure ids to FMA concepts by id, exact name or regex.
3. `build_anatomy_assets.py` handles axes, fitting, decimation, the jaw hinge, eye pivots, label
   anchors and GLB export.
4. `face_muscles.py` generates the schematic muscle sheets.
5. `hand_rig.py` expresses each bone in a native frame: origin at the proximal end, +Y along the
   bone, +Z dorsal.

### Privacy
* The browser never sends frames, landmarks or derived data. `src/privacy.test.ts` statically
  forbids beacons, sockets, XHR, recording APIs and third-party URLs. `e2e/app.spec.ts` asserts
  that every request during a live session is a same-origin GET with no body.
* The backend's `PrivacyGuardMiddleware` rejects media types (415), chunked bodies (411) and any
  body over 16 KiB (413). No route accepts writes (tested).
* The CSP restricts `connect-src` to `'self'`. Only `'wasm-unsafe-eval'` is added, for the
  MediaPipe WASM.
* Only calibration can be persisted (localStorage, opt-in).

## Frontend module map (`web/src`)

| Path | Responsibility |
|---|---|
| `features/camera/` | `CameraController` (lifecycle, device switching, disconnects, error mapping), `cameraService` (app singleton bound to the `<video>`) |
| `features/tracking/` | MediaPipe loading (`trackerService`), `TrackingLoop`, pure result processing, face/hand math, smoothing, low-light detection, debug overlay |
| `features/anatomy/` | Asset loading/preparation (`assetStore`), `HeadRig`, `HandRig`, outlines, labels (layout + DOM overlay), picking, info card |
| `features/rendering/` | Materials, composite shader, `CompositePipeline`, `LookController`, adaptive DPR, stage + HUD, screenshot |
| `features/calibration/` | Calibration transform, assisted calibration, local storage |
| `stores/` | Zustand: `settingsStore` (user choices, presets), `sessionStore` (camera/tracker/asset status, toasts) |
| `services/contentService.ts` | Educational content from the API, with a bundled fallback |

## Backend layers (`app/`)

The request flow is `main.py → middlewares → routers → services → repositories`. The project
structure guideline also defines **orchestrators, agents, prompts and clients**. Those packages
exist, documented as intentionally empty, because the application has no AI workflows and calls
no external APIs. `agents/base.py` defines `BaseAgent` (typed Pydantic I/O) for future use.
`models/` and `db/` are empty because content is file-backed (`data/anatomy_content.json`) through
`JsonContentRepository`, and no database is needed.

## Performance notes
* Total geometry is about 168k triangles across 5 GLBs (4 MB), loaded lazily per enabled layer.
  The skull loads first.
* `low`, `balanced` and `high` modes change camera resolution, detector cadence, the DPR range
  and MSAA. Adaptive DPR lowers resolution when the measured FPS drops below 24.
* Picking uses drei's `<Bvh>` (three-mesh-bvh).
* No FPS figures are claimed. The HUD shows **measured** render FPS and tracking FPS. Headless CI
  (software GL) runs at only about 3 FPS, so real-device numbers must come from the manual
  checklist.
