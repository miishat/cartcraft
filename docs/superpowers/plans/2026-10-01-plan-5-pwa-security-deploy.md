# CartCraft Plan 5: PWA, Security and Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CartCraft an installable, offline-first PWA with an update prompt, serve it with a strict CSP generated from the AI provider list, add the iOS install banner and the "Keep screen on" toggle, cover the critical journeys with Playwright, and deploy it to Cloudflare as release 0.2.0.

**Architecture:** One Cloudflare Worker with static assets serves everything: `dist/` (the Vite build, with the single-page-app fallback and the `_headers` rules) and `/api/import` (the existing `src/server/` handler, moved from `functions/api/import.ts` to `worker/index.ts`, now with Cloudflare's rate-limit binding). A small Vite plugin writes `dist/_headers` from `providerOrigins()`, so the CSP `connect-src` always matches `src/services/providers.ts`. vite-plugin-pwa generates the service worker in `prompt` mode; `src/ui/PwaStatus.tsx` registers it from React (no inline script) and shows `UpdateToast`. Playwright runs against `wrangler dev`, so e2e tests see the real headers, routing and service worker.

**Tech Stack:** Vite 6, vite-plugin-pwa 1.3 (Workbox 7), `@vite-pwa/assets-generator` 1.0, Wrangler 4 (Workers static assets), Playwright 1.63 (Chromium), React 19, Vitest 3.

**Spec:** [2026-10-01-cartcraft-rewrite-design.md](../specs/2026-10-01-cartcraft-rewrite-design.md) sections 6 (iOS banner, Keep screen on), 9.3, 9.4, 9.5, 10.2 (Playwright), 11. **Roadmap:** [2026-10-01-roadmap.md](2026-10-01-roadmap.md). **Research:** [app-platform.md](../../research/app-platform.md) sections 2, 6, 7 and the gotchas checklist. **Requires:** Plans 1 to 4 merged (466 passing tests in 39 files on `main` at `cb8607b`).

## Global Constraints

- `CLAUDE.md`: every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md` in the same commit. The exact lines are given in each task. Task 7 cuts release 0.2.0.
- Do not use em dashes in code comments, docs or UI copy. Run commands from `C:\Users\misha\cartcraft` in Git Bash. UI test files start with `// @vitest-environment jsdom`.
- Host (decided by the user on 2026-10-01): **Cloudflare Workers with static assets**, not Pages. Cloudflare's Pages docs now say "Start new projects with Workers". Worker name `cartcraft`. `wrangler dev` runs on port 8788 so the existing Vite proxy (`/api` to `http://localhost:8788`) keeps working.
- New dev dependencies, exact ranges: `vite-plugin-pwa@^1.3.0`, `workbox-window@^7.4.1`, `@vite-pwa/assets-generator@^1.0.4`, `@playwright/test@^1.63.0`. Use assets-generator 1.x: 2.0.0 is outside vite-plugin-pwa 1.3.0's peer range and `npm install` fails with ERESOLVE. Vite stays on 6.
- PWA: `registerType: 'prompt'` (never `autoUpdate`: users must not get a new version mid-shop), the update check runs every hour, `/api/*` is never answered by the service worker.
- CSP (spec 9.4, plus `object-src 'none'`): `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' <provider origins>; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`. No inline scripts and no third-party origins anywhere.
- Fonts: the app uses the system font stack (`src/index.css`) and loads no web fonts, so there is nothing to self-host and `font-src 'self'` holds. Do not add a font CDN.
- `_headers` applies only to static asset responses, never to Worker responses. `src/server/importRecipe.ts` already sets its own headers.
- Before `npm run e2e`, make sure nothing else listens on port 8788. Playwright reuses an existing server outside CI, and a stale `wrangler dev` serves an old build (this caused false failures during the dry run).

## Open items from the roadmap handled here

| Item | Outcome |
|---|---|
| Compare Cloudflare Pages with Netlify before the first public deploy | Resolved: Cloudflare Workers with static assets (Task 1). Netlify has no HTMLRewriter, so the import extraction would need a rewrite. |
| Rate limiting used an in-memory per-isolate limiter because Pages Functions do not list the binding | Resolved: Workers support the rate-limit binding; the in-memory limiter stays as a fallback (Task 1). |
| Parser limitation "1 lb boneless, skinless chicken breast" | Unchanged; stays open in the roadmap. |

## File Structure

| File | Responsibility |
|---|---|
| `worker/index.ts` (moved from `functions/api/import.ts`) | Worker entry: `/api/import` with HTMLRewriter extractors and the rate-limit binding; everything else goes to static assets |
| `worker/tsconfig.json` (moved from `functions/tsconfig.json`) | Workers typecheck |
| `wrangler.jsonc` (modify) | Worker `main`, assets (`dist/`, SPA fallback, `run_worker_first: ["/api/*"]`), rate limit |
| `src/server/importRecipe.ts` (modify) | `allow` may return a promise |
| `src/build/headers.ts` | `contentSecurityPolicy()`, `headersFile()` (build time only) |
| `vite.config.ts` (modify) | `_headers` plugin, VitePWA, `__APP_VERSION__` |
| `public/icon.svg`, `public/*.png`, `public/favicon.ico`, `pwa-assets.config.ts` | App icon source, generated icons, generator config |
| `src/ui/components/UpdateToast.tsx` | "New version" and "works offline" notice |
| `src/ui/PwaStatus.tsx` | Registers the service worker, hourly update check |
| `src/vite-env.d.ts` | `__APP_VERSION__` declaration |
| `src/ui/useWakeLock.ts` | `useWakeLock()`, `wakeLockSupported()` |
| `src/ui/components/IosInstallBanner.tsx` | iOS Safari install hint |
| `src/ui/screens/ListScreen.tsx`, `SettingsScreen.tsx`, `src/ui/Layout.tsx`, `src/main.tsx`, `index.html` (modify) | Wiring |
| `playwright.config.ts`, `e2e/*` | End-to-end tests |
| `README.md`, `docs/superpowers/plans/2026-10-01-roadmap.md`, `CHANGELOG.md` | Docs and release |

---

### Task 1: Serve the app and the import endpoint from one Cloudflare Worker

**Files:**
- Move: `functions/api/import.ts` to `worker/index.ts`, `functions/tsconfig.json` to `worker/tsconfig.json`
- Modify: `worker/index.ts`, `wrangler.jsonc`, `package.json`, `vite.config.ts` (comment), `src/server/importRecipe.ts`, `CHANGELOG.md`
- Test: `src/server/importRecipe.test.ts`

**Interfaces:**
- Consumes: `handleImport(request, deps)`, `createRateLimiter()`, `limitBytes()`, `decodeEntities()` (unchanged).
- Produces: `ImportDeps.allow: (key: string, now: number) => boolean | Promise<boolean>`. `worker/index.ts` default export `{ fetch(request, env) }` with `Env { ASSETS: Fetcher; IMPORT_LIMITER?: RateLimit }`. `npm run dev:api` serves the built app and `/api/import` on port 8788. `npm run typecheck` checks `worker/` instead of `functions/`.

- [ ] **Step 1: Write the failing test**

In `src/server/importRecipe.test.ts`, directly after the test `'rate limits by client IP'` (it ends with `expect(allow).toHaveBeenCalledWith('203.0.113.9', 0);` and `});`), add:

```ts
  it('waits for an async rate limiter', async () => {
    const result = await call(post({ url: 'https://example.com/t' }), deps(vi.fn(), { allow: async () => false }));
    expect(result.status).toBe(429);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/server/importRecipe.test.ts`
Expected: FAIL in "waits for an async rate limiter": the status is not 429, because a pending promise is truthy and the request is treated as allowed.

- [ ] **Step 3: Accept an async limiter**

In `src/server/importRecipe.ts`, replace:

```ts
  /** Rate limiter: false means reject. */
  allow: (key: string, now: number) => boolean;
```

with:

```ts
  /** Rate limiter: false means reject. May be async (the Cloudflare rate-limit binding is). */
  allow: (key: string, now: number) => boolean | Promise<boolean>;
```

and replace:

```ts
  if (!deps.allow(client, deps.now())) return json({ ok: false, error: 'rate_limited' }, 429);
```

with:

```ts
  if (!(await deps.allow(client, deps.now()))) return json({ ok: false, error: 'rate_limited' }, 429);
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/server`
Expected: PASS, 46 tests.

- [ ] **Step 5: Move the function to a Worker entry**

```bash
mkdir -p worker
git mv functions/tsconfig.json worker/tsconfig.json
git mv functions/api/import.ts worker/index.ts
```

`functions/` is now empty and disappears. In `worker/index.ts` make three edits.

Replace the four import lines at the top (they start with `'../../src/`) with:

```ts
import { decodeEntities } from '../src/domain';
import { handleImport } from '../src/server/importRecipe';
import { limitBytes } from '../src/server/limitBytes';
import { createRateLimiter } from '../src/server/rateLimit';
```

Replace:

```ts
/** 10 imports per minute per client IP, per isolate (best effort; see spec section 7). */
const allow = createRateLimiter({ limit: 10, windowMs: 60_000 });
```

with:

```ts
interface Env {
  /** Static files from dist/ (the built app). */
  ASSETS: Fetcher;
  /** 10 imports per minute per client IP (wrangler.jsonc). Missing in some local setups. */
  IMPORT_LIMITER?: RateLimit;
}

/** Used only when the rate-limit binding is missing: per isolate, best effort. */
const fallbackLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
```

Replace the whole `export const onRequest: PagesFunction = ...` statement at the end of the file with:

```ts
function notFound(): Response {
  return new Response(JSON.stringify({ ok: false, error: 'bad_request' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * Only /api/* reaches this code (assets.run_worker_first in wrangler.jsonc); every other
 * path is served from dist/ with the single-page-app fallback and the _headers rules.
 */
export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname !== '/api/import') return pathname.startsWith('/api/') ? notFound() : env.ASSETS.fetch(request);
    return handleImport(request, {
      fetch: (url, init) => fetch(url, init),
      jsonLdBlocks,
      visibleText,
      allow: async (key, now) =>
        env.IMPORT_LIMITER ? (await env.IMPORT_LIMITER.limit({ key })).success : fallbackLimiter(key, now),
      now: Date.now,
    });
  },
} satisfies ExportedHandler<Env>;
```

The `limited`, `jsonLdBlocks`, `HIDDEN`, `BLOCK` and `visibleText` code in between stays as it is.

- [ ] **Step 6: Configure the Worker**

Replace `wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "cartcraft",
  "main": "worker/index.ts",
  "compatibility_date": "2026-09-15",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "ratelimits": [
    {
      "name": "IMPORT_LIMITER",
      "namespace_id": "1001",
      "simple": { "limit": 10, "period": 60 }
    }
  ]
}
```

(`namespace_id` is any positive integer unique within the Cloudflare account; `period` must be 10 or 60.)

In `package.json` `scripts`, change two lines:

```json
    "typecheck": "tsc --noEmit && tsc --noEmit -p worker",
    "dev:api": "vite build && wrangler dev --port 8788"
```

In `vite.config.ts`, change the proxy comment to:

```ts
    // The recipe import endpoint runs under `npm run dev:api` (wrangler dev).
```

- [ ] **Step 7: Verify locally**

Run: `npm run typecheck && npm run build`
Expected: both `tsc` runs print nothing; `vite build` ends with "built in".

Run `npm run dev:api` in a second terminal and wait for "Ready on http://localhost:8788". The banner lists `env.IMPORT_LIMITER (10 requests/60s)  Rate Limit  local` and `env.ASSETS`. Then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Sec-Fetch-Mode: navigate" http://localhost:8788/lists/abc
curl -s -X POST http://localhost:8788/api/import -d '{"url":"http://localhost"}'; echo
curl -s http://localhost:8788/api/nope; echo
curl -s -X POST http://localhost:8788/api/import -d '{"url":"https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/"}' | head -c 120; echo
```

Expected, in order: `200` (the app shell for a deep link); `{"ok":false,"error":"invalid_url"}`; `{"ok":false,"error":"bad_request"}`; a line starting `{"ok":true,"mode":"recipe","recipe":{"title":"Best Chocolate Chip Cookies"`. Sending 11 more import requests within a minute returns `{"ok":false,"error":"rate_limited"}` once the limit of 10 is reached. Stop `wrangler dev` (Ctrl+C) when done.

- [ ] **Step 8: Add the changelog line**

Under `## [Unreleased]`, add a `### Changed` group (after `### Added`, before `### Fixed`):

```markdown
### Changed
- The app and recipe import are served by one Cloudflare Worker, and recipe import uses Cloudflare's rate limiter (10 imports per minute per address).
```

- [ ] **Step 9: Run everything and commit**

Run: `npm test`
Expected: 39 files, 467 tests PASS.

```bash
git add -A worker functions wrangler.jsonc package.json vite.config.ts src/server/importRecipe.ts src/server/importRecipe.test.ts CHANGELOG.md
git commit -m "feat(deploy): serve the app and recipe import from one Cloudflare Worker"
```

---

### Task 2: Security and caching headers generated from the provider list

**Files:**
- Create: `src/build/headers.ts`, `src/build/headers.test.ts`
- Modify: `vite.config.ts`, `CHANGELOG.md`

**Interfaces:**
- Consumes: `providerOrigins(): string[]` from `src/services/providers.ts`.
- Produces: `contentSecurityPolicy(connectOrigins: readonly string[]): string` (throws for anything but a bare https origin); `headersFile(connectOrigins: readonly string[]): string` (the `_headers` text). `npm run build` writes `dist/_headers`. Task 3 replaces `vite.config.ts` and keeps the `cloudflareHeaders()` plugin defined here.

- [ ] **Step 1: Write the failing test**

Create `src/build/headers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, headersFile } from './headers';
import { providerOrigins } from '../services/providers';

describe('contentSecurityPolicy', () => {
  it('allows scripts, styles and fonts from this origin only and AI calls to the given origins', () => {
    expect(contentSecurityPolicy(['https://api.deepseek.com', 'https://openrouter.ai'])).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
        "connect-src 'self' https://api.deepseek.com https://openrouter.ai; object-src 'none'; " +
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
  });

  it('rejects anything that is not a bare https origin', () => {
    expect(() => contentSecurityPolicy(['http://api.example.com'])).toThrow('https origin');
    expect(() => contentSecurityPolicy(['https://api.example.com/v1'])).toThrow('https origin');
    expect(() => contentSecurityPolicy(["https://x.com; script-src *"])).toThrow('https origin');
  });
});

describe('headersFile', () => {
  const file = headersFile(providerOrigins());

  /** Header lines under one exact path rule. */
  function rule(path: string): string[] {
    const lines = file.split('\n');
    const start = lines.indexOf(path);
    expect(start, `rule ${path}`).toBeGreaterThanOrEqual(0);
    const body: string[] = [];
    for (const line of lines.slice(start + 1)) {
      if (!line.startsWith('  ')) break;
      body.push(line.trim());
    }
    return body;
  }

  it('sends the CSP and other security headers on every static file', () => {
    expect(rule('/*')).toEqual([
      `Content-Security-Policy: ${contentSecurityPolicy(providerOrigins())}`,
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: no-referrer',
      'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
    ]);
    expect(file).toContain('https://api.groq.com');
  });

  it('keeps the app shell and service worker uncached so updates are seen', () => {
    for (const path of ['/', '/index.html', '/sw.js', '/manifest.webmanifest']) {
      expect(rule(path)).toEqual(['Cache-Control: no-cache']);
    }
  });

  it('caches hashed build assets for a year', () => {
    expect(rule('/assets/*')).toEqual(['Cache-Control: public, max-age=31536000, immutable']);
  });

  it('stays within the Cloudflare limit of 2,000 characters per line', () => {
    for (const line of file.split('\n')) expect(line.length).toBeLessThanOrEqual(2000);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/build`
Expected: FAIL with "Cannot find module './headers'".

- [ ] **Step 3: Implement the headers module**

Create `src/build/headers.ts`:

```ts
/**
 * Build-time only: the Cloudflare `_headers` file for the static app. vite.config.ts writes it
 * into dist/ from the provider list, so the CSP connect-src always matches the AI providers.
 * `_headers` does not apply to Worker responses; worker/ and src/server/ set their own headers.
 */

/** A bare https origin such as https://api.deepseek.com (no path, port or other characters). */
const HTTPS_ORIGIN = /^https:\/\/[a-z0-9.-]+$/;

export function contentSecurityPolicy(connectOrigins: readonly string[]): string {
  for (const origin of connectOrigins) {
    if (!HTTPS_ORIGIN.test(origin)) throw new Error(`CSP connect-src entry must be a bare https origin: ${origin}`);
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    ['connect-src', "'self'", ...connectOrigins].join(' '),
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/** Rules are kept separate: Cloudflare joins a header set by two matching rules with a comma. */
export function headersFile(connectOrigins: readonly string[]): string {
  const rules: [path: string, headers: string[]][] = [
    ['/*', [
      `Content-Security-Policy: ${contentSecurityPolicy(connectOrigins)}`,
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: no-referrer',
      'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
    ]],
    // A cached index.html or sw.js leaves users stuck on an old version.
    ['/', ['Cache-Control: no-cache']],
    ['/index.html', ['Cache-Control: no-cache']],
    ['/sw.js', ['Cache-Control: no-cache']],
    ['/manifest.webmanifest', ['Cache-Control: no-cache']],
    ['/assets/*', ['Cache-Control: public, max-age=31536000, immutable']],
  ];
  return rules.map(([path, headers]) => [path, ...headers.map((h) => `  ${h}`)].join('\n')).join('\n') + '\n';
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/build`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write `_headers` during the build**

Replace `vite.config.ts`:

```ts
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
```

- [ ] **Step 6: Verify the headers are served**

Run: `npm run build && cat dist/_headers`
Expected: the file starts with `/*` and a `Content-Security-Policy:` line ending in `connect-src 'self' https://api.deepseek.com https://openrouter.ai https://api.openai.com https://api.groq.com; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`.

Run `npx wrangler dev --port 8788` in a second terminal, then:

```bash
curl -sI http://localhost:8788/ | grep -i -E "content-security-policy|cache-control|referrer-policy"
```

Expected: the CSP line, `Cache-Control: no-cache` and `Referrer-Policy: no-referrer`. Open http://localhost:8788 in a browser, open the console, and click through Recipes, Lists and Settings: no "Content Security Policy" errors. Stop `wrangler dev`.

- [ ] **Step 7: Add the changelog line**

Under `### Added`, add:

```markdown
- Security headers: a strict Content Security Policy that allows AI requests only to the four supported providers, plus caching rules so new versions are picked up.
```

- [ ] **Step 8: Run everything and commit**

Run: `npm test && npm run typecheck`
Expected: 40 files, 473 tests PASS; both `tsc` runs print nothing.

```bash
git add src/build vite.config.ts CHANGELOG.md
git commit -m "feat(security): CSP and caching headers generated from the provider list"
```

---

### Task 3: Installable app with offline support and an update prompt

**Files:**
- Create: `public/icon.svg`, `pwa-assets.config.ts`, generated `public/pwa-64x64.png`, `public/pwa-192x192.png`, `public/pwa-512x512.png`, `public/maskable-icon-512x512.png`, `public/apple-touch-icon-180x180.png`, `public/favicon.ico`, `src/ui/components/UpdateToast.tsx`, `src/ui/components/UpdateToast.test.tsx`, `src/ui/PwaStatus.tsx`, `src/vite-env.d.ts`
- Modify: `package.json`, `package-lock.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/ui/screens/SettingsScreen.tsx`, `src/ui/screens/SettingsScreen.test.tsx`, `CHANGELOG.md`

**Interfaces:**
- Consumes: `cloudflareHeaders()` (Task 2, kept in `vite.config.ts`).
- Produces: `UpdateToast({ needRefresh: boolean; offlineReady: boolean; onReload: () => void; onClose: () => void })`; `PwaStatus()` (rendered by `main.tsx` only, never in unit tests); global `__APP_VERSION__: string` (package version, or `process.env.CARTCRAFT_VERSION` when set; `'test'` under Vitest). Settings shows "CartCraft version X". The build emits `dist/sw.js`, `dist/workbox-*.js` and `dist/manifest.webmanifest`. Task 6 relies on the text "A new version of CartCraft is available.", the "Reload" button and "CartCraft version e2e-next".

- [ ] **Step 1: Install the PWA packages**

```bash
npm install -D vite-plugin-pwa@^1.3.0 workbox-window@^7.4.1 @vite-pwa/assets-generator@^1.0.4
```

Expected: "added ... packages" and no ERESOLVE error.

- [ ] **Step 2: Create the icon and generate the icon set**

Create `public/icon.svg` (full-bleed square; the cart stays inside the maskable safe zone, a circle of radius 40% around the center):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#064e3b"/>
  <g fill="none" stroke="#ecfdf5" stroke-width="28" stroke-linecap="round" stroke-linejoin="round">
    <path d="M112 144h40l44 184h184l36-128H176"/>
    <path d="M232 256l32 32 64-64"/>
  </g>
  <g fill="#ecfdf5">
    <circle cx="216" cy="384" r="24"/>
    <circle cx="352" cy="384" r="24"/>
  </g>
</svg>
```

Create `pwa-assets.config.ts`:

```ts
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
```

Add to `package.json` `scripts`:

```json
    "icons": "pwa-assets-generator"
```

Run: `npm run icons && ls public`
Expected: "PWA assets generated", and `public/` holds `apple-touch-icon-180x180.png favicon.ico icon.svg maskable-icon-512x512.png pwa-192x192.png pwa-512x512.png pwa-64x64.png`. Open `public/maskable-icon-512x512.png`: a white cart with a check mark on dark green, edge to edge, with no white border.

- [ ] **Step 3: Write the failing UpdateToast test**

Create `src/ui/components/UpdateToast.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UpdateToast } from './UpdateToast';

describe('UpdateToast', () => {
  it('renders nothing when there is no news', () => {
    const { container } = render(<UpdateToast needRefresh={false} offlineReady={false} onReload={vi.fn()} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers a reload when a new version is waiting', async () => {
    const onReload = vi.fn();
    const onClose = vi.fn();
    render(<UpdateToast needRefresh offlineReady={false} onReload={onReload} onClose={onClose} />);
    expect(screen.getByRole('status')).toHaveTextContent('A new version of CartCraft is available.');
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('says when the app is ready to work offline', async () => {
    const onClose = vi.fn();
    render(<UpdateToast needRefresh={false} offlineReady onReload={vi.fn()} onClose={onClose} />);
    expect(screen.getByRole('status')).toHaveTextContent('CartCraft now works offline.');
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run src/ui/components/UpdateToast.test.tsx`
Expected: FAIL with "Cannot find module './UpdateToast'" (or "Failed to load url ./UpdateToast").

- [ ] **Step 5: Implement UpdateToast**

Create `src/ui/components/UpdateToast.tsx`. It sits at the top of the screen: at the bottom it covered the floating "Build list" button during the dry run.

```tsx
interface Props {
  needRefresh: boolean;
  offlineReady: boolean;
  onReload: () => void;
  onClose: () => void;
}

/** Non-blocking notice from the service worker, at the top so it never covers Build list or the undo toast. Never reloads by itself. */
export function UpdateToast({ needRefresh, offlineReady, onReload, onClose }: Props) {
  if (!needRefresh && !offlineReady) return null;
  return (
    <div role="status" className="fixed inset-x-4 top-16 z-40 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
      <p className="flex-1">{needRefresh ? 'A new version of CartCraft is available.' : 'CartCraft now works offline.'}</p>
      {needRefresh && (
        <button type="button" onClick={onReload} className="font-semibold text-emerald-300">Reload</button>
      )}
      <button type="button" onClick={onClose} className="text-slate-300">{needRefresh ? 'Later' : 'OK'}</button>
    </div>
  );
}
```

Run: `npx vitest run src/ui/components/UpdateToast.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 6: Write the failing version test**

In `src/ui/screens/SettingsScreen.test.tsx`, add as the first test inside `describe('SettingsScreen', () => {`:

```tsx
  it('shows the app version', async () => {
    renderRoutes(routes, '/settings');
    expect(await screen.findByText('CartCraft version test')).toBeInTheDocument();
  });
```

Run: `npx vitest run src/ui/screens/SettingsScreen.test.tsx`
Expected: FAIL in "shows the app version": unable to find the text.

- [ ] **Step 7: Show the version**

Create `src/vite-env.d.ts`:

```ts
/** Set by vite.config.ts (and vitest.config.ts) from package.json. */
declare const __APP_VERSION__: string;
```

In `vitest.config.ts`, add a `define` entry so the whole file reads:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify('test') },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
  },
});
```

In `src/ui/screens/SettingsScreen.tsx`, in the Storage section, replace:

```tsx
          {usage}
        </p>
      </Section>
```

with:

```tsx
          {usage}
        </p>
        <p className="text-xs text-slate-400">CartCraft version {__APP_VERSION__}</p>
      </Section>
```

Run: `npx vitest run src/ui/screens/SettingsScreen.test.tsx`
Expected: PASS.

- [ ] **Step 8: Register the service worker from React**

Create `src/ui/PwaStatus.tsx`:

```tsx
import { useRegisterSW } from 'virtual:pwa-register/react';
import { UpdateToast } from './components/UpdateToast';

const HOUR = 60 * 60 * 1000;

/** Registers the service worker and shows its notices. Only rendered by main.tsx (not in tests). */
export function PwaStatus() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Installed apps can stay open for days; look for a new version every hour.
      if (registration) setInterval(() => void registration.update().catch(() => undefined), HOUR);
    },
  });

  return (
    <UpdateToast
      needRefresh={needRefresh}
      offlineReady={offlineReady}
      onReload={() => void updateServiceWorker(true)}
      onClose={() => {
        setNeedRefresh(false);
        setOfflineReady(false);
      }}
    />
  );
}
```

In `tsconfig.json`, change `"types"` to:

```json
    "types": [
      "node",
      "vite-plugin-pwa/react"
    ],
```

In `src/main.tsx`, add `import { PwaStatus } from './ui/PwaStatus';` after the `DbProvider` import, and render it inside `DbProvider`, after `</BrowserRouter>`:

```tsx
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
      <PwaStatus />
```

- [ ] **Step 9: Configure vite-plugin-pwa**

Replace `vite.config.ts`:

```ts
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
        theme_color: '#064e3b',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
```

In `index.html`, add after the `theme-color` meta tag:

```html
    <meta name="description" content="Turn saved recipes into one aisle-sorted shopping list." />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
```

- [ ] **Step 10: Verify the build**

Run: `npm run typecheck && npm run build`
Expected: no `tsc` output; the build log ends with a "PWA v1.3.0" block listing `mode generateSW`, about 15 precache entries, and `dist/sw.js` plus `dist/workbox-<hash>.js`.

Run: `grep -o '<script[^>]*>\|<link[^>]*manifest[^>]*>' dist/index.html`
Expected: exactly `<script type="module" crossorigin src="/assets/index-<hash>.js">` and `<link rel="manifest" href="/manifest.webmanifest">`. No inline script.

Run `npx wrangler dev --port 8788`, open http://localhost:8788 in Chrome. Expected: "CartCraft now works offline." appears near the top within a few seconds; DevTools > Application > Manifest shows the icons with no errors; DevTools > Application > Service workers shows `sw.js` activated; Settings shows "CartCraft version 0.1.0". Stop `wrangler dev`.

- [ ] **Step 11: Add the changelog line**

Under `### Added`, add:

```markdown
- Installable app that works offline after the first visit. When a new version is ready, a notice offers to reload (nothing changes until you choose), and Settings shows the version.
```

- [ ] **Step 12: Run everything and commit**

Run: `npm test`
Expected: 41 files, 477 tests PASS.

```bash
git add public pwa-assets.config.ts package.json package-lock.json vite.config.ts vitest.config.ts tsconfig.json index.html src/main.tsx src/vite-env.d.ts src/ui/PwaStatus.tsx src/ui/components/UpdateToast.tsx src/ui/components/UpdateToast.test.tsx src/ui/screens/SettingsScreen.tsx src/ui/screens/SettingsScreen.test.tsx CHANGELOG.md
git commit -m "feat(pwa): installable offline app with an update prompt"
```

---

### Task 4: Keep the screen on while shopping

**Files:**
- Create: `src/ui/useWakeLock.ts`, `src/ui/useWakeLock.test.tsx`, `src/ui/screens/ListWakeLock.test.tsx`
- Modify: `src/ui/screens/ListScreen.tsx`, `CHANGELOG.md`

**Interfaces:**
- Consumes: `settings.keepScreenOn` (already in `Settings` and `DEFAULT_SETTINGS`, default `false`), `updateSettings(db, patch)`, `useAsyncAction` (`act` in `ListScreen`).
- Produces: `wakeLockSupported(): boolean`; `useWakeLock(enabled: boolean): void`. A "Keep screen on" checkbox on the list screen, hidden when `navigator.wakeLock` is missing.

- [ ] **Step 1: Write the failing hook test**

Create `src/ui/useWakeLock.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock, wakeLockSupported } from './useWakeLock';

interface FakeSentinel {
  released: boolean;
  release: () => Promise<void>;
}

/** Installs a fake navigator.wakeLock; each request returns a new sentinel. */
function fakeWakeLock(request?: () => Promise<FakeSentinel>) {
  const sentinels: FakeSentinel[] = [];
  const impl = vi.fn(
    request ??
      (async () => {
        const sentinel: FakeSentinel = {
          released: false,
          release: vi.fn(async () => {
            sentinel.released = true;
          }),
        };
        sentinels.push(sentinel);
        return sentinel;
      }),
  );
  Object.defineProperty(navigator, 'wakeLock', { value: { request: impl }, configurable: true });
  return { request: impl, sentinels };
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock');
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('useWakeLock', () => {
  it('reports support from navigator.wakeLock', () => {
    expect(wakeLockSupported()).toBe(false);
    fakeWakeLock();
    expect(wakeLockSupported()).toBe(true);
  });

  it('does nothing while disabled', () => {
    const { request } = fakeWakeLock();
    renderHook(() => useWakeLock(false));
    expect(request).not.toHaveBeenCalled();
  });

  it('holds the screen lock while enabled and releases it when turned off', async () => {
    const { request, sentinels } = fakeWakeLock();
    const { rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    rerender({ on: false });
    await waitFor(() => expect(sentinels[0]?.released).toBe(true));
  });

  it('asks again when the page becomes visible after the browser dropped the lock', async () => {
    const { request, sentinels } = fakeWakeLock();
    renderHook(() => useWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    // The browser releases the lock itself when the page is hidden.
    sentinels[0]!.released = true;
    act(() => setVisibility('hidden'));
    expect(request).toHaveBeenCalledTimes(1);
    act(() => setVisibility('visible'));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it('ignores a refused lock (for example on low battery)', async () => {
    const { request } = fakeWakeLock(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    renderHook(() => useWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/useWakeLock.test.tsx`
Expected: FAIL with "Cannot find module './useWakeLock'" (or "Failed to load url").

- [ ] **Step 3: Implement the hook**

Create `src/ui/useWakeLock.ts`:

```ts
import { useEffect } from 'react';

/** Screen Wake Lock exists (secure context; iOS Home Screen apps from 18.4). */
export function wakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

/**
 * Keeps the screen on while `enabled`. The browser drops the lock whenever the page is hidden,
 * so it is requested again on visibilitychange. A refused request is ignored.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !wakeLockSupported()) return;
    let sentinel: WakeLockSentinel | null = null;
    let active = true;
    let requesting = false;

    const acquire = async () => {
      if (requesting || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      requesting = true;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (active) sentinel = next;
        else void next.release();
      } catch {
        // Refused (low battery, power saver, not allowed): the screen simply dims as usual.
      } finally {
        requesting = false;
      }
    };
    const onVisibility = () => void acquire();

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => undefined);
    };
  }, [enabled]);
}
```

Run: `npx vitest run src/ui/useWakeLock.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 4: Write the failing screen test**

Create `src/ui/screens/ListWakeLock.test.tsx`:

```tsx
// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createList } from '../../app/lists';
import { draftLinesFromText, saveRecipe } from '../../app/recipes';
import { getSettings, type CartCraftDb } from '../../data/db';
import { createTestDb, sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { ListScreen } from './ListScreen';

async function seededList(): Promise<{ db: CartCraftDb; listId: string }> {
  const db = createTestDb();
  const ids = sequentialIds('s');
  const text = '2 onions';
  const recipeId = await saveRecipe(db, { title: 'Soup', rawText: text, baseServings: 4, ingredients: draftLinesFromText(text, ids) }, 1, ids);
  const listId = await createList(db, [{ recipeId, targetServings: 4 }], Date.UTC(2026, 9, 1, 12), ids);
  return { db, listId };
}

const routes = [{ path: '/lists/:id', element: <ListScreen /> }];

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock');
});

