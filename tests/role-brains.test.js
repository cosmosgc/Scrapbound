import test from 'node:test';
import assert from 'node:assert/strict';
import { SalvageSimulation } from '../resources/js/simulation-core.js';
const program = [{ action: 'patrol' }, { action: 'scan' }, { action: 'collect', resource: 'scrap' }];
test('role deployment only changes that role and future purchases inherit it', () => {
  const sim = new SalvageSimulation();
  sim.syncCrew({ scavenger: 1, scrap_hound: 1 });
  assert.equal(sim.robots[0].automation, true);
  assert.equal(sim.robots[1].automation, true);
  assert.equal(sim.deployRole('scrap_hound', program), 3);
  assert.equal(sim.robots[0].automation, true);
  assert.equal(sim.robots[1].automation, false);
  sim.syncCrew({ scavenger: 1, scrap_hound: 2 });
  assert.deepEqual(sim.robots[2].program, program);
  assert.equal(sim.robots[2].automation, false);
});
test('saved role programs survive assignment loading; individual override wins', () => {
  const sim = new SalvageSimulation(); sim.syncCrew({ scavenger: 2 });
  sim.deployRole('scavenger', program);
  const individual = [{ action: 'patrol' }];
  sim.loadAssignments({ units: { 0: individual } });
  assert.deepEqual(sim.robots[0].program, individual);
  assert.deepEqual(sim.robots[1].program, program);
  sim.deploy(individual);
  assert.deepEqual(sim.rolePrograms, {});
});
