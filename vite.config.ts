import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };
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

/** Bump when public/icon.svg changes, here and in index.html, so installed apps refetch the icon. */
const ICON_VERSION = 2;

export default defineConfig({
  define: {
    // CARTCRAFT_VERSION lets the e2e update test build a second, different version.
    __APP_VERSION__: JSON.stringify(process.env.CARTCRAFT_VERSION ?? pkg.version),
  },
  server: {
    port: 3000,
    // The recipe import endpoint runs under `npm run dev:api` (wrangler dev).
    proxy: { '/api': 'http://localhost:8788' },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Never swap versions under a user mid-shop: the new version waits for "Reload".
      registerType: 'prompt',
      // Registered from React (src/ui/PwaStatus.tsx); no inline script, which the CSP would block.
      injectRegister: false,
      manifest: {
        name: 'CartCraft',
        short_name: 'CartCraft',
        description: 'Turn saved recipes into one aisle-sorted shopping list.',
        theme_color: '#ffffff',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        // Installed apps (Windows taskbar, home screens) keep a cached icon until its URL changes.
        icons: [
          { src: `pwa-64x64.png?v=${ICON_VERSION}`, sizes: '64x64', type: 'image/png' },
          { src: `pwa-192x192.png?v=${ICON_VERSION}`, sizes: '192x192', type: 'image/png' },
          { src: `pwa-512x512.png?v=${ICON_VERSION}`, sizes: '512x512', type: 'image/png' },
          { src: `maskable-icon-512x512.png?v=${ICON_VERSION}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: 'index.html',
        // Recipe import is online only and must never be answered from the cache.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
    cloudflareHeaders(),
  ],
});
