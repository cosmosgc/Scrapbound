import { test, expect } from '@playwright/test';

test('research defaults to the honeycomb tree with optional searchable cards', async ({ page }) => {
  await page.goto('./');
  await page.locator('[data-route="/technology"]').click();
  await expect(page.locator('.research-toolbar')).toContainText('Sign in');
  await expect(page.locator('#technology-tree')).toHaveAttribute('data-layout', 'map');
  await expect(page.locator('.technology-connections')).toBeVisible();
  await expect(page.locator('.technology-honeycomb')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Honeycomb tree' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Discovery cards' }).click();
  await page.getByRole('searchbox', { name: 'Search technologies' }).fill('Geological');
  await expect(page.locator('[data-tech-node]:visible')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search technologies' }).fill('');
  await page.getByRole('button', { name: 'Honeycomb tree' }).click();
  await expect(page.locator('.technology-connections')).toBeVisible();
  await page.getByRole('button', { name: 'Discovery cards' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('admin workbench filters entries and keeps the edited entry open', async ({ page }) => {
  const content = { version: 1, resources: [{ id: 'scrap', name: 'Scrap', currency: 'scrap', valuePerCargo: 2, spawnWeight: 1, minStock: 5, maxStock: 7, respawnSeconds: 60, zone: 'frontier' }], technologyNodes: [{ id: 'survey', name: 'Survey', description: 'Explore', cost: 90, currency: 'credits', prerequisites: [], effects: {} }] };
  await page.route('**/api.php?*', async route => {
    const action = new URL(route.request().url()).searchParams.get('action');
    const body = action === 'status' ? { ok: true, csrf: 'test', player: { id: 1, username: 'Studio test', can_manage_catalog: true } }
      : action === 'catalog_studio' ? { ok: true, active: content, versions: [] }
      : action === 'catalog' ? { ok: true, catalog: content }
      : { ok: false, error: 'Read-only browser fixture' };
    await route.fulfill({ json: body });
  });
  await page.goto('./');
  await page.locator('#admin-catalog-nav').click();
  const host = page.locator('#catalog-structured-editor');
  await expect(host.locator('.studio-toolbar')).toContainText('2 entries');
  await host.getByRole('searchbox').fill('Survey');
  await expect(host.locator('.structured-entry:visible')).toHaveCount(1);
  await host.locator('.structured-entry:visible summary').click();
  const name = host.locator('input[data-editor-path=\'["technologyNodes",0,"name"]\']');
  await name.fill('Survey buddy');
  await name.press('Tab');
  await expect(host.locator('.structured-entry[open]')).toHaveCount(1);
  await expect(host.locator('.structured-entry[open]')).toContainText('Survey buddy');
});
