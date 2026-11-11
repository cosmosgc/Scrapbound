import test from 'node:test';
import assert from 'node:assert/strict';
import { addTechnologyPrerequisite, mutateCatalogArray, mutateTechnologyEffect, renderCatalogEditor, setCatalogPath } from '../resources/js/catalog-editor.js';

test('structured catalog editor exposes modular sections and technology effect controls', () => {
  const host = { innerHTML: '' };
  const content = {
    resources: [{ id: 'alloy', name: 'Alloy', minStock: 2 }],
    technologyNodes: [{
      id: 'survey', name: 'Survey', prerequisites: [], cost: 10, currency: 'credits',
      effects: { unlockCapabilities: ['remote_ops'], spawnWeightMultipliers: { alloy: 1.5 } },
    }, { id: 'refinery', name: 'Refinery', prerequisites: [], cost: 20, currency: 'scrap', effects: {} }],
  };
  renderCatalogEditor(host, content);
  assert.match(host.innerHTML, /data-editor-section="resources"/);
  assert.match(host.innerHTML, /data-editor-section="technologyNodes"/);
  assert.match(host.innerHTML, /unlockCapabilities/);
  assert.match(host.innerHTML, /data-editor-op="add"/);
  assert.match(host.innerHTML, /data-editor-op="remove"/);
  assert.match(host.innerHTML, /Choose a gameplay effect to add/);
  assert.match(host.innerHTML, /data-effect-choice/);
  assert.doesNotMatch(host.innerHTML, /Add effect</);
  assert.match(host.innerHTML, /Unlock capabilities/);
  assert.match(host.innerHTML, /Offline time bonus/);
  assert.match(host.innerHTML, /Choose a prerequisite to add/);
  assert.match(host.innerHTML, /data-prerequisite-choice/);
  assert.doesNotMatch(host.innerHTML, /Add prerequisite/);
});

test('technology effect picker adds typed list and map effects, and prerequisites use known nodes', () => {
  const content = { technologyNodes: [
    { id: 'survey', name: 'Survey', prerequisites: [], effects: {} },
    { id: 'refinery', name: 'Refinery', prerequisites: [], effects: {} },
  ] };
  mutateTechnologyEffect(content, ['technologyNodes', 0, 'effects'], 'add-effect', 'unlockPrograms');
  content.technologyNodes[0].effects.unlockPrograms.push('salvage_route');
  mutateTechnologyEffect(content, ['technologyNodes', 0, 'effects'], 'add-effect', 'stockMultipliers');
  mutateTechnologyEffect(content, ['technologyNodes', 0, 'effects', 'stockMultipliers'], 'add-effect-map-entry');
  content.technologyNodes[0].effects.stockMultipliers.resource_id = 1.5;
  content.technologyNodes[0].effects.stockMultipliers.alloy = 1.5;
  assert.equal(addTechnologyPrerequisite(content, ['technologyNodes', 1, 'prerequisites'], 'survey'), true);
  assert.equal(addTechnologyPrerequisite(content, ['technologyNodes', 1, 'prerequisites'], 'missing_node'), false);
  assert.equal(addTechnologyPrerequisite(content, ['technologyNodes', 1, 'prerequisites'], 'survey'), false);
  assert.deepEqual(content.technologyNodes[0].effects.unlockPrograms, ['salvage_route']);
  assert.deepEqual(content.technologyNodes[0].effects.stockMultipliers, { resource_id: 1.5, alloy: 1.5 });
  assert.deepEqual(content.technologyNodes[1].prerequisites, ['survey']);

  assert.equal(mutateTechnologyEffect(content, ['technologyNodes', 0, 'effects'], 'add-effect', 'offlineSecondsBonus'), true);
  assert.equal(content.technologyNodes[0].effects.offlineSecondsBonus, 0);
});

test('structured editor path updates and repeatable catalog arrays stay data-driven', () => {
  const content = { technologyNodes: [{ id: 'survey', name: 'Survey', prerequisites: [], effects: {} }] };
  setCatalogPath(content, ['technologyNodes', 0, 'name'], 'Deep survey');
  mutateCatalogArray(content, ['technologyNodes'], 'add');
  assert.equal(content.technologyNodes.length, 2);
  assert.equal(content.technologyNodes[0].name, 'Deep survey');
  assert.equal(content.technologyNodes[1].id, 'new_technology_2');
  mutateCatalogArray(content, ['technologyNodes', 1], 'remove');
  assert.equal(content.technologyNodes.length, 1);
});
