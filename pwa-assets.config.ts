import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config';

// public/icon.svg has rounded corners on a transparent canvas. The plain icons keep them;
// maskable and Apple icons are filled white because the OS applies its own mask.
const square = { padding: 0, resizeOptions: { background: '#ffffff' } };

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...preset,
    transparent: { ...preset.transparent, padding: 0 },
    maskable: { ...preset.maskable, ...square },
    apple: { ...preset.apple, ...square },
  },
  images: ['public/icon.svg'],
});
