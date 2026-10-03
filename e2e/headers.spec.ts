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
  await page.getByRole('button', { name: /Build List \(1\)/ }).click();
  await page.getByRole('button', { name: 'Create list' }).click();
  await expect(page.getByRole('button', { name: 'Tomatoes: 2' })).toBeVisible();
  await page.getByRole('link', { name: 'Lists' }).first().click();
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await expect(page.getByText(/^\s*CartCraft \S+\s*$/)).toBeVisible();

  expect(violations).toEqual([]);
});
