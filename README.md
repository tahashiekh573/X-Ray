# X-Ray Mirror Pro

A real-time, privacy-first **anatomy mirror** for the browser. Open your webcam and a generic 3D
anatomical model is aligned with your head and hands as you move. The model includes a skull with
an articulated jaw, brain, eyes, schematic facial muscles and hand bones.

> **Educational overlay, not medical imaging.** The anatomy is a generic adult model aligned with
> camera-based tracking. It does not show your actual anatomy.

## Features

* **Live mirror:** mirrored webcam view with camera selection, start/stop, fullscreen, screenshot
  (PNG) and fit/fill.
* **Tracking:** MediaPipe Face Landmarker (478 landmarks, head pose matrix, blendshapes) and Hand
  Landmarker (2 hands), running on-device (WebAssembly, GPU with CPU fallback).
* **Anatomy** from BodyParts3D (CC BY 4.0):
  * skull: separate cranial bones, articulated mandible, upper and lower teeth;
  * brain: left and right cerebral hemispheres, cerebellum, brainstem, ventricles;
  * eyes: eyeballs that follow your gaze, extraocular muscles, optic nerves;
  * hands: 27 bones per hand with finger flexion.
* **Facial muscles:** a clearly labelled **schematic** layer (masseter, temporalis, orbicularis
  oculi/oris, frontalis, zygomaticus major, buccinator). BodyParts3D has no such meshes; see
  [ASSET_LICENSES.md](ASSET_LICENSES.md).
* **Jaw:** open your mouth and the mandible rotates about the temporomandibular hinge, with a
  small forward glide. Masseter and lower-lip muscles stretch with it.
* **Rendering:** X-ray (Fresnel glow), solid (lit) and wireframe modes, with brightness, opacity
  and tint controls.
* **Mixed reality:**
  * reveal modes: full head, circular lens (draggable), follow face, split face, anatomy only,
    camera only;
  * edge feather, "real-me showing through", and blend styles;
  * depth-aware hand occlusion.
* **Calibration:** manual size, width, height, depth, position and rotation, plus assisted
  calibration that measures your face proportions. Can optionally be remembered on this device.
* **Learning:**
  * click or tap a structure, or its label, for its name, category, description, function and
    related structures;
  * a structure explorer;
  * seven presets.
* **Debug mode:** landmarks, head angles, mouth ratio, model position and scale, measured FPS and
  detection timings. Only values the APIs expose are shown.
* **Performance modes** (low, balanced, high) plus adaptive resolution.
* **Accessibility and mobile:** keyboard shortcuts (`?`), visible focus, reduced-motion support,
  collapsible panels and touch controls.

## Quick start

Prerequisites: **Node.js ≥ 20.19 or 22.12**, **Python ≥ 3.11**, and a browser with WebGL 2.

```bash
# 1. Frontend
cd web
npm install                 # also copies the MediaPipe WASM runtime into public/
npm run setup:mediapipe     # one-time download of the two MediaPipe .task models (~11 MB)
npm run dev                 # http://localhost:5173

# 2. Backend (optional in development: the UI falls back to bundled content)
cd ..
python -m venv .venv
. .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000   # the Vite dev server proxies /api to it
```

Open http://localhost:5173 and press **Start camera**. Browsers allow the camera only on
`localhost` or over HTTPS.

## Commands

