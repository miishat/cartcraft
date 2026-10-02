import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config';

// public/icon.svg is full-bleed with the cart inside the maskable safe zone, so no padding.
const fill = { padding: 0, resizeOptions: { background: '#064e3b' } };

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...preset,
    transparent: { ...preset.transparent, ...fill },
    maskable: { ...preset.maskable, ...fill },
    apple: { ...preset.apple, ...fill },
  },
  images: ['public/icon.svg'],
});
