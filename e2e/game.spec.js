import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }, testInfo) => {
  if (!testInfo.title.startsWith('Brazilian Portuguese is the default')) {
    await page.addInitScript(() => localStorage.setItem('scrapbound.language.v1', 'en'));
  }
});

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
  await expect(page.locator('#crew-status')).toContainText(/Driving to credits cache|Scanning salvage|Collecting credits|Returning with cargo|Moving to resource block|Breaking resource block|Picking up dropped resource|Returning with mined resources/, { timeout: 15_000 });
});

test('Blockly program can be assigned to and restored for one robot', async ({ page, baseURL }) => {
  await page.addInitScript(() => localStorage.setItem('scrapbound.save.v1', JSON.stringify({
    version: 2, credits: 120, scrap: 18, shards: 0, sector: 1, prestigeCount: 0,
    owned: { scavenger: 2, scrap_hound: 0, fabricator: 0 }, bought: {},
    lastSeen: Date.now(), lifetimeCredits: 0,
  })));
  await page.goto(new URL('brains', baseURL).toString());
  await expect(page.locator('#brain-status')).toHaveAttribute('data-editor-ready', 'true');
  const target = page.locator('#brain-deploy-target');
  await expect(target.locator('option[value="all"]')).toHaveCount(1);
  await expect(target.locator('option[value^="role:"]')).toHaveCount(7);
  await expect(target.locator('option[value^="unit:"]')).toHaveCount(2);
  await target.selectOption('unit:1');
  await page.locator('#deploy-brain').click();
  await expect(page.locator('#brain-status')).toContainText('to unit 02');

  await page.goto(new URL('factory', baseURL).toString());
  await expect(page.locator('.crew-status-row').filter({ hasText: 'UNIT 02' })).toContainText(/Driving to credits cache|Scanning salvage|Collecting credits|Returning with cargo|Program deployed|Moving to resource block|Breaking resource block|Picking up dropped resource|Returning with mined resources/);
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

test('Brazilian Portuguese is the default UI language and English remains selectable', async ({ page, baseURL }) => {
  await page.goto(new URL('factory', baseURL).toString());
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.locator('.nav-link[data-route="/factory"]')).toContainText('Fábrica');
  await expect(page.locator('.resource-strip')).toContainText('CRÉDITOS LOCAIS');
  await expect(page.locator('.resource-strip')).toContainText('ENTREGAS DOS ROBÔS');
  await expect(page).toHaveTitle('Chão de fábrica — Scrapbound');

  await page.locator('#language-select').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.nav-link[data-route="/factory"]')).toContainText('Factory');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.nav-link[data-route="/factory"]')).toContainText('Factory');

  await page.locator('#language-select').selectOption('pt-BR');
  await expect(page.locator('.nav-link[data-route="/factory"]')).toContainText('Fábrica');
});

test('accelerated browser playtest earns resources from bot deliveries', async ({ page, baseURL }) => {
  await page.addInitScript(() => localStorage.setItem('scrapbound.save.v1', JSON.stringify({
    version: 2, credits: 0, scrap: 0, shards: 0, sector: 1, prestigeCount: 0,
    owned: { scavenger: 1, scrap_hound: 0, fabricator: 0 }, bought: {}, lastSeen: Date.now(), lifetimeCredits: 0,
  })));
  await page.goto(new URL('factory', baseURL).toString());
  const speed = page.locator('#simulation-speed');
  await speed.click(); await speed.click();
  await expect(page.locator('#delivery-feed')).toContainText('+', { timeout: 20_000 });
  await expect.poll(async () => Number(await page.locator('#credits').innerText()) + Number(await page.locator('#scrap').innerText())).toBeGreaterThan(0);
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
  await expect(page.locator('.scene-fallback')).toContainText('Your robots keep working.');
  await expect(page.locator('.scene-fallback-canvas')).toBeVisible();
  await expect(page.locator('#crew-status')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('custom keyboard profile drives only its assigned bot', async ({ page, baseURL }) => {
  await page.goto(new URL('brains', baseURL).toString());
  await expect(page.locator('#control-mode')).toHaveAttribute('data-controls-ready', 'true');
  await expect(page.locator('#control-target option')).toHaveCount(1);
  await page.locator('#control-mode').selectOption('keyboard');
  await expect(page.locator('[data-bind="up"]')).toBeVisible();
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
  await expect(page.locator('#control-status')).toContainText('program mode');
  await expect.poll(async () => Boolean(await page.evaluate(() => localStorage.getItem('scrapbound.controls.v1')))).toBe(true);
  await page.locator('#control-mode').selectOption('mouse');
  await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('scrapbound.controls.v1'))))?.profiles?.Default?.mode).toBe('mouse');
  await page.locator('#control-assign-profile').click();
  const controls = await page.evaluate(() => JSON.parse(localStorage.getItem('scrapbound.controls.v1')));
  expect(controls.profiles.Default.mode).toBe('mouse');
  expect(controls.assignments['0']).toBe('Default');
  await page.goto(new URL('factory', baseURL).toString());
  const restoredControls = await page.evaluate(() => JSON.parse(localStorage.getItem('scrapbound.controls.v1')));
  expect(restoredControls.profiles.Default.mode).toBe('mouse');
  expect(restoredControls.assignments['0']).toBe('Default');
  await page.locator('[data-view="top"]').click();
  const canvas = page.locator('#factory-scene canvas');
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + bounds.width * .85, bounds.y + bounds.height * .2);
  await expect(page.locator('#crew-status')).toContainText('Driving to mouse waypoint', { timeout: 5_000 });
});

