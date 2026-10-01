import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    // The recipe import function runs under `npm run dev:api` (wrangler pages dev).
    proxy: { '/api': 'http://localhost:8788' },
  },
  plugins: [react(), tailwindcss()],
});
