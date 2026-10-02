# CartCraft

CartCraft turns saved recipes into one consolidated, aisle-sorted shopping list for your phone.

- Works offline as an installed app. Your data stays on your device (IndexedDB); move it between devices with backup export and import.
- The same recipes and servings always give the same list. Every quantity comes from plain code, never from AI.
- Optional AI helper (DeepSeek, OpenRouter, OpenAI or Groq) with your own key, kept on the device and never included in backups.

## Develop

```bash
npm install
npm run dev
```

`npm run dev` serves the UI on http://localhost:3000. Recipe import from a link needs the Worker too: run `npm run dev:api` in a second terminal (it builds the app and serves it with `/api/import` on http://localhost:8788; Vite proxies `/api` there).

## Test

```bash
npm test
npm run typecheck
npm run e2e
```

`npm run e2e` runs Playwright in Chromium against `wrangler dev` (run `npx playwright install chromium` once). Stop any other `wrangler dev` on port 8788 first.

## Deploy

CartCraft runs as one Cloudflare Worker with static assets (`wrangler.jsonc`): the built app from `dist/` plus `/api/import`.

```bash
npx wrangler login
npm run deploy
```

The first deploy creates the `cartcraft` Worker at `https://cartcraft.<your-subdomain>.workers.dev`.

## How it fits together

- `src/domain/` is pure TypeScript (parsing, scaling, merging, formatting, aisles). `src/app/` holds use cases, `src/data/` the Dexie database and backups, `src/services/` the AI client and providers, `src/ui/` the React screens.
- `worker/index.ts` handles `/api/import` with the guarded fetcher in `src/server/`.
- `dist/_headers` (CSP and caching) is generated at build time from `src/services/providers.ts`, so adding a provider there also allows it in the CSP.
- App icons come from `public/icon.svg`; regenerate them with `npm run icons`.
