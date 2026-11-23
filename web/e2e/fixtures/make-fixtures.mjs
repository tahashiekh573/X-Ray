#!/usr/bin/env node
/**
 * Builds the fake-camera video fixtures used by the Playwright tests.
 * Source images are MediaPipe's own public test assets (mediapipe-assets bucket, used by the
 * Apache-2.0 MediaPipe repository's tests). They are downloaded on demand and not committed.
 * Requires ffmpeg on PATH.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const raw = join(here, 'raw');
mkdirSync(raw, { recursive: true });

const SOURCES = {
  portrait: 'https://storage.googleapis.com/mediapipe-assets/portrait.jpg',
  thumb_up: 'https://storage.googleapis.com/mediapipe-assets/thumb_up.jpg',
  pose: 'https://storage.googleapis.com/mediapipe-assets/pose.jpg',
};

for (const [name, url] of Object.entries(SOURCES)) {
  const jpg = join(raw, `${name}.jpg`);
  if (!existsSync(jpg)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed ${url}: ${res.status}`);
    writeFileSync(jpg, Buffer.from(await res.arrayBuffer()));
  }
  const out = join(here, `${name}.y4m`);
  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-y', '-loop', '1', '-i', jpg, '-t', '1', '-r', '30',
    '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p',
    out,
  ]);
  console.log(`wrote ${out}`);
}
