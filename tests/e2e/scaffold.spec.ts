import { expect, test } from '@playwright/test';

test('loads the application scaffold without browser errors', async ({ page }) => {
  const browserErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    browserErrors.push(error.message);
  });

  await page.goto('/');

  await expect(page).toHaveTitle('Cat Mine Idle');
  await expect(
    page.getByRole('heading', { name: 'Cat Mine Idle', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('Vite and TypeScript are ready.')).toBeVisible();
  expect(browserErrors).toEqual([]);
});
