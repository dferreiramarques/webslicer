import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  worker: {
    format: 'es'
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 6000
  },
  optimizeDeps: {
    exclude: ['cura-wasm']
  }
});