test('signed-in technology loads independently when saved jobs are unavailable', async ({ page, baseURL }) => {
  let technologyRequests = 0;
  await page.route('**/api.php?*', async route => {
    const requestUrl = new URL(route.request().url());
    const action = requestUrl.searchParams.get('action');
    if (action === 'status') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        ok: true, player: { id: 1, username: 'ResearchPilot', can_manage_catalog: false }, csrf: 'test-csrf-token',
      }) });
    } else if (action === 'technology') {
      technologyRequests++;
      if (technologyRequests === 1) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Technology service temporarily unavailable.' }) });
      } else {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
          ok: true, catalog_version: 1, owned_node_ids: [], resources: [], effects: {},
          nodes: [{ id: 'field_science', name: 'Field science', description: 'A starter research node.', prerequisites: [], cost: 0, currency: 'credits', effects: {}, owned: false, available: true }],
        }) });
      }
    } else if (action === 'jobs') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Jobs temporarily unavailable.' }) });
    } else {
      await route.continue();
    }
  });

  await page.goto(new URL('factory', baseURL).toString());
  await page.locator('a[data-route="/technology"]').click();
  await expect(page.locator('#technology-tree')).toContainText('Technology could not be loaded');
  await page.locator('#technology-tree [data-tech-retry]').click();
  await expect(page.locator('#technology-tree')).toContainText('Field science');
  await expect(page.locator('#technology-tree')).not.toContainText('Loading server technology');
  expect(technologyRequests).toBe(2);
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
  test.setTimeout(120000);
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
  await expect(page.locator('#inventory-items')).toContainText('No catalog items yet');
  await expect(page.locator('#trade-list')).toContainText('No item trade offers yet');
  await expect(page.locator('#trade-create')).toBeDisabled();
  await expect(page.locator('#delivery-feed')).not.toContainText('+20 credits');
  await page.reload();
  await expect(page.locator('#auth-button')).toContainText(username);
  await expect(page.locator('#credits')).toHaveText('120');

  await page.goto(new URL('brains', baseURL).toString());
  await expect(page.locator('#blockly-workspace .blocklySvg')).toBeVisible();
  await expect(page.locator('#brain-deploy-target option[value="all"]')).toHaveCount(1);
  await expect(page.locator('#brain-deploy-target option[value^="unit:"]')).toHaveCount(1);
  await page.locator('#deploy-brain').click();
  await expect(page.locator('#brain-status')).toContainText('Saved and deployed 3 steps');

  await page.goto(new URL('factory', baseURL).toString());
  await page.locator('#production-list [data-buy-item="scrap_hound"]').click();
  await expect(page.locator('#unit-count')).toContainText('2 / 20');

  await page.goto(new URL('brains', baseURL).toString());
  await expect(page.locator('#brain-deploy-target option[value="all"]')).toHaveCount(1);
  await expect(page.locator('#brain-deploy-target option[value^="unit:"]')).toHaveCount(2);
  await expect(page.locator('#server-template-list')).toContainText('Salvage scout');
  await page.locator('a[data-route="/expeditions"]').click();
  await page.locator('#cooperative-goal').selectOption('2');
  await page.locator('#cooperative-create').click();
  await expect(page.locator('#cooperative-jobs')).toContainText(`${username} · Sector 01`);
  await expect(page.locator('#cooperative-jobs')).toContainText('0/2 contributions');
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
  await defenderPage.addInitScript(() => localStorage.setItem('scrapbound.language.v1', 'en'));
  await defenderPage.goto(new URL('factory', baseURL).toString());
  await defenderPage.locator('#auth-button').click();
  await defenderPage.locator('#auth-mode').click();
  const defenderName = `ArenaTest${Date.now().toString().slice(-8)}`;
  await defenderPage.locator('#auth-username').fill(defenderName);
  await defenderPage.locator('#auth-password').fill('ArenaTest-Only-2026!');
  await defenderPage.locator('#auth-submit').click();
  await expect(defenderPage.locator('#auth-button')).toContainText(defenderName);
  await defenderPage.locator('a[data-route="/expeditions"]').click();
  const cooperativeCard = defenderPage.locator('#cooperative-jobs .battle-entry').filter({ hasText: `${username} · Sector 01` });
  await cooperativeCard.getByRole('button', { name: 'Join' }).click();
  await expect(cooperativeCard.getByRole('button', { name: 'Contribute' })).toBeVisible();
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

  await page.locator('a[data-route="/expeditions"]').click();
  const claimButton = page.locator('[data-mission-claim]');
  await expect(claimButton).toBeEnabled({ timeout: 30000 });
  await claimButton.click();
  await expect(page.locator('#mission-result')).toContainText(/Salvage secured|returned safely/);
  if (!(await page.locator('#mission-result').innerText()).includes('Salvage secured')) {
    await page.locator('[data-server-mission="1"]').click();
    await expect(page.locator('[data-mission-claim]')).toBeEnabled({ timeout: 30000 });
    await page.locator('[data-mission-claim]').click();
    await expect(page.locator('#mission-result')).toContainText('Salvage secured');
  }
  await expect(page.locator('#inventory-items')).toContainText('Salvage alloy');
  await page.goto(new URL('factory', baseURL).toString());
  await page.locator('#trade-recipient').selectOption({ label: defenderName });
  await page.locator('#trade-item').selectOption('alloy');
  await page.locator('#trade-quantity').fill('1');
  await page.locator('#trade-price').fill('25');
  const createTradeResponse = page.waitForResponse(response => response.url().includes('item_trade_create'));
  await page.locator('#trade-create').click();
  expect((await createTradeResponse).status()).toBe(201);
  await expect(page.locator('#trade-list')).toContainText('open');

  await defenderPage.locator('.nav-link[data-route="/factory"]').click();
  await defenderPage.locator('#inventory-refresh').click();
  const incomingOffer = defenderPage.locator('#trade-list .battle-entry').filter({ hasText: username });
  await expect(incomingOffer).toContainText('Salvage alloy');
  const acceptTradeResponse = defenderPage.waitForResponse(response => response.url().includes('item_trade_accept'));
  await incomingOffer.locator('[data-trade-accept]').click();
  expect((await acceptTradeResponse).status()).toBe(200);
  await expect(defenderPage.locator('#trade-list')).toContainText('accepted');
  await expect(defenderPage.locator('#inventory-items')).toContainText('1 owned');

  await defenderContext.close();
});

