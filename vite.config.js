import { defineConfig } from 'vite';

// Static client build: host (ThinkPad / port-share) only serves files.
// Three.js always executes in the visitor's browser on their hardware.
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    // Needed so phones on the same Wi‑Fi / port-share tunnels can connect.
    strictPort: false
  },
  preview: {
    host: '0.0.0.0'
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Single browser bundle — no server-side rendering.
    ssr: false,
    target: 'es2020'
  }
});
