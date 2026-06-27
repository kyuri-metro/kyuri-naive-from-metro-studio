import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  root: '.',
  build: {
    outDir: 'dist-web',
    emptyOutDir: true,
  },
  publicDir: 'public',
});