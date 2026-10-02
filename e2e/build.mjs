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
