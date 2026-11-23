/// <reference types="vitest/config" />
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const apiTarget = process.env.VITE_DEV_API_TARGET ?? 'http://127.0.0.1:8000';

// Windows path casing: shells may report "f:\..." while realpath() gives "F:\...". If the
// resolver realpaths some files but not others, one file becomes two modules (React bundled
// twice -> "reading 'useCallback'"; a second Vitest instance -> "failed to find the current
// suite"). preserveSymlinks keeps every path in the casing it was reached with, consistently
// with Node's own resolver. This project uses no symlinked (workspace) packages.
const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': join(root, 'src'),
      '@data': join(root, '..', 'data'),
    },
  },
  // Pre-bundle everything in one pass so React is never duplicated across optimizer runs.
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'zustand',
      'three',
      'three/examples/jsm/loaders/GLTFLoader.js',
      '@react-three/fiber',
      '@react-three/drei',
      'lucide-react',
    ],
    exclude: ['@mediapipe/tasks-vision'],
  },
  server: {
    port: 5173,
    // The educational-content API is optional; the app falls back to bundled content.
    proxy: { '/api': { target: apiTarget, changeOrigin: false } },
    fs: { allow: ['..'] },
  },
  preview: { port: 4173 },
  build: {
    target: 'es2022',
    sourcemap: true,
    // MediaPipe is loaded via dynamic import, so it already lands in its own lazy chunk.
    // Default chunking keeps a single React instance.
    chunkSizeWarningLimit: 1600,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
