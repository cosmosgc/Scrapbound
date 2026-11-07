import { test, expect } from '@playwright/test';

test('Laravel deep link serves the game and keeps navigation under the Wemp subpath', async ({ page, baseURL }) => {
  await page.goto(new URL('factory', baseURL).toString());
  await expect(page.locator('#factory-scene')).toBeVisible();
  await expect(page.locator('#view-factory')).toHaveClass(/active/);

  const factoryLink = page.locator('.nav-link[data-route="/factory"]');
  await expect(factoryLink).toHaveAttribute('href', /Jumper%20Robotica\/Scrapbound\/factory$/);
  await page.locator('a[data-route="/community"]').click();
  await expect(page).toHaveURL(/Jumper%20Robotica\/Scrapbound\/community$/);
  await expect(page.locator('#view-community')).toHaveClass(/active/);
});

test('Blockly program deploy changes the running crew program', async ({ page, baseURL }) => {
  await page.goto(new URL('brains', baseURL).toString());
  await expect(page.locator('#blockly-workspace svg.blocklySvg')).toBeVisible();
  await page.locator('#deploy-brain').click();
  await expect(page.locator('#brain-status')).toContainText('Deployed 3 instructions');

  await page.goto(new URL('factory', baseURL).toString());
  await expect(page.locator('#crew-status')).toContainText(/Driving to credits cache|Scanning salvage|Collecting credits|Returning with cargo/, { timeout: 15_000 });
});

test('Blockly program can be assigned to and restored for one robot', async ({ page, baseURL }) => {
  await page.addInitScript(() => localStorage.setItem('scrapbound.save.v1', JSON.stringify({
    version: 2, credits: 120, scrap: 18, shards: 0, sector: 1, prestigeCount: 0,
    owned: { scavenger: 2, scrap_hound: 0, fabricator: 0 }, bought: {},
    lastSeen: Date.now(), lifetimeCredits: 0,
  })));
  await page.goto(new URL('brains', baseURL).toString());
  const target = page.locator('#brain-deploy-target');
  await expect(target.locator('option')).toHaveCount(3);
  await target.selectOption('unit:1');
  await page.locator('#deploy-brain').click();
  await expect(page.locator('#brain-status')).toContainText('to unit 02');

  await page.goto(new URL('factory', baseURL).toString());
  await expect(page.locator('.crew-status-row').filter({ hasText: 'UNIT 02' })).toContainText(/Driving to credits cache|Scanning salvage|Collecting credits|Returning with cargo|Program deployed/);
  const assigned = await page.evaluate(() => JSON.parse(localStorage.getItem('scrapbound.deployed-programs.v1')));
  expect(assigned.units['1']).toHaveLength(3);
});

test('factory simulation exposes pause and speed controls', async ({ page, baseURL }) => {
  await page.goto(new URL('factory', baseURL).toString());
  const toggle = page.locator('#simulation-toggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#scene-rate')).toHaveText('Paused');
  await toggle.click();
  await page.locator('#simulation-speed').click();
  await expect(page.locator('#simulation-speed')).toHaveText('2× Speed');
  await page.locator('#render-quality').selectOption('medium');
  await page.locator('#reduced-motion').check();
  await expect(page.locator('#reduced-motion')).toBeChecked();
});

test('accelerated browser playtest delivers program-earned credits', async ({ page, baseURL }) => {
  await page.addInitScript(() => localStorage.setItem('scrapbound.save.v1', JSON.stringify({
    version: 2, credits: 0, scrap: 0, shards: 0, sector: 1, prestigeCount: 0,
    owned: { scavenger: 1, scrap_hound: 0, fabricator: 0 }, bought: {}, lastSeen: Date.now(), lifetimeCredits: 0,
  })));
  await page.goto(new URL('factory', baseURL).toString());
  const speed = page.locator('#simulation-speed');
  await speed.click(); await speed.click();
  await expect(page.locator('#delivery-feed')).toContainText('+', { timeout: 20_000 });
  await expect(page.locator('#credits')).not.toHaveText('0');
});

