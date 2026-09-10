import { expect, test } from '@playwright/test';

for (const touch of [false, true]) {
  test(`navigation artwork accepts ${touch ? 'touch' : 'mouse'} across its visible area`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 553, height: 934 }, hasTouch: touch });
    const page = await context.newPage();
    await page.goto('/');
    const canvas = page.locator('#game-viewport canvas');
    await expect(canvas).toHaveAttribute('data-boot-scene', 'BootScene');
    let presses = 0;
    let closes = 0;
    // Include a resize to catch CSS-to-canvas coordinate regressions.
    for (const viewport of [{ width: 553, height: 934 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      // Let Phaser process the resize before sending the next native pointer.
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
      const box = (await canvas.boundingBox())!;
      const items = JSON.parse((await canvas.getAttribute('data-bottom-navigation-items'))!) as Array<{
        key: string; bounds: { x: number; y: number; width: number; height: number };
      }>;
      for (const { key, bounds } of items) {
        // Visible chrome is 60% of the touch target. These points lie safely
        // within its rounded corners, on both sides of its center.
        for (const [dx, dy] of [[0, 0], [-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
          const x = box.x + (bounds.x + bounds.width * (0.5 + dx)) * box.width / 360;
          const y = box.y + (bounds.y + bounds.height * (0.5 + dy)) * box.height / 640;
          if (touch) await page.touchscreen.tap(x, y);
          else await page.mouse.click(x, y);
          await expect(canvas).toHaveAttribute('data-bottom-navigation-last-pressed', key);
          await expect(canvas).toHaveAttribute('data-bottom-navigation-press-count', String(++presses));
          if (key === 'shop') {
            await expect(page.getByRole('dialog', { name: 'Marketplace' })).toBeVisible();
            await page.getByRole('button', { name: 'Close marketplace' }).click();
            // `dialog.close()` queues its `close` event as a task, and
            // `MarketplaceModal`'s `#onClose()` callback — which re-enables
            // `this.input`, see `BootScene.ts` — only runs once that fires.
            // Clicking the canvas again before then lands on disabled input
            // and the press is silently dropped. The close-count diagnostic
            // is bumped inside that same callback, after input is
            // re-enabled, so waiting on it (rather than on dialog
            // invisibility, or nothing at all) is causal, not a timing guess.
            await expect(canvas).toHaveAttribute(
              'data-marketplace-close-count',
              String(++closes),
            );
          }
        }
      }
    }
    await context.close();
  });
}
