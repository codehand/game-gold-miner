import { expect, test } from '@playwright/test';

const ICONS = [
  ['role-elevator', '#8ee5e3'],
  ['role-warehouse', '#8ee5e3'],
  ['role-miner', '#8ee5e3'],
  ['attribute-power', '#f4bd3e'],
  ['attribute-speed', '#f4bd3e'],
  ['attribute-capacity', '#f4bd3e'],
  ['attribute-efficiency', '#f4bd3e'],
  ['skill-lift-mastery', '#c8a2ff'],
  ['skill-storage-mastery', '#c8a2ff'],
  ['skill-mining-mastery', '#c8a2ff'],
  ['state-idle', '#a9c4db'],
  ['state-assigned', '#a9c4db'],
  ['state-listed', '#a9c4db'],
  ['state-rented', '#a9c4db'],
  ['state-locked', '#f8d77c'],
  ['state-rental-expiring', '#f8d77c'],
] as const;

test('renders the Marketplace icon family at native 24px and 32px sizes', async ({ page }) => {
  await page.goto('/');
  await page.evaluate((icons) => {
    document.body.innerHTML = `
      <main style="display:grid;grid-template-columns:repeat(8,40px);gap:18px;padding:24px;background:#101f32;color:#8ee5e3">
        ${icons.map(([id, color]) => `
          <svg width="24" height="24" viewBox="0 0 24 24" data-icon="${id}" style="color:${color}">
            <use href="/assets/marketplace/icons/marketplace-icons.svg#${id}"></use>
          </svg>
          <svg width="32" height="32" viewBox="0 0 24 24" data-icon-large="${id}" style="color:${color}">
            <use href="/assets/marketplace/icons/marketplace-icons.svg#${id}"></use>
          </svg>
        `).join('')}
      </main>
    `;
  }, ICONS);

  await page.waitForFunction(() => {
    return Array.from(document.querySelectorAll('use')).every((element) => {
      const box = element.getBBox();
      return box.width > 0 && box.height > 0;
    });
  });

  await expect(page.locator('[data-icon]')).toHaveCount(ICONS.length);
  await expect(page.locator('[data-icon-large]')).toHaveCount(ICONS.length);
  expect(await page.locator('[data-icon]').evaluateAll((elements) => (
    elements.every((element) => {
      const box = element.getBoundingClientRect();
      return box.width === 24 && box.height === 24;
    })
  ))).toBe(true);
  expect(await page.locator('[data-icon-large]').evaluateAll((elements) => (
    elements.every((element) => {
      const box = element.getBoundingClientRect();
      return box.width === 32 && box.height === 32;
    })
  ))).toBe(true);

  await page.screenshot({ path: 'test-results/marketplace-icons.png', fullPage: true });
});
