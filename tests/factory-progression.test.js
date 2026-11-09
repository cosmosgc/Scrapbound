import test from 'node:test';
import assert from 'node:assert/strict';
import { commissions, currentCommission, claimCommission } from '../resources/js/factory-progression.js';
const factory = () => ({ state: { owned: { scavenger: 1 }, bought: {}, credits: 0, scrap: 0, lifetimeCredits: 0, commissions: [] }, persist() { this.saved = true; } });
test('commissions guide players in order and require their objective', () => {
  const e = factory();
  assert.equal(currentCommission(e.state).id, 'crew');
  assert.equal(claimCommission(e, 'crew'), false);
  e.state.owned.scavenger++;
  assert.equal(claimCommission(e, 'income'), false);
  assert.equal(claimCommission(e, 'crew'), true);
  assert.equal(e.state.credits, 25);
  assert.equal(e.state.scrap, 15);
  assert.equal(e.state.lifetimeCredits, 0, 'supplies must not inflate prestige progress');
  assert.equal(e.saved, true);
  assert.equal(claimCommission(e, 'crew'), false, 'cannot double claim');
  assert.equal(currentCommission(e.state).id, 'income');
});
test('legacy saves work and completed cycles have no remaining commissions', () => {
  const e = factory();
  delete e.state.commissions;
  assert.equal(currentCommission(e.state).id, 'crew');
  e.state.commissions = commissions.map(c => c.id);
  assert.equal(currentCommission(e.state), null);
  assert.equal(claimCommission(e, 'core'), false);
});