describe('ListScreen keep screen on', () => {
  it('is hidden when the browser has no Screen Wake Lock', async () => {
    const { db, listId } = await seededList();
    renderRoutes(routes, `/lists/${listId}`, db);
    expect(await screen.findByRole('button', { name: 'Onions: 2' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Keep screen on')).toBeNull();
  });

  it('saves the setting and holds the wake lock while on', async () => {
    const request = vi.fn(async () => ({ released: false, release: vi.fn(async () => undefined) }));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    const toggle = await screen.findByLabelText('Keep screen on');
    expect(toggle).not.toBeChecked();
    expect(request).not.toHaveBeenCalled();
    await user.click(toggle);
    await waitFor(async () => expect((await getSettings(db)).keepScreenOn).toBe(true));
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
  });
});
```

Run: `npx vitest run src/ui/screens/ListWakeLock.test.tsx`
Expected: "is hidden when..." PASS; "saves the setting..." FAIL (no element labelled "Keep screen on").

- [ ] **Step 5: Add the toggle to the list screen**

In `src/ui/screens/ListScreen.tsx`:

Add `import { updateSettings } from '../../data/db';` after the `../../app/listView` import, and `import { useWakeLock, wakeLockSupported } from '../useWakeLock';` after the `../useAsyncAction` import.

After `const [copied, setCopied] = useState(false);` add:

```tsx
  const [canWakeLock] = useState(wakeLockSupported);
```

Directly before the first `useEffect(` in the component (the one that clears `undoTimer` and `copiedTimer`), add:

```tsx
  useWakeLock(settings.keepScreenOn);

```

Replace:

```tsx
      {copied && <p role="status" className="text-sm text-emerald-700">Copied to clipboard</p>}
```

with:

```tsx
      {canWakeLock && (
        <label className="flex w-fit items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={settings.keepScreenOn}
            onChange={(e) => void act.run(() => updateSettings(db, { keepScreenOn: e.target.checked }))}
          />
          Keep screen on
        </label>
      )}
      {copied && <p role="status" className="text-sm text-emerald-700">Copied to clipboard</p>}
```

The hook lives only in `ListScreen`, so the lock is held only in shopping mode, and it is released when the user leaves the list.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/ui/screens/ListWakeLock.test.tsx src/ui/useWakeLock.test.tsx && npm run typecheck`
Expected: 7 tests PASS; no `tsc` output.

- [ ] **Step 7: Add the changelog line**

Under `### Added`, add:

```markdown
- "Keep screen on" on shopping lists stops the phone from dimming while you shop (where the browser supports it; on iPhone, in the installed app from iOS 18.4).
```

- [ ] **Step 8: Run everything and commit**

Run: `npm test`
Expected: 43 files, 484 tests PASS.

```bash
git add src/ui/useWakeLock.ts src/ui/useWakeLock.test.tsx src/ui/screens/ListWakeLock.test.tsx src/ui/screens/ListScreen.tsx CHANGELOG.md
git commit -m "feat(ui): keep the screen on while shopping"
```

---

### Task 5: iOS install banner

**Files:**
- Create: `src/ui/components/IosInstallBanner.tsx`, `src/ui/components/IosInstallBanner.test.tsx`
- Modify: `src/ui/Layout.tsx`, `CHANGELOG.md`

**Interfaces:**
- Produces: `IosInstallBanner({ standalone?: boolean })` (defaults to `navigator.standalone`, which only iOS and iPadOS WebKit define); `DISMISSED_KEY = 'cartcraft.iosInstallHintDismissed'` in `localStorage`. The dismissal is per device and browser on purpose, so it is not a setting and never goes into backups.

- [ ] **Step 1: Write the failing test**

Create `src/ui/components/IosInstallBanner.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { DISMISSED_KEY, IosInstallBanner } from './IosInstallBanner';

afterEach(() => localStorage.clear());

describe('IosInstallBanner', () => {
  it('explains separate storage and how to install in iOS Safari', () => {
    render(<IosInstallBanner standalone={false} />);
    expect(screen.getByRole('note')).toHaveTextContent(
      'On iPhone and iPad, Safari and the Home Screen app keep separate data. Install CartCraft first: tap Share, then Add to Home Screen, and add your recipes in the installed app.',
    );
  });

  it('stays hidden in the installed app and in browsers without navigator.standalone', () => {
    const { container, rerender } = render(<IosInstallBanner standalone />);
    expect(container).toBeEmptyDOMElement();
    rerender(<IosInstallBanner standalone={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('remembers when it was dismissed', async () => {
    const { container, unmount } = render(<IosInstallBanner standalone={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(container).toBeEmptyDOMElement();
    expect(localStorage.getItem(DISMISSED_KEY)).toBe('1');
    unmount();
    const again = render(<IosInstallBanner standalone={false} />);
    expect(again.container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/components/IosInstallBanner.test.tsx`
Expected: FAIL with "Cannot find module './IosInstallBanner'" (or "Failed to load url").

- [ ] **Step 3: Implement the banner**

Create `src/ui/components/IosInstallBanner.tsx`:

```tsx
import { useState } from 'react';

export const DISMISSED_KEY = 'cartcraft.iosInstallHintDismissed';

/** navigator.standalone exists only in iOS and iPadOS WebKit: false in a Safari tab, true when installed. */
function iosStandalone(): boolean | undefined {
  return (navigator as Navigator & { standalone?: boolean }).standalone;
}

/** Per device and browser on purpose, so it is kept out of settings (and out of backups). */
function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * iOS keeps Safari and Home Screen app storage apart, so recipes added in a Safari tab are
 * missing after installing. iOS has no install prompt, so this explains the manual steps.
 */
export function IosInstallBanner({ standalone = iosStandalone() }: { standalone?: boolean }) {
  const [dismissed, setDismissed] = useState(readDismissed);
  if (standalone !== false || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Storage blocked: the banner comes back next visit, which is harmless.
    }
  };

  return (
    <div role="note" className="mb-4 flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
      <p className="flex-1">
        On iPhone and iPad, Safari and the Home Screen app keep separate data. Install CartCraft first: tap Share, then
        Add to Home Screen, and add your recipes in the installed app.
      </p>
      <button type="button" onClick={dismiss} className="shrink-0 font-semibold">Got it</button>
    </div>
  );
}
```

Run: `npx vitest run src/ui/components/IosInstallBanner.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 4: Show it on every screen**

In `src/ui/Layout.tsx`, add `import { IosInstallBanner } from './components/IosInstallBanner';` after the `react-router` import, and render it first inside `<main>`:

```tsx
      <main className="mx-auto max-w-5xl px-4 py-6 pb-28 md:pb-10">
        <IosInstallBanner />
        <Outlet />
      </main>
```

- [ ] **Step 5: Add the changelog line**

Under `### Added`, add:

```markdown
- On iPhone and iPad in Safari, a banner explains that Safari and the installed app keep separate data and how to install CartCraft first.
```

- [ ] **Step 6: Run everything and commit**

Run: `npm test && npm run typecheck`
Expected: 44 files, 487 tests PASS; no `tsc` output.

```bash
git add src/ui/components/IosInstallBanner.tsx src/ui/components/IosInstallBanner.test.tsx src/ui/Layout.tsx CHANGELOG.md
git commit -m "feat(ui): iOS banner to install before adding recipes"
```

---

### Task 6: Playwright end-to-end tests

**Files:**
- Create: `playwright.config.ts`, `e2e/build.mjs`, `e2e/helpers.ts`, `e2e/offline.spec.ts`, `e2e/backup.spec.ts`, `e2e/headers.spec.ts`, `e2e/update.spec.ts`
- Modify: `package.json`, `package-lock.json`, `.gitignore`

**Interfaces:**
- Consumes: UI labels "Ingredients", "Parse ingredients", "Title", "Base servings", "Save recipe", "Select <title>", "Build list (N)", list rows named "<Item>: <amount>", "In cart (N)", "API key", "Save key", "Remove key", "Export backup", "Import file", "Replace my data", "Import complete."; `UpdateToast` text and "Reload" (Task 3); "CartCraft version X" (Task 3); `CARTCRAFT_VERSION` (Task 3); `dist/_headers` (Task 2); `wrangler dev` (Task 1).
- Produces: `npm run e2e`, 5 tests in Chromium covering spec 10.2 and acceptance criteria 1, 6, 8 and 10.

No changelog line: this task adds tests only.

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test@^1.63.0
npx playwright install chromium
```

Add to `package.json` `scripts`:

```json
    "e2e": "playwright test"
```

Append to `.gitignore`:

```gitignore

# Playwright
test-results
playwright-report
e2e/.next
e2e/.current
```

- [ ] **Step 2: Configure Playwright**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

const PORT = 8788;

/**
 * End-to-end tests run against the production build served by `wrangler dev` (static assets,
 * _headers and the /api Worker), in Chromium only: Playwright supports service workers only there.
 */
export default defineConfig({
  testDir: 'e2e',
  // The update test swaps the files in dist/, so tests never run in parallel.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'app', testIgnore: /update\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    // Runs last because it replaces the served build.
    { name: 'update', testMatch: /update\.spec\.ts/, dependencies: ['app'], use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `node e2e/build.mjs && npx wrangler dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
```

Create `e2e/build.mjs`:

```js
// Builds the app twice for the e2e tests: the next version into e2e/.next (for the update
// test), then the current version into dist/ (served by wrangler dev) and a copy in e2e/.current.
import { cpSync, rmSync } from 'node:fs';
import { build } from 'vite';

process.env.CARTCRAFT_VERSION = 'e2e-next';
await build({ logLevel: 'warn', build: { outDir: 'e2e/.next', emptyOutDir: true } });
delete process.env.CARTCRAFT_VERSION;
await build({ logLevel: 'warn' });
rmSync('e2e/.current', { recursive: true, force: true });
cpSync('dist', 'e2e/.current', { recursive: true });
```

Create `e2e/helpers.ts`:

```ts
import { expect, type Page } from '@playwright/test';

/** Waits until the service worker is installed and controls the page (it does after one reload). */
export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

/** Adds a recipe by pasting ingredient lines into the editor. */
export async function addRecipe(page: Page, title: string, ingredients: string, servings = '4'): Promise<void> {
  await page.goto('/recipes/new');
  await page.getByLabel('Ingredients').fill(ingredients);
  await page.getByRole('button', { name: 'Parse ingredients' }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Base servings').fill(servings);
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByText(title)).toBeVisible();
}
```

- [ ] **Step 3: Write the specs**

Create `e2e/offline.spec.ts` (acceptance criterion 1):

```ts
import { expect, test } from '@playwright/test';
import { addRecipe, waitForServiceWorker } from './helpers';

test('works offline after the first visit: recipes, building a list and checking items off', async ({ page, context }) => {
  await page.goto('/');
  await waitForServiceWorker(page);
  await addRecipe(page, 'Tomato soup', '2 onions\n1 cup milk\n800 g canned tomatoes');

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Tomato soup')).toBeVisible();

  await page.getByRole('button', { name: 'Select Tomato soup' }).click();
  await page.getByRole('button', { name: /Build list \(1\)/ }).click();
  await expect(page).toHaveURL(/\/lists\//);
  await page.getByRole('button', { name: 'Onions: 2' }).click();
  await expect(page.getByText('In cart (1)')).toBeVisible();

  // A deep link still opens offline (the service worker answers with index.html) and the check is saved.
  await page.reload();
  await expect(page.getByText('In cart (1)')).toBeVisible();
});
```

Create `e2e/backup.spec.ts` (acceptance criterion 6). The key typed here is a made-up test value for this app on localhost, used only to prove it never reaches the backup file:

```ts
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { addRecipe } from './helpers';

test('export from one browser and import into another, without the AI key', async ({ page, browser }, testInfo) => {
  await addRecipe(page, 'Pancakes', '2 cups flour\n2 eggs\n1 1/2 cups milk');
  await page.goto('/settings');
  // A made-up key, only to prove it never reaches the backup file.
  await page.getByLabel('API key').fill('sk-e2e-not-a-real-key');
  await page.getByRole('button', { name: 'Save key' }).click();
  await expect(page.getByRole('button', { name: 'Remove key' })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const file = testInfo.outputPath('backup.json');
  await (await download).saveAs(file);
  const text = await readFile(file, 'utf8');
  expect(text).toContain('Pancakes');
  expect(text).not.toContain('sk-e2e-not-a-real-key');

  // A fresh context has its own, empty IndexedDB: in effect a second browser.
  const other = await browser.newContext();
  const second = await other.newPage();
  await second.goto('/settings');
  await second.getByLabel('Import file').setInputFiles(file);
  await second.getByRole('button', { name: 'Replace my data' }).click();
  await expect(second.getByText('Import complete.', { exact: false })).toBeVisible();
  await second.goto('/');
  await expect(second.getByText('Pancakes')).toBeVisible();
  await other.close();
});
```

Create `e2e/headers.spec.ts` (acceptance criterion 10):

```ts
import { expect, test } from '@playwright/test';
import { addRecipe } from './helpers';

test('serves the CSP and caching headers', async ({ request }) => {
  const home = await request.get('/');
  const csp = home.headers()['content-security-policy'];
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain('https://api.deepseek.com');
  expect(home.headers()['cache-control']).toBe('no-cache');
  expect((await request.get('/sw.js')).headers()['cache-control']).toBe('no-cache');

  const deepLink = await request.get('/lists/abc');
  expect(deepLink.headers()['content-security-policy']).toBe(csp);
});

test('the app runs under the CSP without violations', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) violations.push(message.text());
  });
  page.on('pageerror', (error) => violations.push(error.message));

  await addRecipe(page, 'Salad', '1 head lettuce\n2 tomatoes');
  await page.getByRole('button', { name: 'Select Salad' }).click();
  await page.getByRole('button', { name: /Build list \(1\)/ }).click();
  await expect(page.getByRole('button', { name: 'Tomatoes: 2' })).toBeVisible();
  await page.getByRole('link', { name: 'Lists' }).first().click();
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await expect(page.getByText(/CartCraft version/)).toBeVisible();

  expect(violations).toEqual([]);
});
```

Create `e2e/update.spec.ts` (acceptance criterion 8):

```ts
import { cpSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { waitForServiceWorker } from './helpers';

/**
 * Copies a build over the one wrangler dev serves. Copy, not delete: wrangler watches dist/ and
 * Windows refuses to remove a watched folder. Leftover hashed files from the other build are unused.
 */
function serve(build: 'e2e/.next' | 'e2e/.current') {
  cpSync(build, 'dist', { recursive: true, force: true });
}

test.afterAll(() => serve('e2e/.current'));

test('a new deploy shows the update prompt, and Reload switches to it', async ({ page, request }) => {
  await page.goto('/settings');
  await waitForServiceWorker(page);
  const current = await page.getByText(/CartCraft version/).textContent();
  expect(current).not.toContain('e2e-next');

  serve('e2e/.next');
  const nextWorker = readFileSync('e2e/.next/sw.js', 'utf8');
  await expect.poll(async () => (await request.get('/sw.js')).text(), { timeout: 30_000 }).toBe(nextWorker);

  // The same check the app runs every hour.
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
  const toast = page.getByRole('status').filter({ hasText: 'A new version of CartCraft is available.' });
  await expect(toast).toBeVisible();
  // Nothing changes until the user agrees.
  await expect(page.getByText(current!)).toBeVisible();

  await toast.getByRole('button', { name: 'Reload' }).click();
  await expect(page.getByText('CartCraft version e2e-next')).toBeVisible();
});
```

- [ ] **Step 4: Run the suite**

First make sure no `wrangler dev` from an earlier step is still running (Playwright would reuse it and test a stale build). In PowerShell: `Get-NetTCPConnection -LocalPort 8788 -State Listen -ErrorAction SilentlyContinue` must print nothing; otherwise stop that process.

Run: `npm run e2e`
Expected: the two builds run (warnings about chunk size and zod comments are normal), then:

```
  ok 1 [app] › e2e\backup.spec.ts:5:1 › export from one browser and import into another, without the AI key
  ok 2 [app] › e2e\headers.spec.ts:4:1 › serves the CSP and caching headers
  ok 3 [app] › e2e\headers.spec.ts:16:1 › the app runs under the CSP without violations
  ok 4 [app] › e2e\offline.spec.ts:4:1 › works offline after the first visit: recipes, building a list and checking items off
  ok 5 [update] › e2e\update.spec.ts:15:1 › a new deploy shows the update prompt, and Reload switches to it
  5 passed
```

If "the app runs under the CSP" fails because a toast intercepts a click, the toast is covering a control: fix the toast position, not the test.

- [ ] **Step 5: Confirm unit tests are unaffected and commit**

Run: `npm test && npm run typecheck`
Expected: 44 files, 487 tests PASS (Vitest only includes `src/**`); no `tsc` output.

```bash
git add playwright.config.ts e2e package.json package-lock.json .gitignore
git commit -m "test(e2e): offline, backup round trip, CSP and update prompt in Chromium"
```

---

### Task 7: Docs, release 0.2.0, deploy and acceptance run

**Files:**
- Modify: `README.md`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `docs/superpowers/plans/2026-10-01-roadmap.md`

**Interfaces:**
- Consumes: everything above.
- Produces: `npm run deploy`; version 0.2.0; a deployed Worker at `https://cartcraft.<account-subdomain>.workers.dev`.

- [ ] **Step 1: Add the deploy script**

Add to `package.json` `scripts`:

```json
    "deploy": "npm run build && wrangler deploy"
```

Run: `npm run build && npx wrangler deploy --dry-run`
Expected: "Read 16 files from the assets directory", the bindings table with `env.IMPORT_LIMITER (10 requests/60s)` and `env.ASSETS`, then "--dry-run: exiting now." No login is needed for a dry run.

- [ ] **Step 2: Write the README**

Replace `README.md`:

````markdown
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
````

- [ ] **Step 3: Update the roadmap**

In `docs/superpowers/plans/2026-10-01-roadmap.md`:

Replace the Plan 5 table row with:

```markdown
| 5 | [PWA, security and deploy](2026-10-01-plan-5-pwa-security-deploy.md) | 6, 9.3, 9.4, 9.5, 10.2, 11 | Cloudflare Worker with static assets and rate-limit binding, `_headers` with CSP from `providerOrigins()`, vite-plugin-pwa with update prompt, iOS install banner, wake lock, Playwright e2e, deploy, acceptance run | 2, 3, 4 | Done (0.2.0, 487 unit tests, 5 e2e tests) |
```

Add these bullets at the end of "Decisions recorded while writing Plans 3 and 4" and rename that heading to "Decisions recorded while writing Plans 3 to 5":

```markdown
- Hosting (2026-10-01): Cloudflare Workers with static assets instead of Pages, because Cloudflare now recommends Workers for new projects. This replaces the Netlify comparison. The import endpoint moved to `worker/index.ts` and uses the Workers rate-limit binding (the in-memory limiter remains as a fallback).
- Fonts: the system font stack, so there are no web fonts to self-host.
- `@vite-pwa/assets-generator` stays on 1.x until vite-plugin-pwa accepts 2.x as a peer.
```

In "Open items carried into Plan 5", delete the line "Compare Cloudflare Pages with Netlify before the first public deploy (only `functions/api/import.ts` changes)." and rename the heading to "Open items".

- [ ] **Step 4: Cut release 0.2.0**

Run: `npm version 0.2.0 --no-git-tag-version`
Expected: prints `v0.2.0`; `package.json` and `package-lock.json` now say 0.2.0.

In `CHANGELOG.md`, rename `## [Unreleased]` to `## [0.2.0] - YYYY-MM-DD` (the date the release is cut) and insert a new empty section above it:

```markdown
## [Unreleased]

## [0.2.0] - YYYY-MM-DD
```

- [ ] **Step 5: Run everything and commit**

Run: `npm test && npm run typecheck && npm run build && npm run e2e`
Expected: 44 files, 487 tests PASS; no `tsc` output; build ends with the PWA block; 5 e2e tests pass.

```bash
git add README.md package.json package-lock.json CHANGELOG.md docs/superpowers/plans/2026-10-01-roadmap.md
git commit -m "chore(release): 0.2.0 with deploy docs"
```

- [ ] **Step 6: Deploy (the user runs this)**

Deploying publishes the app on the user's Cloudflare account. An agent stops here and asks the user to run:

```bash
npx wrangler login
npm run deploy
```

Expected: `wrangler deploy` uploads the assets and prints the Worker URL, `https://cartcraft.<subdomain>.workers.dev`. If the account has no workers.dev subdomain yet, Wrangler asks the user to pick one.

- [ ] **Step 7: Acceptance run on the deployed URL**

Check every spec section 11 criterion and record the result (pass, or what failed) in the PR description or the roadmap.

| # | Criterion | How to check |
|---|---|---|
| 1 | Offline after first visit | Covered by `e2e/offline.spec.ts`. On a phone: open the URL, install it, add a recipe, turn on airplane mode, open the installed app, build a list, check items off. |
| 2 | Same recipes and servings give identical lists | Covered by `src/domain/merge.test.ts` ("is deterministic"). In the app: build the same list twice and compare "Copy list as text" output. |
| 3 | Domain checklist tests pass | `npm test` |
| 4 | URL import and blocked-site fallback | Import `https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/`: the review table shows the lines and servings. Import a site that blocks bots: the form switches to paste mode with an explanation. |
| 5 | Everything except AI works without a key | With no key: AI buttons are disabled with "Add an AI key in Settings". |
| 6 | Export and import across browsers, no key in the file | Covered by `e2e/backup.spec.ts`. Manually: export on the desktop browser, import on the phone. |
| 7 | Undo last import restores exactly | Import a backup, then "Undo last import": the previous recipes and lists are back. |
| 8 | Update prompt | Covered by `e2e/update.spec.ts`. Live: make any small change, `npm run deploy`, reopen the app: "A new version of CartCraft is available." appears; Reload shows the new version in Settings. |
| 9 | `/api/import` rejects private targets | `curl -s -X POST https://cartcraft.<subdomain>.workers.dev/api/import -d '{"url":"http://127.0.0.1"}'` returns `{"ok":false,"error":"invalid_url"}`; also try `http://localhost`, `http://10.0.0.1` and `ftp://example.com`. Unit tests in `src/server/urlGuard.test.ts` cover redirects to private addresses. |
| 10 | CSP present, no violations | Covered by `e2e/headers.spec.ts`. Live: `curl -sI https://cartcraft.<subdomain>.workers.dev/ \| grep -i content-security-policy`, and the browser console shows no CSP errors while using every screen and "Test connection" with a real AI key. |

Phone-only checks: in iOS Safari (not installed) the install banner shows and "Got it" hides it; in the installed app "Keep screen on" appears on a list (iOS 18.4 or later) and the screen stays on.

---

## Done when

- `npm test` passes 487 tests in 44 files; `npm run typecheck` and `npm run build` succeed; `npm run e2e` passes 5 tests.
- `functions/` is gone; `npm run dev:api` serves the app and `/api/import` from `wrangler dev`.
- `dist/_headers` carries the CSP whose `connect-src` lists exactly the origins from `providerOrigins()`.
- Version 0.2.0 is released in `CHANGELOG.md`, deployed by the user, and the acceptance table in Task 7 Step 7 is filled in.
