# CartCraft research: app platform

Scope: browser persistence, PWA/offline, export/import, the URL-fetch Pages Function, BYO LLM key handling, shopping-list UX, and testing. Recipe parsing, units, aisles, JSON-LD extraction logic and LLM parsing are covered in `recipe-data-domain.md`.

Research date: 2026-10-01. Sources are official docs, specs and vendor help pages unless marked "(secondary)".

## Top takeaways for CartCraft

1. **Do** store app data in IndexedDB through a thin wrapper (Dexie or `idb`), not localStorage. web.dev says to avoid localStorage (synchronous, about 5 MB, strings only) and use IndexedDB. [web.dev](https://web.dev/articles/storage-for-the-web)
2. **Do** call `navigator.storage.persist()` after a meaningful user action (first saved recipe or list), and show the result in Settings. Chrome and Safari grant or deny silently based on engagement; Firefox prompts. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
3. **Do** treat installation as the durability story on iOS: Safari's 7-day ITP rule deletes script-writable storage for sites without interaction, while Home Screen web apps "have their own counter of days of use". [WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)
4. **Don't** assume Safari-tab data shows up in the installed iOS app. Storage is separate for each, so onboarding should say "install first, then add recipes", or point to export/import. [netguru (secondary)](https://www.netguru.com/blog/how-to-share-session-cookie-or-state-between-pwa-in-standalone-mode-and-safari-on-ios)
5. **Do** use vite-plugin-pwa with `registerType: 'prompt'` (the default) and `useRegisterSW` plus an hourly `r.update()`. autoUpdate can lose data in a tab where the user is mid-edit. [vite-pwa prompt](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html), [vite-pwa autoUpdate](https://vite-pwa-org.netlify.app/guide/auto-update.html), [vite-pwa React](https://vite-pwa-org.netlify.app/frameworks/react.html)
6. **Do** serve `/`, `/index.html`, `/sw.js` and `/manifest.webmanifest` with no long-lived or `immutable` caching (set this in Cloudflare `_headers`), or users get stuck on old versions. [vite-pwa deployment](https://vite-pwa-org.netlify.app/deployment/)
7. **Do** wrap exports in a versioned envelope (`{format, schemaVersion, exportedAt, data}`), validate imports with Zod `safeParse`, run migrations up to the current version, and only replace data after the user confirms and validation passes. Mealie's restore is destructive and warns about it, which is a good pattern to copy. [Mealie](https://mealie.io/documentation/getting-started/usage/backups-and-restoring/), [Zod](https://zod.dev/api)
8. **Do** export with a download anchor (Blob + `a[download]`) as the main path. Offer Web Share with files only when `navigator.canShare({files})` returns true, and share as `text/plain` or `.json`-named text: `application/json` is not on the shareable MIME list. [MDN share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)
9. **Do** make the Pages Function return only parsed Recipe JSON (never raw HTML), allow only `http(s)`, enforce byte and time limits, follow redirects manually with a cap, and rate-limit it. Without these it is an open proxy. [OWASP SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), [CF rate limit](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
10. **Do** stream the HTML through `HTMLRewriter` and collect only `script[type="application/ld+json"]` text, joining chunks until `lastInTextNode`. That keeps memory and CPU low enough for the free tier's 10 ms CPU budget. [HTMLRewriter](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
11. **Do** ship a strict CSP (no third-party scripts, `connect-src` limited to self plus the configured LLM origin), never log or export the key, and send the key only to the endpoint the user configured. Plain browsers are inherently exposed: the OpenAI SDK makes you opt into `dangerouslyAllowBrowser`. [openai-node](https://github.com/openai/openai-node)
12. **Do** add LLM guard rails: an `AbortController` timeout (about 30 to 60 s), an explicit `max_tokens`, no automatic retry loops, and one call per user action. The OpenAI SDK's defaults (10 min timeout, 2 retries) are too generous for a phone UI. [openai-node](https://github.com/openai/openai-node)
13. **Do** have checked items move to a "Done" section at the bottom (OurGroceries) with undo, a show/hide toggle (AnyList), and an optional double-tap to check (AnyList). Use row-sized touch targets. [OurGroceries](https://www.ourgroceries.com/user-guide), [AnyList](https://help.anylist.com/articles/cross-off-items/)
14. **Do** offer a "Keep screen on" toggle using the Screen Wake Lock API, re-acquired on `visibilitychange`. It only works in iOS Home Screen apps from iOS 18.4. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API), [WebKit 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)
15. **Do** test pure logic and components with Vitest + Testing Library (jsdom, `fake-indexeddb`), and test offline/PWA flows with Playwright on Chromium only, since Playwright supports service workers only in Chromium. [Vitest env](https://vitest.dev/guide/environment), [Playwright SW](https://playwright.dev/docs/service-workers)

---

## 1. Local persistence

### localStorage vs IndexedDB
- localStorage is synchronous and blocks the main thread, holds about 5 MB, stores only strings, and can't be used from workers. web.dev recommends IndexedDB with a promise wrapper such as `idb`. [web.dev](https://web.dev/articles/storage-for-the-web)
- CartCraft's data (hundreds of recipes, dozens of lists) fits in localStorage by size. The reasons to choose IndexedDB anyway: it doesn't block on large JSON stringify/parse, it supports transactional multi-store writes (for example "save list + update pantry"), and it has real schema versioning.
- **Recommendation: Dexie.** `db.version(n).stores()` plus `upgrade()` gives declarative migrations, and Dexie applies schema diffs between versions in sequence. Rule: "A version with an upgrader attached must never be altered." [Dexie versioning](https://dexie.org/docs/Tutorial/Design#database-versioning). Choose `idb` if you want the smallest dependency and are willing to write the upgrade switch yourself. [web.dev](https://web.dev/articles/storage-for-the-web)
- Use transactions for multi-step writes, so a closed tab never leaves half-applied state. [Dexie](https://dexie.org/docs/Tutorial/Design#database-versioning)
- Keep the LLM key in its own store (or a separate localStorage key) that the export code never reads. That makes "never exported" a structural guarantee, not a filter that someone can forget.

### Quotas and eviction
- Chrome/Edge: up to 60% of disk per origin. Firefox best-effort: the smaller of 10% of disk or 10 GiB. Safari 17+ (macOS 14 / iOS 17): about 60% for browser apps and Home Screen apps, about 15% for embedded WebViews. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- Under storage pressure, browsers evict best-effort origins in LRU order. Persistent origins are deleted only by the user. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- `navigator.storage.persist()`: Firefox prompts. Chrome, Edge and Safari decide silently from interaction history. Safari 17 added `persist()`/`persisted()`. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/)
- Use `navigator.storage.estimate()` for a usage readout in Settings. [web.dev](https://web.dev/articles/storage-for-the-web)
- Chrome research shows that eviction for regularly visited sites is very rare. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

### Safari / iOS specifics
- With ITP on, Safari deletes all script-writable storage (IndexedDB, localStorage, SW registrations, Cache) after 7 days of Safari use without user interaction on the site. Server-set cookies are exempt. [WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- Home Screen web apps "have their own counter of days of use", and WebKit says it does "not expect the first-party in such a web application to have its website data deleted". [WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)
- Home Screen apps get the same quota as Safari. [WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/)
- The Home Screen app's storage is **isolated from Safari's** (cookies, Web Storage, IndexedDB). Data added in a Safari tab is not visible after installing. [netguru (secondary)](https://www.netguru.com/blog/how-to-share-session-cookie-or-state-between-pwa-in-standalone-mode-and-safari-on-ios)
- Product implication: on iOS, nudge users to install before entering data, and show an "Export a backup" reminder (for example, if there has been no export in 30 days).

### Schema versioning and migrations
- Keep two version numbers. The IndexedDB/Dexie schema version covers stores and indexes. A `dataVersion` covers the shape of the records. Write each migration as a pure function `migrate_vN_to_vN+1(data)`, and use the same functions for (a) Dexie `upgrade()` and (b) old import files. Unit-test them with fixtures from each version.
- Never change an old Dexie version that has an upgrader. Add a new one. [Dexie](https://dexie.org/docs/Tutorial/Design#database-versioning)

### Multi-tab consistency
- If another tab opens a newer schema version, the old tab gets `versionchange`. Close the db and prompt a reload. [MDN versionchange](https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/versionchange_event). Dexie handles closing by default.
- For live data sync between tabs (for example, checking an item in one tab), use `BroadcastChannel` (Baseline since 2022, Safari included) to send "changed" notifications and re-read from IndexedDB. [MDN BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API). Dexie's `liveQuery` also tracks changes across tabs, which saves writing this by hand.
- After an import, broadcast a "data replaced" message so other tabs reload.

---

## 2. PWA offline (vite-plugin-pwa / Workbox)

### Setup
- `VitePWA({ registerType: 'prompt', manifest: {...}, workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] } })`. `prompt` is the default. [vite-pwa prompt](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html)
- React: `useRegisterSW` from `virtual:pwa-register/react` returns `offlineReady`, `needRefresh` and `updateServiceWorker`. Add `"types": ["vite-plugin-pwa/react"]`. Hook options are not reactive. [vite-pwa React](https://vite-pwa-org.netlify.app/frameworks/react.html)
- Periodic update check: `onRegistered(r) { setInterval(() => r.update(), 60*60*1000) }`. [vite-pwa React](https://vite-pwa-org.netlify.app/frameworks/react.html)
- Keep outdated-cache cleanup enabled (the default). [vite-pwa prompt](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html)
- Precache the whole app shell (it's a small SPA). Don't runtime-cache `/api/*`, because recipe fetch is online-only. Show a clear "You're offline, paste the recipe text instead" state.

### Update flow and stale versions
- `autoUpdate` sets `skipWaiting` and `clientsClaim` to true, and "The user can lose data in any browser windows/tabs in which the application is open and is filling in a form." Switching from autoUpdate to prompt later "can be a pain", so choose now. [vite-pwa autoUpdate](https://vite-pwa-org.netlify.app/guide/auto-update.html)
- Stale-version trap: if `sw.js` or `index.html` are cached by HTTP caching (or marked `immutable`), clients never see the new SW. Keep caching on those files "as low as possible". [vite-pwa deployment](https://vite-pwa-org.netlify.app/deployment/). Cloudflare Pages `_headers` example:
  ```
  /sw.js
    Cache-Control: no-cache
  /index.html
    Cache-Control: no-cache
  /manifest.webmanifest
    Cache-Control: no-cache
  /assets/*
    Cache-Control: public, max-age=31536000, immutable
  ```
  `_headers` does not apply to Pages Functions responses, so set headers in function code. [CF _headers](https://developers.cloudflare.com/pages/configuration/headers/)
- Show "Update available, reload" as a non-blocking toast. Never auto-reload while a list is being edited or checked off in store. Also show the app version in Settings so support questions can be answered.
- When the update also changes the Dexie schema, the new code migrates on first open, and old tabs get `versionchange` (see section 1).

### Manifest and iOS
- Minimum requirements: name, short_name, description, theme_color (must match the `<meta name="theme-color">`), icons at 192 and 512 (plus maskable), apple-touch-icon 180x180, HTTPS, manifest served as `application/manifest+json`. [vite-pwa minimal requirements](https://vite-pwa-org.netlify.app/guide/pwa-minimal-requirements.html), [web.dev manifest](https://web.dev/learn/pwa/web-app-manifest)
- `@vite-pwa/assets-generator` can generate the icon set from one SVG. [vite-pwa guide](https://vite-pwa-org.netlify.app/guide/)
- iOS doesn't support `beforeinstallprompt`, so there is no programmatic install. Show a manual "Share > Add to Home Screen" hint when `navigator.standalone` is false on iOS. Safari historically relied on `apple-touch-icon` rather than manifest icons. [web.dev manifest](https://web.dev/learn/pwa/web-app-manifest)

---

## 3. Export / import

### File format
- Envelope:
  ```json
  { "format": "cartcraft-backup", "schemaVersion": 3, "exportedAt": "2026-10-01T12:00:00Z",
    "app": { "version": "1.4.0" },
    "data": { "recipes": [], "lists": [], "pantry": [], "aisles": {}, "settings": {} } }
  ```
  Check the `format` magic string first, so dropping some other JSON file produces a clear error.
- Import pipeline: read file (size cap, for example 10 MB) > `JSON.parse` in try/catch > check envelope > if `schemaVersion < current`, run migrations; if `> current`, refuse with "Update CartCraft first" > Zod `safeParse` against the current schema > show summary ("42 recipes, 3 lists. This replaces everything on this device") > confirm > one Dexie transaction that clears and writes everything > broadcast to other tabs.
- Zod 4: `safeParse` returns `{success, data|error}` without throwing. `z.object` strips unknown keys by default (good for forward compatibility with fields this version doesn't know), and `z.strictObject` rejects them. Use the default stripping on import. [Zod API](https://zod.dev/api)
- Don't trust imported data: strings render as text only (no `dangerouslySetInnerHTML`), URLs are checked to start with `http(s):` before being used as links, IDs are regenerated or checked for uniqueness, and numbers are bounded (servings 1 to 100). Strip any `apiKey`-like field in settings, even if one is present in the file.
- Take an automatic pre-import snapshot (the current data kept as a JSON blob in IndexedDB), so "Undo import" is possible. Import is destructive by product decision. A one-step undo makes it safe.
- Comparable apps: Mealie backups are a zip containing `database.json`, restore "will delete all data in the database", and newer versions error on version mismatch instead of breaking. [Mealie](https://mealie.io/documentation/getting-started/usage/backups-and-restoring/). Paprika's `.paprikarecipes` is a zip of per-recipe gzipped JSON. [Paprika help](https://www.paprikaapp.com/help/ios/), [format notes (secondary)](https://yabukurosawa.wordpress.com/2012/09/30/paprika-recipe-manager-for-ipad-export-format/). Tandoor exports a zip of per-recipe zips and requires the archive itself, not extracted JSON. [Tandoor](https://docs.tandoor.dev/features/import_export/). KitchenOwl is server-synced, so its backups are server-side. CartCraft has no images, so plain `.json` is enough. Don't zip.

### Download / upload on mobile
- Primary export: `URL.createObjectURL(new Blob([json], {type:'application/json'}))` plus `<a download="cartcraft-YYYY-MM-DD.json">`. This works in iOS Safari (saves to Files through the download manager) and Android Chrome (Downloads).
- Secondary "Share" button: `navigator.share({files:[file]})` needs transient activation (a direct click) and must be feature-detected with `navigator.canShare({files})`. Handle `AbortError` (user cancelled) silently. `application/json` is not in the spec's shareable MIME list. `text/plain` is, so create the `File` as `text/plain` with a `.json` name if share fails. [MDN share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)
- Import: `<input type="file" accept="application/json,.json,text/plain">`. iOS can grey out `.json` files with strict MIME accept lists, so include the extension and `text/plain`. Also offer "Paste JSON" in a textarea as a fallback that always works.

---

## 4. URL-fetch Pages Function

### Platform facts
- File-based routing: `functions/api/fetch-recipe.ts` serves `/api/fetch-recipe`. Use `_routes.json` so only `/api/*` invokes Functions (exclude takes priority over include, max 100 rules). [CF routing](https://developers.cloudflare.com/pages/functions/routing/)
- Free tier: Functions requests count toward the Workers Free quota of 100,000 per day, shared with Workers. Static asset requests are free and unlimited. [CF Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- Workers Free: 10 ms CPU per request, 50 subrequests per request, 128 MB memory, no wall-clock limit while the client is connected. Over the daily limit you get error 1027. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/). Waiting on network I/O doesn't count as CPU, but parsing a 2 MB page with regex or `JSON.parse` can. That's another reason to use HTMLRewriter.
- Local dev: `npx wrangler pages dev dist` on port 8788. [CF local dev](https://developers.cloudflare.com/pages/functions/local-development/). For HMR, run Vite and proxy `/api` in `vite.config.ts` to `localhost:8788` (common setup, not documented on that page). Alternatively, Cloudflare's Vite plugin can host Workers code; check whether it supports Pages Functions before adopting it.

### HTMLRewriter extraction
- Handler: `.on('script[type="application/ld+json"]', { text(chunk) { buf += chunk.text; if (chunk.lastInTextNode) { blocks.push(buf); buf = '' } } })`. Text can arrive in several chunks, so concatenate until `lastInTextNode`. [HTMLRewriter](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/)
- Once a Recipe has been found, or after N bytes, stop reading: wrap the upstream body in a byte-counting `TransformStream` that errors past the cap (for example 3 MB). Any parsing beyond finding the JSON-LD belongs to the recipe-data doc.

### Security (SSRF and open proxy)
- Accept only `http:`/`https:`, reject credentials in the URL (`user:pass@`), allow only ports 80 and 443, and reject IP-literal hosts and `localhost`/`.local`/`.internal` names. OWASP lists blocking loopback, RFC1918, link-local and metadata addresses, guarding against DNS rebinding, and disabling automatic redirects. [OWASP SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- Workers run on Cloudflare's edge, not in a VPC with a metadata service, so classic SSRF impact is lower. Community reports say Workers refuse direct-IP `fetch()`, but a hostname that resolves to a private IP isn't blocked by your own string check. [CF community (secondary)](https://community.cloudflare.com/t/exception-when-fetching-url-with-ip-hostname-in-workers/595868). Still validate. The main real risk is **open-proxy abuse**, not internal access.
- Use `redirect: 'manual'`, follow at most 3 redirects, and re-validate each `Location`.
- Return **only** `{ recipe: <normalized JSON-LD Recipe> }` or a typed error. Never pass through upstream HTML, headers or status. That alone makes the endpoint useless as a general proxy.
- Timeouts: `AbortSignal.timeout(8000)` on the upstream fetch. Check `content-type` includes `text/html`, and reject other types early.
- Rate limiting: the Workers Rate Limiting binding allows `limit` per `period` (10 or 60 s), keyed by any string. It is per Cloudflare location and eventually consistent, so it is "not an accurate accounting system". [CF rate limit](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/). Key on `CF-Connecting-IP` (for example 20 per 60 s). Confirm the binding is available to Pages Functions on the current plan. A dashboard WAF rate-limit rule on `/api/*` is the fallback. Optionally require a same-origin `Origin` header (it stops casual cross-site embedding, though not curl).
- Optional: cache successful parses with the Cache API keyed by normalized URL, to absorb repeats.

### User-Agent and bot blocking
- Send an honest browser-like UA plus an app identifier, `Accept: text/html`, and `Accept-Language`. Many recipe sites sit behind Cloudflare/Akamai bot management. A Worker's requests can be flagged as bots, sometimes even by other Cloudflare zones. [CF community (secondary)](https://community.cloudflare.com/t/worker-identified-as-a-bot-any-ideas/388999)
- Don't try to evade bot checks (no CAPTCHA solving, no rotating UAs). On 403/429/challenge pages, return `{error:'blocked'}`, and the UI offers "Paste the recipe text" or the bookmarklet-free path: copy the page text into the LLM/plain parser. Design this fallback as a first-class flow, because a meaningful share of popular sites will block it.

---

## 5. Browser-side LLM key handling

### Risks
- Any XSS on the origin can read localStorage or IndexedDB, so the key is only as safe as the app's script integrity. The OpenAI SDK requires `dangerouslyAllowBrowser: true` precisely because client-side keys are exposed to anyone who can run script there. [openai-node](https://github.com/openai/openai-node). For BYO-key, the "attacker" is mostly third-party script or injected content, not the user.
- Recipe text and imported JSON are untrusted input, and LLM output is untrusted too. Render everything as text.

### Mitigations
- CSP in `_headers` for the static site, for example `default-src 'self'; script-src 'self'; connect-src 'self' https://api.deepseek.com; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`. Because the endpoint is user-configurable (OpenAI-compatible), either widen `connect-src` to `https:` (weaker but practical) or tell users that custom endpoints need a rebuild. Decide explicitly. [CF _headers](https://developers.cloudflare.com/pages/configuration/headers/)
- No third-party scripts (no analytics or CDN scripts). The old Tailwind CDN script is exactly this risk, which is one reason to install Tailwind with `@tailwindcss/vite`. [Tailwind Vite](https://tailwindcss.com/docs/installation/using-vite)
- Key UX: password-type input, "Test key" button, "Forget key" button, a note that the key is stored only on this device and sent only to the endpoint shown. Never put it in URLs, error messages, console logs, Sentry-like reporters, or exports.
- Keep the key out of React state that devtools or error boundaries might serialize. Read it from storage at call time.
- Call the LLM directly with `fetch` rather than pulling in a large SDK.

### Timeouts and cost guard rails
- `AbortController` with a 45 s timeout and a visible Cancel button. Set `max_tokens` explicitly. No automatic retries on 4xx. At most one retry on network error, and only by user action.
- Cap input size (for example, truncate recipe text to about 20k characters) and show an estimated token count before sending large inputs.
- The OpenAI SDK defaults (10 min timeout, 2 retries on 408/409/429/5xx) show why explicit limits matter. [openai-node](https://github.com/openai/openai-node)
- Show which model and endpoint were used. Keep a local counter of calls this month (no cost API needed).

---

## 6. Shopping-list UX

- **Check-off behavior.** OurGroceries crosses the item off and moves it to the bottom, "so that it's not in your way", with configurable crossed-off ordering (alphabetical, recently crossed off). [OurGroceries user guide](https://www.ourgroceries.com/user-guide). AnyList keeps crossed-off items visible by default with an eye-icon show/hide toggle. [AnyList show/hide](https://help.anylist.com/articles/show-hide-completed-items/). AnyList also offers a setting that makes crossing off require a double tap, to prevent accidental taps. [AnyList cross-off](https://help.anylist.com/articles/cross-off-items/). Undoing a crossed-off item is a documented help topic. [AnyList restore](https://help.anylist.com/articles/restore-crossed-off-item/)
  - **CartCraft:** strike through and move to a collapsible "In cart (n)" section at the bottom of the list (not the bottom of each aisle), with a short animation so the user sees where it went. Tap again to restore. Show an undo toast for about 4 s. Add an optional double-tap setting.
- **Aisle order.** OurGroceries remembers the order and categories, so the next list follows your store walk. [OurGroceries](https://www.ourgroceries.com/user-guide). KitchenOwl lets users create categories and order them to match the store. [KitchenOwl features](https://kitchenowl.org/features/), [KitchenOwl discussion](https://github.com/TomBursch/kitchenowl/discussions/3)
  - **CartCraft:** a user-reorderable aisle list in Settings (drag handle plus up/down buttons for accessibility), stored as an ordered array. Unknown items go in "Other" at the end. Moving an item to an aisle teaches the personal aisle dictionary (that logic belongs to the recipe-data doc).
- **One-handed use.** Make the whole row the hit target, at least 44 to 48 px high (Apple HIG 44pt, Material 48dp). Put primary actions (add item, show/hide done) at the bottom within thumb reach. Avoid swipe-only actions. Keep a sticky aisle header. Use large text by default in shopping mode.
- **Screen Wake Lock.** Baseline 2025, secure context only, released automatically when the page is hidden, so re-request on `visibilitychange`. Can be rejected (low battery). [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API). iOS: works in Safari since 16.4, but was broken in Home Screen web apps until iOS/iPadOS 18.4. [WebKit 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/), [WebKit bug 254545](https://bugs.webkit.org/show_bug.cgi?id=254545). Make it an opt-in toggle in shopping mode, feature-detect `'wakeLock' in navigator`, and fail silently.
- Persist check state on every tap (IndexedDB write), so a crash or reload in store loses nothing.

---

## 7. Testing

- **Unit (Vitest, node environment):** quantity math and consolidation, migrations `vN > vN+1` with fixture files for each version, the import validator (malformed, future version, extra keys, API key stripping), export envelope round-trip, aisle sorting, URL validation for the function (private hosts, schemes, redirect limits), and the HTMLRewriter handler. Workers code can be tested with `@cloudflare/vitest-pool-workers` or by testing pure helpers in node.
- **Component (Vitest + jsdom + Testing Library):** set `environment: 'jsdom'` globally or per file with `// @vitest-environment jsdom`. Vitest Browser Mode is a separate test project if real-browser behavior is needed. [Vitest env](https://vitest.dev/guide/environment). Use `fake-indexeddb/auto` so Dexie works in jsdom. Test check-off/undo, the import confirm dialog, settings key masking, and that the key never appears in exported JSON.
- **E2E (Playwright, against `vite build && vite preview`, or `wrangler pages dev dist` to include the function):**
  - Offline: load, wait for SW activation (`context.waitForEvent('serviceworker')`, then wait until it controls the page), `context.setOffline(true)`, reload, open a saved list, check items, reload, assert state persisted. [Playwright SW](https://playwright.dev/docs/service-workers)
  - Update prompt: build twice with different versions and assert the toast appears.
  - Export/import: `page.waitForEvent('download')`, then `setInputFiles` on the import input.
  - Service workers are supported only in Chromium, so run PWA specs on Chromium, block SWs (`serviceWorkers: 'block'`) for the other specs, and do manual iOS checks on a real device. [Playwright SW](https://playwright.dev/docs/service-workers)
  - Mock the LLM endpoint and `/api/fetch-recipe` with `page.route` in e2e. Never call real APIs in CI.
- Rule of thumb: logic and data integrity in unit tests (fast, many). Two or three critical journeys in e2e (add recipe > build list > shop offline; export > import on a fresh context; update flow).

---

## Gotchas checklist

- [ ] `sw.js`, `index.html` and the manifest are served with `Cache-Control: no-cache`. Only hashed `/assets/*` are immutable. [vite-pwa deployment](https://vite-pwa-org.netlify.app/deployment/)
- [ ] `registerType: 'prompt'` is chosen before the first production deploy. [vite-pwa autoUpdate](https://vite-pwa-org.netlify.app/guide/auto-update.html)
- [ ] An hourly `registration.update()` runs, since installed PWAs can stay open for days.
- [ ] `navigator.storage.persist()` is requested after real engagement, and the result is shown.
- [ ] iOS: the app tells users that Safari-tab data and installed-app data are separate.
- [ ] iOS: the install hint is manual (no `beforeinstallprompt`).
- [ ] The Wake Lock toggle is feature-detected and re-acquired on `visibilitychange`. Older iOS Home Screen apps silently lack it.
- [ ] The export filename has a date. The share fallback uses `text/plain`, and `canShare` is checked first.
- [ ] The import `accept` includes `.json` and `text/plain`. There is a paste fallback.
- [ ] Import refuses `schemaVersion` newer than the app's.
- [ ] Import strips any key-like setting. Export never reads the key store.
- [ ] Dexie versions with upgraders are never edited. `versionchange` triggers a reload prompt.
- [ ] `_headers` does not apply to Function responses, so set them in code. [CF _headers](https://developers.cloudflare.com/pages/configuration/headers/)
- [ ] The function has: scheme/port/host checks, manual redirects re-validated, a timeout, a byte cap, a content-type check, JSON-only output, and a rate limit.
- [ ] The HTMLRewriter text handler concatenates chunks until `lastInTextNode`.
- [ ] `_routes.json` limits Functions to `/api/*`, so static hits stay free.
- [ ] The CSP has no `unsafe-inline` scripts. Verify that Vite's build output and vite-plugin-pwa's registration script comply (use `injectRegister: 'script'` or `null` with manual registration if needed).
- [ ] The Playwright PWA tests run on Chromium only.

## Anti-patterns to avoid

- Storing everything as one big localStorage JSON string that is rewritten on every checkbox tap.
- `autoUpdate` with `skipWaiting` in an app where users edit lists mid-shop.
- Long `max-age` or `immutable` on `sw.js`/`index.html` (the classic "users stuck on old version" bug).
- Importing by `Object.assign`-ing parsed JSON into state without validation or migration.
- Merging on import silently. The decision is replace-with-confirm, so do not half-merge.
- A fetch function that returns upstream HTML or proxies arbitrary content types (an open proxy).
- Following redirects automatically after validating only the first URL.
- Trying to defeat bot protection on recipe sites.
- Loading any third-party script (Tailwind CDN, analytics, fonts JS) on an origin that holds an API key.
- Logging request objects that include the `Authorization` header.
- Swipe-only or tiny checkbox-only hit targets in shopping mode.
- Holding a Wake Lock all the time instead of only in shopping mode.
- E2E-testing every edge case. Keep those in unit tests.

## Risks to settled decisions

1. **iOS storage separation vs "each device keeps its data locally".** On iPhone, Safari and the installed app are effectively two "devices" with separate storage. A user who adds recipes in Safari and then installs will see an empty app. Mitigation: install-first onboarding plus export/import. Doesn't change the decision, but the UX must address it. [netguru (secondary)](https://www.netguru.com/blog/how-to-share-session-cookie-or-state-between-pwa-in-standalone-mode-and-safari-on-ios)
2. **Non-installed iOS use and the 7-day eviction.** Users who never install and don't open the site for a week of Safari use can lose everything. With no sync, export is the only backup. Mitigation: backup reminders, and a persistent banner on iOS when not standalone. [WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)
3. **Import replaces all data.** This is fine as decided, but without a pre-import snapshot a mistaken import (old phone file onto a newer desktop) is unrecoverable. Recommend an automatic local snapshot plus "Undo last import". This doesn't change the decision.
4. **The URL fetch function on the free tier.** The 10 ms CPU limit can be exceeded by large pages if they are parsed non-streaming, and bot protection will block some sites no matter what. The URL-import feature needs the paste-text fallback as an equal path, not an afterthought. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
5. **The function is a public endpoint.** Even with JSON-only output, anyone can burn the shared 100k/day quota (which also covers other Workers on the account). Rate limiting is per location and approximate. Acceptable for a personal app. Revisit if it is shared widely. [CF pricing](https://developers.cloudflare.com/pages/functions/pricing/), [CF rate limit](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
6. **User-configurable OpenAI-compatible endpoint vs a strict CSP.** A tight `connect-src` conflicts with letting users enter any endpoint. Choose between `connect-src https:` (weaker) and an allowlist of known providers plus a documented limitation.
7. **Cloudflare vs Netlify comparison (pending).** Several items here are Cloudflare-specific (`_routes.json`, HTMLRewriter, the rate-limit binding, the 10 ms CPU budget). Netlify Functions have different limits and no HTMLRewriter, so the extraction code should sit behind a small interface (`fetchAndExtract(url): Recipe`) to keep the host swappable.
8. **Wake Lock on iOS.** Only iOS 18.4+ Home Screen apps support it. Older iPhones will dim mid-shop. Treat it as a progressive enhancement, not a promised feature. [WebKit 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)
