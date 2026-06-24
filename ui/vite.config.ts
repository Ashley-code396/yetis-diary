import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['@mysten/walrus-wasm'],
  },
  resolve: {
    // Prefer local ~/.agents/skills versions when present, otherwise fall back to
    // installed node_modules packages so the build still works if skills aren't installed.
    alias: (() => {
      const HOME = (globalThis as any)?.process?.env?.HOME ?? (globalThis as any)?.HOME ?? '~';
      const agentsSui = resolve(HOME, '.agents/skills/sui');
      const agentsWalrus = resolve(HOME, '.agents/skills/walrus');
  const nodeSui = resolve('..', 'node_modules', '@mysten', 'sui');
  const nodeWalrus = resolve('..', 'node_modules', '@mysten', 'walrus');

      return [
        // Specific submodules should resolve to installed node_modules versions
  // the @mysten/sui package places modules under dist/
  { find: /^@mysten\/sui\/grpc(\/.*)?$/, replacement: resolve(nodeSui, 'dist', 'grpc') + '$1' },
  { find: /^@mysten\/sui\/bcs(\/.*)?$/, replacement: resolve(nodeSui, 'dist', 'bcs') + '$1' },
  // Any other @mysten/sui/* should fallback to node_modules dist folder
  { find: /^@mysten\/sui\/(.*)$/, replacement: resolve(nodeSui, 'dist', '$1') },
  { find: /^@mysten\/sui(\/.*)?$/, replacement: nodeSui + '$1' },
        { find: /^@mysten\/walrus(\/.*)?$/, replacement: nodeWalrus + '$1' },
        // Root package aliases: prefer agents paths for the root import when present
        { find: /^@mysten\/sui$/, replacement: agentsSui },
        { find: /^@mysten\/walrus$/, replacement: agentsWalrus },
      ];
    })(),
  },
  server: {
    port: 5173,
  },
});
