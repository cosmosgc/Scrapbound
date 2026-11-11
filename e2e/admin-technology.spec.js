import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('scrapbound.language.v1', 'en')); });
test('technology editor graph scrolls to and expands a selected node editor', async ({page}) => {
  const content={version:1,resources:[{id:'scrap',name:'Scrap',currency:'scrap',valuePerCargo:2,spawnWeight:1,minStock:5,maxStock:7,respawnSeconds:60,zone:'frontier'}],technologyNodes:[{id:'survey',name:'Survey',description:'Explore',cost:90,currency:'credits',prerequisites:[],effects:{}},{id:'quarry',name:'Quarry',description:'Dig',cost:20,currency:'scrap',prerequisites:['survey'],effects:{}}]};
  await page.route('**/api.php?*',async route=>{const action=new URL(route.request().url()).searchParams.get('action');const body=action==='status'?{ok:true,csrf:'test',player:{id:1,username:'Admin test',can_manage_catalog:true}}:action==='catalog_studio'?{ok:true,active:content,versions:[]} :action==='catalog'?{ok:true,catalog:content}:{ok:false,error:'fixture'};await route.fulfill({json:body});});
  await page.goto('./');await page.locator('#admin-technology-nav').click();
  const graph=page.locator('#admin-tech-graph');await expect(graph.locator('.admin-tech-graph-node')).toHaveCount(2);
  await graph.locator('[data-tech-focus="quarry"]').click();
  const entry=page.locator('#technology-structured-editor .structured-entry').filter({has:page.locator('input[data-editor-path=\'["technologyNodes",1,"id"]\']')});
  await expect(entry).toHaveAttribute('open','');
  await expect(entry).toBeInViewport();
  await expect(page.locator('#technology-message')).toContainText('drafts until published');
});
