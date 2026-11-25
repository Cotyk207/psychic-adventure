import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { psychicAssetsPlugin } from './scripts/vite-psychic-plugin.mjs';

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react(), psychicAssetsPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer/src'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'chrome120',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          markdown: ['marked', 'dompurify', 'highlight.js'],
          xterm: ['@xterm/xterm', '@xterm/addon-fit'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
