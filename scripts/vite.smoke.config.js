import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { psychicAssetsPlugin } from './vite-psychic-plugin.mjs';

const ROOT = path.resolve(__dirname, '..');

// Config for the headless smoke test (scripts/smoke-render.mjs).
// No manualChunks (incompatible with SSR externals), no CSS imports.
export default defineConfig({
  root: path.resolve(ROOT, 'src/renderer'),
  base: './',
  plugins: [react(), psychicAssetsPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(ROOT, 'src/renderer/src'),
      '@shared': path.resolve(ROOT, 'src/shared'),
    },
  },
  ssr: { noExternal: ['@xterm/xterm', '@xterm/addon-fit'] },
  build: {
    outDir: path.resolve(ROOT, '.smoke'),
    emptyOutDir: true,
    ssr: path.resolve(ROOT, 'scripts/smoke-entry.jsx'),
    rollupOptions: { output: {} },
  },
});
