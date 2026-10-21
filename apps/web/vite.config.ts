import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // contracts index pulls node-only modules (crypto) and ships CJS; bundle only the pure permissions module
      '@toka/contracts': fileURLToPath(new URL('../../packages/contracts/src/permissions.ts', import.meta.url)),
    },
  },
  server: { proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true } } },
});
