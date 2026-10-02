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
