import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/labs/plotterfun-extended/',
  plugins: [react()],
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
  worker: {
    format: 'es',
  },
});
