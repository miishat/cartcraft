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
  await page.getByRole('button', { name: 'Export' }).click();
  const file = testInfo.outputPath('backup.json');
  await (await download).saveAs(file);
  const text = await readFile(file, 'utf8');
  expect(text).toContain('Pancakes');
  expect(text).not.toContain('sk-e2e-not-a-real-key');

  // A fresh context has its own, empty IndexedDB: in effect a second browser.
  const other = await browser.newContext();
  const second = await other.newPage();
  await second.goto('/settings');
  await second.getByLabel('Import').setInputFiles(file);
  await second.getByRole('button', { name: 'Replace my data' }).click();
  await expect(second.getByText('Import complete.', { exact: false })).toBeVisible();
  await second.goto('/');
  await expect(second.getByText('Pancakes')).toBeVisible();
  await other.close();
});
