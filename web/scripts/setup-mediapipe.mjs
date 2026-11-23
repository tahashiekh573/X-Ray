#!/usr/bin/env node
/**
 * Self-hosts every MediaPipe runtime asset so the app never contacts a CDN at runtime.
 *
 *  - Copies the WASM runtime from node_modules/@mediapipe/tasks-vision/wasm -> public/mediapipe/wasm
 *  - Downloads the official .task model bundles (Apache-2.0) -> public/mediapipe/models
 *
 * Usage:
 *   node scripts/setup-mediapipe.mjs             # copy WASM + download models if missing
 *   node scripts/setup-mediapipe.mjs --wasm-only # only copy WASM (used by postinstall)
 *   node scripts/setup-mediapipe.mjs --force     # re-download models
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));

// Official Google-hosted model bundles (documented in the MediaPipe Tasks guides).
const MODELS = [
  {
    file: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  },
  {
    file: 'pose_landmarker_lite.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  },
  {
    file: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  },
];

function copyWasm() {
  const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
  const dst = join(root, 'public', 'mediapipe', 'wasm');
  if (!existsSync(src)) {
    console.warn(`[mediapipe] WASM source not found at ${src} (skipping)`);
    return;
  }
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    copyFileSync(join(src, name), join(dst, name));
  }
  console.log(`[mediapipe] WASM runtime copied to public/mediapipe/wasm`);
}

async function downloadModels() {
  const dst = join(root, 'public', 'mediapipe', 'models');
  mkdirSync(dst, { recursive: true });
  for (const { file, url } of MODELS) {
    const target = join(dst, file);
    if (!args.has('--force') && existsSync(target) && statSync(target).size > 0) {
      console.log(`[mediapipe] ${file} already present`);
      continue;
    }
    console.log(`[mediapipe] downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
    writeFileSync(target, Buffer.from(await res.arrayBuffer()));
    console.log(`[mediapipe] saved ${file} (${statSync(target).size} bytes)`);
  }
}

copyWasm();
if (!args.has('--wasm-only')) {
  downloadModels().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
