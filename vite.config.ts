import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { headersFile } from './src/build/headers';
import { providerOrigins } from './src/services/providers';

/** Writes dist/_headers (CSP and caching rules) from the AI provider list. */
function cloudflareHeaders(): Plugin {
  return {
    name: 'cartcraft-headers',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: headersFile(providerOrigins()) });
    },
  };
}

export default defineConfig({
  server: {
    port: 3000,
    // The recipe import endpoint runs under `npm run dev:api` (wrangler dev).
    proxy: { '/api': 'http://localhost:8788' },
  },
  plugins: [react(), tailwindcss(), cloudflareHeaders()],
});