test('signed-in player can research geological survey and see the technology unlock', async ({ page, baseURL }) => {
  test.setTimeout(90000);
  await page.goto(new URL('factory', baseURL).toString());
  await page.locator('#auth-button').click();
  await page.locator('#auth-mode').click();
  const username = `TechTest${Date.now().toString().slice(-8)}`;
  await page.locator('#auth-username').fill(username);
  await page.locator('#auth-password').fill('TechTest-Only-2026!');
  const idleSettlement = page.waitForResponse(response => response.url().includes('idle_settle'));
  await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-button')).toContainText(username);
  const settlement = await (await idleSettlement).json();
  expect(settlement.snapshot.nodes).toHaveLength(136);
  const firstSite = settlement.snapshot.nodes[0];
  await expect(page.locator('#factory-scene')).toHaveAttribute(
    'aria-label',
    new RegExp(`${firstSite.resource} site at x ${firstSite.x}, z ${firstSite.z}`),
  );
  await page.locator('a[data-route="/technology"]').click();
  await expect(page.locator('#view-technology')).toHaveClass(/active/);
  await expect(page.locator('#view-factory')).not.toHaveClass(/active/);
  await expect(page.locator('.nav-link[data-route="/technology"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#technology-tree')).toContainText('Geological survey');
  await expect(page.locator('#technology-tree')).toContainText('READY TO RESEARCH');
  await expect(page.locator('#technology-tree .technology-map')).toBeVisible();
  await expect(page.locator('#technology-tree .technology-link')).toHaveCount(9);
  await expect(page.locator('#technology-tree [data-tech-node]')).toHaveCount(9);
  const connectorInsets = await page.locator('#technology-tree .technology-map').evaluate(map => {
    const nodes = [...map.querySelectorAll('[data-tech-node]')].map(element => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    return [...map.querySelectorAll('.technology-link')].flatMap(path => {
      const points = [path.getPointAtLength(0), path.getPointAtLength(path.getTotalLength())]
        .map(point => point.matrixTransform(path.getScreenCTM()));
      return points.map(point => Math.min(...nodes.map(node => Math.hypot(point.x - node.x, point.y - node.y))));
    });
  });
  expect(connectorInsets).toHaveLength(18);
  expect(connectorInsets.every(distance => distance >= 80 && distance <= 101)).toBeTruthy();
  await expect(page.locator('#technology-tree')).toContainText('Deep veins');
  await expect(page.locator('#technology-tree')).toContainText('Sorting rig');
  await page.locator('#technology-tree [data-tech-node="prospecting"]').hover();
  await expect(page.locator('#technology-tip-prospecting')).toBeVisible();
  await expect(page.locator('#technology-tip-prospecting')).toContainText('Open the quarry zone');
  await page.locator('#technology-tree [data-tech-purchase="prospecting"]').click();
  await expect(page.locator('#technology-tree')).toContainText('RESEARCHED');
  await expect(page.locator('#technology-tree')).toContainText('Unlocks alloy');
  await expect(page.locator('#technology-tree')).toContainText('Opens quarry zone');
  await expect(page.locator('#credits-server')).toHaveText('SERVER ¢30');
  await expect(page.locator('#technology-tree [data-tech-node="deep_veins"]')).toHaveClass(/technology-available/);
  await expect(page.locator('#technology-tree [data-tech-node="sorting_rig"]')).toHaveClass(/technology-available/);
  await page.locator('#technology-tree [data-tech-purchase="refinery"]').click();
  await expect(page.locator('#technology-tree')).toContainText('alloy stock ×1.5');
  await expect(page.locator('#technology-tree')).toContainText('alloy restock time ×0.5');
  await expect(page.locator('#scrap-server')).toHaveText('SERVER ▧6');
});

test('signed-in factory renders server offline settlement summary and wallet balance', async ({ page, baseURL }) => {
  await page.route('**/api.php?action=idle_settle*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true, world_seed: 42, elapsed_seconds: 120, credited_seconds: 120, offline_cap_seconds: 16200, capped: false, ticks: 1200,
      payouts: [{ resource: 'credits', amount: 50, deliveries: 2 }],
      snapshot: { robots: [], nodes: [] }, wallet: { credits: 170, scrap: 18 }, settled_at: new Date().toISOString(),
    }),
  }));
  await page.goto(new URL('factory', baseURL).toString());
  await page.locator('#auth-button').click();
  await page.locator('#auth-mode').click();
  const username = `OfflineTest${Date.now().toString().slice(-8)}`;
  await page.locator('#auth-username').fill(username);
  await page.locator('#auth-password').fill('OfflineTest-Only-2026!');
  await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-button')).toContainText(username);
  await expect(page.locator('#delivery-feed')).toContainText('Offline bots worked 2m · 2 depot deliveries · offline limit 4h 30m');
  await expect(page.locator('#delivery-feed')).toContainText('2 depot runs');
  await expect(page.locator('#credits-server')).toHaveText('SERVER ¢170');
});
