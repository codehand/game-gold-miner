import { expect, test, type Page } from '@playwright/test';

test('boots one Phaser canvas and scene across a reload', async ({ page }) => {
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
  await assertSingleBoot(page);

  await page.reload();
  await assertSingleBoot(page);

  expect(browserErrors).toEqual([]);
});

async function assertSingleBoot(page: Page) {
  const canvas = page.locator('#app canvas');

  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveAttribute('width', '360');
  await expect(canvas).toHaveAttribute('height', '640');
  await expect(canvas).toHaveAttribute('data-boot-scene', 'BootScene');
  await expect(canvas).toHaveAttribute('data-boot-scene-starts', '1');
  await expect(canvas).toHaveAttribute('data-renderer', /^(canvas|webgl)$/);
}
