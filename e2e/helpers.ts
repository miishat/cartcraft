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
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(title)).toBeVisible();
}