| Where | Command | What |
|---|---|---|
| `web/` | `npm run dev` | Dev server with `/api` proxy |
| `web/` | `npm run build` | Type-check and production build to `web/dist` |
| `web/` | `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `web/` | `npm test` | Vitest unit, component and privacy tests |
| `web/` | `node e2e/fixtures/make-fixtures.mjs` then `npm run test:e2e` | Playwright browser tests with a fake camera (needs ffmpeg and Chrome; `PW_CHANNEL=chromium` uses Playwright's browser) |
| root | `pytest` | Backend tests (config, API, privacy boundaries, content integrity) |
| root | `ruff check app tests` / `ruff format app tests` / `mypy` | Python lint, format, strict typing |
| root | `pip install -e ".[assets]"`, then `python -I scripts/assets/fetch_bodyparts3d.py` and `python -I scripts/assets/build_anatomy_assets.py` | Rebuild the anatomy GLBs from BodyParts3D (optional; the built GLBs are committed) |

## Production build and deployment

```bash
cd web && npm ci && npm run setup:mediapipe && npm run build
cd .. && pip install . && XRAY_ENVIRONMENT=production XRAY_ENABLE_HSTS=true \
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers
```

FastAPI serves `web/dist`, including `/models` and `/mediapipe`, together with the API. It adds
security headers: a strict CSP, `Permissions-Policy: camera=(self)`, `nosniff` and frame denial.

* **HTTPS is mandatory** for camera access outside localhost. Terminate TLS at a reverse proxy
  (Caddy, nginx, a cloud load balancer) and forward to uvicorn.
* **Static hosting** (Netlify, Cloudflare Pages, S3 + CloudFront) works without the backend. The
  app then uses the educational content bundled at build time. Replicate the CSP and
  `Permissions-Policy` headers from `app/middlewares/security_headers.py` in the host's header
  configuration, and serve `.wasm` as `application/wasm`.
* Cache `assets/`, `models/` and `mediapipe/` aggressively. Their names are content-hashed or
  versioned, apart from the models, which change only when you rebuild them.
* After the first load every asset can come from the browser cache. No third-party request is
  made at runtime.

Configuration lives in environment variables; see [.env.example](.env.example). No secrets or AI
API keys are needed.

## Privacy

* Camera frames, landmarks and all derived data stay in the browser. Nothing is uploaded,
  recorded or sent to analytics.
* MediaPipe's WASM runtime and models are self-hosted. The app contacts no CDN.
* The backend only answers same-origin GETs for content. It rejects media uploads and any request
  body over 16 KiB.
* Stopping the camera stops every media track. Tracks are also released on page hide.
* Only the optional calibration is stored, in `localStorage` on your device.

These rules are enforced by tests: `web/src/privacy.test.ts`, `web/e2e/app.spec.ts` and
`tests/integration/test_privacy_boundaries.py`.

## Browser compatibility

| Browser | Status |
|---|---|
| Chrome / Edge (desktop, Android) ≥ 113 | Supported. GPU delegate; `requestVideoFrameCallback` |
| Firefox (desktop) | Supported. MediaPipe may fall back to the CPU delegate (slower) |
| Safari 17+ (macOS, iOS / iPadOS) | Expected to work but **not yet tested**. iOS requires a user gesture (Start button) and `playsinline` (set) |
| Browsers without WebGL 2 | The camera view works; the 3D overlay is disabled, with an explanation |

## Known limitations

* **Generic anatomy.** One adult BodyParts3D body is fitted to MediaPipe's average face. Bone
  protrudes slightly at the forehead and nasal bridge for some face shapes; use **Fit to my head**
  to adjust. Webcams cannot measure skull dimensions.
* **Facial muscles are schematic**, because no openly licensed mesh was obtainable. They follow
  the jaw but do not deform with expressions (only the jaw and gaze are animated).
* **Depth from a single camera is approximate.** Assisted calibration cannot measure head depth,
  so depth follows the width/height average.
* **Hands:** the left hand is a mirrored right-hand skeleton. Bone orientation comes from 21
  landmarks, so wrist pronation and supination are approximated. A simplified joint-and-bone
  skeleton (labelled as a fallback) is shown if the hand model fails to load.
* **Tracking range:** profile views beyond roughly ±60° yaw, heavy occlusion and low light reduce
  tracking quality. The app shows hints when this happens.
* **Face confidence is not exposed** by MediaPipe's Face Landmarker, so none is displayed.
  Handedness scores are shown.
* Real-device frame rates are not claimed. See the measured FPS in the HUD and
  [docs/MANUAL_TEST_CHECKLIST.md](docs/MANUAL_TEST_CHECKLIST.md).

## Project layout

```text
xray-mirror-pro/
├── app/                FastAPI backend (core, middlewares, routers, schemas, services, repositories, …)
├── web/                React + Vite frontend (see ARCHITECTURE.md for the module map)
│   ├── public/models/  Generated anatomy GLBs + manifest (BodyParts3D derivatives, CC BY 4.0)
│   └── e2e/            Playwright tests + fake-camera fixture generator
├── scripts/assets/     Offline asset pipeline (Python)
├── data/               anatomy_content.json (educational text; raw downloads are git-ignored)
├── tests/              pytest unit + integration tests
└── docs/               Manual validation checklist
```

## Attribution

3D anatomy: **BodyParts3D, © The Database Center for Life Science, licensed under CC Attribution
4.0 International.** Tracking: Google MediaPipe (Apache-2.0). Full details:
[ASSET_LICENSES.md](ASSET_LICENSES.md).
