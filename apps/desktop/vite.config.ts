import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import nativeConfig from './src-tauri/tauri.conf.json' with { type: 'json' };
export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [react()],
  clearScreen: false,
  worker: { format: 'es' },
  optimizeDeps: { include: ['onnxruntime-web/wasm'] },
  preview: {
    headers: {
      'Content-Security-Policy': Object.entries(nativeConfig.app.security.csp)
        .map(([name, value]) => `${name} ${value}`)
        .join('; '),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 1425,
    strictPort: true,
    fs: { allow: [resolve(import.meta.dirname, '../..')] },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
