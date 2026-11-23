/// <reference types="node" />
/**
 * Static privacy boundary: the client must not contain any channel that could transmit or record
 * camera-derived data. Network access is limited to same-origin GETs for content and assets.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = sources(SRC).map((path) => ({ path: relative(SRC, path).replace(/\\/g, '/'), text: readFileSync(path, 'utf8') }));

describe('privacy boundaries', () => {
  it('uses no beacon, socket, XHR, event-source or recording APIs', () => {
    const forbidden = [/sendBeacon/, /new WebSocket/, /XMLHttpRequest/, /new EventSource/, /MediaRecorder/, /getDisplayMedia/, /RTCPeerConnection/];
    for (const { path, text } of files) {
      for (const rx of forbidden) expect(`${path}: ${rx.test(text)}`).toBe(`${path}: false`);
    }
  });

  it('only fetches from known modules', () => {
    const allowed = new Set(['services/contentService.ts', 'features/anatomy/assetLoader.ts']);
    const fetching = files.filter((f) => /\bfetch\s*\(|fetcher\s*\(/.test(f.text)).map((f) => f.path);
    expect(fetching.every((p) => allowed.has(p))).toBe(true);
  });

  it('never sends request bodies or non-GET methods', () => {
    for (const { path, text } of files) {
      expect(`${path}: ${/method:\s*['"`](POST|PUT|PATCH|DELETE)/i.test(text)}`).toBe(`${path}: false`);
      expect(`${path}: ${/\bbody:\s*(JSON|frame|canvas|blob|landmark)/i.test(text)}`).toBe(`${path}: false`);
    }
  });

  it('does not reference third-party hosts at runtime (models and WASM are self-hosted)', () => {
    for (const { path, text } of files) {
      const urls = text.match(/https?:\/\/[^\s'"`)]+/g) ?? [];
      expect(`${path}: ${urls.join(',')}`).toBe(`${path}: `);
    }
  });

  it('persists only calibration, and only through the opt-in storage module', () => {
    const storageUsers = files.filter((f) => /localStorage|sessionStorage|indexedDB/.test(f.text)).map((f) => f.path);
    expect(storageUsers).toEqual(['features/calibration/calibrationStorage.ts']);
  });
});
