import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('scrapbound.language.v1', 'en')); });

test('factory shows the frontier and locked quarry in the Three.js view', async ({ page, baseURL }) => {
  await page.goto(new URL('factory', baseURL).toString());
  await expect(page.locator('.world-zone-chip').nth(0)).toContainText('FRONTIER');
  await expect(page.locator('.world-zone-chip').nth(0)).toContainText('OPEN');
  await expect(page.locator('.world-zone-chip').nth(1)).toContainText('QUARRY');
  await expect(page.locator('.world-zone-chip').nth(1)).toContainText('LOCKED');
  await expect(page.locator('#factory-scene')).toHaveAttribute('aria-label', /Quarry locked; requires Geological Survey/);
});

test('2D factory fallback draws and labels the locked quarry', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') throw new Error('WebGL disabled for zone fallback coverage');
      return getContext.call(this, type, ...args);
    };
  });
  await page.goto(new URL('factory', baseURL).toString());
  await expect(page.locator('.scene-fallback-canvas')).toHaveAttribute('aria-label', /Quarry locked; requires Geological Survey/);
  await expect(page.locator('.world-zone-status')).toContainText('LOCKED');
  await expect(page.locator('.scene-fallback-canvas')).toBeVisible();
});

test('researching Geological Survey updates the field zone state', async ({ page, baseURL }) => {
  await page.route('**/api.php?action=idle_settle*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      world_seed: 42,
      elapsed_seconds: 0,
      credited_seconds: 0,
      offline_cap_seconds: 14400,
      capped: false,
      ticks: 0,
      payouts: [],
      technology: {
        ok: true,
        nodes: [],
        owned_node_ids: ['prospecting'],
        effects: { unlockZones: ['quarry'], sceneUnlocks: ['survey_beacon'] },
        resources: [],
      },
      snapshot: { robots: [], nodes: [], drops: [] },
      wallet: { credits: 30, scrap: 18 },
      settled_at: new Date().toISOString(),
    }),
  }));
  await page.goto(new URL('factory', baseURL).toString());
  await page.locator('#auth-button').click();
  await page.locator('#auth-mode').click();
  await page.locator('#auth-username').fill(`ZoneTest${Date.now().toString().slice(-8)}`);
  await page.locator('#auth-password').fill('ZoneTest-Only-2026!');
  await page.locator('#auth-submit').click();

  await expect(page.locator('.world-zone-chip').nth(1)).toContainText('SURVEYED');
  await expect(page.locator('#factory-scene')).toHaveAttribute('aria-label', /Quarry surveyed and open/);
});
