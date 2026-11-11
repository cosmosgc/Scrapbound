import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('scrapbound.language.v1', 'en')); });

test('inspect a robot and open its role-specific Blockly editor', async ({ page }) => {
  await page.goto('./');
  await page.locator('#inspect-unit').selectOption('0');
  await expect(page.locator('.inspector-brain')).toContainText('Built-in role brain');
  await expect(page.locator('.inspector-stats')).toContainText('CARGO');
  await page.locator('[data-inspect-edit="role:scavenger"]').click();
  await expect(page.locator('#brain-deploy-target')).toHaveValue('role:scavenger');
  await expect(page.locator('.blocklySvg').first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
