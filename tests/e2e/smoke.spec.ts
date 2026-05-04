import { expect, test } from '@playwright/test';

test('shows login page', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /limpiador/i })).toBeVisible();
});
