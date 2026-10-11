import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { darkTheme } from './src/build/dark-theme';
export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [darkTheme()] } },
  build: { outDir: 'dist/client' },
  server: {
    strictPort: true,
    // MWP 2026-10-11: tailnet-reachable from Brian's devices (was 127.0.0.1)
    host: '0.0.0.0',
    proxy: { '/api': 'http://127.0.0.1:4310' },
  },
});