test('WebGL failure keeps the status UI usable and mobile layout within viewport', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') throw new Error('WebGL disabled by playtest');
      return getContext.call(this, type, ...args);
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(new URL('factory', baseURL).toString());
  await expect(page.locator('.scene-fallback')).toContainText('simulation and delivery rewards continue normally');
  await expect(page.locator('.scene-fallback-canvas')).toBeVisible();
  await expect(page.locator('#crew-status')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('custom keyboard profile drives only its assigned bot', async ({ page, baseURL }) => {
  await page.goto(new URL('brains', baseURL).toString());
  await expect(page.locator('#control-target option')).toHaveCount(1);
  await page.locator('#control-mode').selectOption('keyboard');
  await page.locator('[data-bind="up"]').click();
  await page.keyboard.press('i');
  await page.locator('#control-assign-profile').click();
  await page.goto(new URL('factory', baseURL).toString());
  await page.keyboard.down('i');
  await expect(page.locator('#crew-status')).toContainText('Manual pilot', { timeout: 5_000 });
  await page.keyboard.up('i');
  await expect(page.locator('#camera-follow option')).toHaveCount(2);
});

test('mouse pilot sends the selected bot to a clicked workshop point', async ({ page, baseURL }) => {
  await page.goto(new URL('brains', baseURL).toString());
  await page.locator('#control-mode').selectOption('mouse');
  await page.locator('#control-assign-profile').click();
  await page.goto(new URL('factory', baseURL).toString());
  const canvas = page.locator('#factory-scene canvas');
  const bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height * .68);
  await expect(page.locator('#crew-status')).toContainText('Driving to mouse waypoint', { timeout: 5_000 });
});

test('fullscreen workshop exposes quick-purchase buttons outside the canvas', async ({ page, baseURL }) => {
  await page.goto(new URL('factory', baseURL).toString());
  await page.locator('#scene-fullscreen').click();
  await expect.poll(() => page.locator('#scene-panel').evaluate(element => element.matches(':fullscreen'))).toBe(true);
  await expect(page.locator('#fullscreen-shop')).toBeVisible();
  await page.locator('#fullscreen-shop [data-buy-item="scrap_hound"]').click();
  await expect(page.locator('#unit-count')).toContainText('2 / 20');
});

test('signed-in player loads server jobs and persists programs and robot purchases', async ({ page, baseURL, browser }) => {
  test.setTimeout(60000);
  await page.goto(new URL('factory', baseURL).toString());
  await page.locator('#auth-button').click();
  await page.locator('#auth-mode').click();
  const username = `JobTest${Date.now().toString().slice(-8)}`;
  await page.locator('#auth-username').fill(username);
  await page.locator('#auth-password').fill('JobTest-Only-2026!');
  await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-button')).toContainText(username);
  await expect(page.locator('#unit-count')).toContainText('1 / 20');
  await expect(page.locator('#credits')).toHaveText('120');
  await expect(page.locator('#credits-server')).toBeVisible();
  await expect(page.locator('#credits-server')).toContainText('SERVER');
  await expect(page.locator('#delivery-feed')).not.toContainText('+20 credits');
  await page.reload();
  await expect(page.locator('#auth-button')).toContainText(username);
  await expect(page.locator('#credits')).toHaveText('120');

  await page.goto(new URL('brains', baseURL).toString());
  await expect(page.locator('#blockly-workspace .blocklySvg')).toBeVisible();
  await expect(page.locator('#brain-deploy-target option')).toHaveCount(2);
  await page.locator('#deploy-brain').click();
  await expect(page.locator('#brain-status')).toContainText('Saved and deployed 3 steps');

  await page.goto(new URL('factory', baseURL).toString());
  await page.locator('#production-list [data-buy-item="scrap_hound"]').click();
  await expect(page.locator('#unit-count')).toContainText('2 / 20');

  await page.goto(new URL('brains', baseURL).toString());
  await expect(page.locator('#brain-deploy-target option')).toHaveCount(3);
  await expect(page.locator('#server-template-list')).toContainText('Salvage scout');
  await page.locator('a[data-route="/expeditions"]').click();
  await page.locator('[data-server-mission="1"]').click();
  await expect(page.locator('[data-mission-claim]')).toContainText('In progress');

  const pveResponse = page.waitForResponse(response => response.url().includes('pve_challenge'));
  await page.locator('#pve-fight').click();
  expect((await pveResponse).status()).toBe(201);
  await expect(page.locator('#pve-status')).toContainText(/Victory|Defeat/);
  await expect(page.locator('#pve-history')).toContainText('Scrapling');

  await page.locator('#battle-publish').click();
  await expect(page.locator('#battle-status')).toContainText('immutable defense snapshot');
  const defenderContext = await browser.newContext();
  const defenderPage = await defenderContext.newPage();
  await defenderPage.goto(new URL('factory', baseURL).toString());
  await defenderPage.locator('#auth-button').click();
  await defenderPage.locator('#auth-mode').click();
  const defenderName = `ArenaTest${Date.now().toString().slice(-8)}`;
  await defenderPage.locator('#auth-username').fill(defenderName);
  await defenderPage.locator('#auth-password').fill('ArenaTest-Only-2026!');
  await defenderPage.locator('#auth-submit').click();
  await expect(defenderPage.locator('#auth-button')).toContainText(defenderName);
  await defenderPage.locator('a[data-route="/expeditions"]').click();
  await defenderPage.locator('#battle-publish').click();
  await expect(defenderPage.locator('#battle-status')).toContainText('immutable defense snapshot');

  await page.locator('#battle-refresh').click();
  const battleResponse = page.waitForResponse(response => response.url().includes('battle_challenge'));
  await page.locator('#battle-defenses .battle-entry').filter({ hasText: defenderName }).getByRole('button', { name: 'Challenge' }).click();
  expect((await battleResponse).status()).toBe(201);
  await expect(page.locator('#battle-status')).toContainText(/Victory|Defense held/);
  await expect(page.locator('#battle-history')).toContainText('Match #');
  await page.locator('#battle-history details summary').first().click();
  await page.locator('#battle-history [data-replay-toggle]').first().click();
  await expect(page.locator('#battle-history .battle-replay-canvas-host canvas')).toBeVisible();
  await expect(page.locator('#battle-history [data-replay-seek]')).toBeVisible();
  await page.locator('#battle-history [data-replay-speed]').selectOption('2');
  await expect(page.locator('#battle-history [data-replay-label]').first()).not.toContainText('Ready to replay');
  await defenderContext.close();
});
