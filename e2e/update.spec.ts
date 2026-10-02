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
