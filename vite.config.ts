import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    tanstackStart(),
    viteReact(),
  ],
  server: {
    port: 5280,
  },
  worker: {
    format: 'es',
  },
});
