import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  clear: () => memory.clear(),
};
const { Economy, items } = await import('../resources/js/economy.js');

test('fresh save has a starter robot but no passive earnings', () => {
  localStorage.clear();
  const game = new Economy();
  assert.equal(game.state.credits, 120);
  assert.equal(game.state.owned.scavenger, 1);
  assert.deepEqual(game.production(), { credits: 0, scrap: 0 });
  assert.deepEqual(game.offline, { seconds: 0, credits: 0, scrap: 0 });
  game.tick();
  assert.equal(game.state.credits, 120);
});

test('purchases spend currency and scale repeat prices', () => {
  localStorage.clear();
  const game = new Economy();
  const item = items.find(entry => entry.id === 'scrap_hound');
  assert.equal(game.price(item), 35);
  assert.equal(game.buyItem(item.id), true);
  assert.equal(game.state.credits, 85);
  assert.equal(game.state.owned.scrap_hound, 1);
  assert.equal(game.price(item), 41);
  assert.equal(game.buyItem(item.id), true);
  assert.equal(game.price(item), 48);
  assert.equal(game.buyItem(item.id), false);
});

test('mission reward is settled and advances the unlocked sector', () => {
  localStorage.clear();
  const game = new Economy();
  const reward = game.mission(1);
  assert.deepEqual(reward, { credits: 65, scrap: 21, crew: 1, danger: 0 });
  assert.equal(game.state.sector, 2);
  assert.equal(game.state.credits, 185);
  assert.equal(game.state.scrap, 39);
});

test('prestige awards permanent shards and resets cycle progress', () => {
  localStorage.setItem('scrapbound.save.v1', JSON.stringify({
    version: 1, credits: 9000, scrap: 500, shards: 2, sector: 8, prestigeCount: 1,
    owned: { scavenger: 10, scrap_hound: 2, fabricator: 1 }, bought: { servo: true },
    lastSeen: Date.now(), lifetimeCredits: 12000,
  }));
  const game = new Economy();
  assert.equal(game.prestige(), 3);
  assert.equal(game.state.shards, 5);
  assert.equal(game.state.prestigeCount, 2);
  assert.equal(game.state.credits, 120);
  assert.equal(game.state.lifetimeCredits, 0);
  assert.deepEqual(game.state.owned, { scavenger: 1, scrap_hound: 0, fabricator: 0, sky_miner: 0, block_miner: 0, cargo_hauler: 0, buffer_bot: 0 });
});
