# CartCraft

Turn a set of saved recipes into one consolidated, aisle-sorted shopping list.

Everything runs in your browser and works offline. Data stays on the device; use Settings > Backup to move it between devices.

## Run locally

Prerequisites: Node.js 22

```bash
npm install
npm run dev
```

The app runs at http://localhost:3000.

## Checks

```bash
npm test
npm run typecheck
npm run build
```

## Layout

- `src/domain/`: pure parsing, scaling, merging, formatting and aisle logic
- `src/data/`: IndexedDB schema (Dexie) and backup format
- `src/app/`: use cases that combine domain and storage
- `src/ui/`: React screens

Design: `docs/superpowers/specs/2026-10-01-cartcraft-rewrite-design.md`. Plans: `docs/superpowers/plans/`.
