import { openIntroMine } from '../helpers/openIntroMine';
import { expect, test } from '@playwright/test';

for (const count of [1, 5]) {
  test(`Boru ${count}-worker crew scoops, carries and deposits on the shared baseline`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/src/main.ts*', route => route.fulfill({
      contentType: 'application/javascript',
      body: `
        import { createGame, MineSimulationDriver } from '/src/game/index.ts';
        import { createInitialGameState, CAT_CALCULATION_VERSION, createEmptyCatRoster } from '/src/core/index.ts';
        import { BASE_GAME_BALANCE } from '/src/config/index.ts';
        const now = Date.now();
        const initial = createInitialGameState(BASE_GAME_BALANCE, now);
        const cat = { catInstanceId:'boru', ownerUserId:'fixture', assetId:'miner:SSR:boru:idle',
          displayName:'Boru', roleId:'miner', rarityTier:'SSR', level:1,
          attributes:{power:96,speed:68,capacity:95,efficiency:90},
          calculationVersion:CAT_CALCULATION_VERSION, availabilityState:'Assigned',
          assignedSlotKey:'miner:floor-1', updatedAt:now };
        const driver = new MineSimulationDriver({
          state:{...initial, floors:initial.floors.map((f,i) => i === 0 ? {...f, mineShaftLevel:${count === 5 ? 200 : 1}} : f)},
          catRoster:{cats:[cat],assignments:[{slotKey:'miner:floor-1',catInstanceId:'boru'}],assignmentRevision:1,collectionRevision:1},
          balance:BASE_GAME_BALANCE, now:()=>now });
        createGame(document.querySelector('#game-viewport'), driver);
        window.boruFixture = { progress:p=>driver.replaceState({...driver.state,
          floors:driver.state.floors.map((f,i)=>i===0?{...f,extractionProgress:p}:f)}),
          reset:()=>driver.replaceCatRoster(createEmptyCatRoster()) };
      `,
    }));
    await page.goto('/');
    await openIntroMine(page);
    const canvas = page.locator('#game-viewport canvas');
    await expect(canvas).toHaveAttribute('data-boot-scene', 'BootScene');
    const floor = () => canvas.evaluate(el => JSON.parse(el.getAttribute('data-floor-views')!)[0]);
    for (const [progress, action, facesLeft] of [
      [0.15, 'travel-empty', false], [0.45, 'scoop', false],
      [0.7, 'travel-loaded', true], [0.94, 'deposit', true],
    ] as const) {
      await page.evaluate(p => {
        (window as unknown as { boruFixture: { progress(p: number): void } }).boruFixture.progress(p);
      }, progress);
      await expect.poll(async () => (await floor()).minerCrew[0].textureKey)
        .toBe(`marketplace-runtime-miner-boru-${action}`);
      const state = await floor();
      expect(state.activeMinerCount).toBe(count);
      expect(state.minerCrew[0].facesLeft).toBe(facesLeft);
      if (action === 'scoop') {
        expect(state.minerCrew[0].x).toBe(208);
      }
      expect(new Set(state.minerCrew.map((miner: { y: number }) => miner.y)).size).toBe(1);
      expect(state.miningImpactVisible).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`${action}.png`) });
    }
    await page.evaluate(() => {
      (window as unknown as { boruFixture: { reset(): void } }).boruFixture.reset();
    });
    await expect.poll(async () => (await floor()).minerAssetId).toBe('miner:N:mica:idle');
    expect((await floor()).minerCrew[0].width).toBe(75);
    expect(errors).toEqual([]);
  });
}
