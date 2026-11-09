import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { DEFAULT_PROGRAM, FIELD_BOUNDS, NAVIGATION_OBSTACLES, SalvageSimulation, salvageSitesForSeed } from '../resources/js/simulation.js';
import { parseProgram } from '../resources/js/program-schema.js';
import { compileProgram } from '../resources/js/program-compiler.js';
import { MAX_SIMULATION_TICKS, resolveSimulation } from '../resources/js/simulation-contract.js';

const block = (type, { next = null, inputs = {}, fields = {} } = {}) => ({
  type,
  getNextBlock: () => next,
  getInputTargetBlock: name => inputs[name] || null,
  getFieldValue: name => fields[name],
});
const workspace = (...topBlocks) => ({ getTopBlocks: () => topBlocks });

test('deployed credit program moves a robot and pays only after cargo delivery', () => {
  const deliveries = [];
  const sim = new SalvageSimulation((resource, amount) => deliveries.push({ resource, amount }));
  sim.syncCrew({ scavenger: 1 });
  sim.deploy(DEFAULT_PROGRAM);

  for (let i = 0; i < 50; i++) sim.tick(.1);
  assert.equal(deliveries.length, 0, 'no reward before a robot returns to base');
  assert.notEqual(sim.robots[0].status, 'Waiting for a program');
  assert.ok(sim.robots[0].targetId);

  for (let i = 0; i < 500; i++) sim.tick(.1);
  assert.ok(deliveries.length > 0);
  assert.equal(deliveries[0].resource, 'credits');
  assert.ok(deliveries[0].amount > 0);
  const snapshot = sim.snapshot();
  assert.ok(snapshot.events.some(event => event.type === 'scan'));
  assert.ok(snapshot.events.some(event => event.type === 'collect' && event.siteId));
  assert.deepEqual(snapshot.events.filter(event => event.type === 'delivery').at(-1).amount, deliveries.at(-1).amount);
  assert.ok(snapshot.nodes.some(node => node.remaining < node.stock || node.scanned));
});

test('changing the Blockly resource instruction changes the simulated salvage job', () => {
  const deliveries = [];
  const sim = new SalvageSimulation((resource, amount) => deliveries.push({ resource, amount }));
  sim.syncCrew({ scavenger: 1 });
  sim.deploy([{ action: 'patrol' }, { action: 'scan' }, { action: 'collect', resource: 'scrap' }]);

  for (let i = 0; i < 500; i++) sim.tick(.1);
  assert.ok(deliveries.length > 0);
  assert.ok(deliveries.every(delivery => delivery.resource === 'scrap'));
  assert.ok(sim.nodes.filter(node => node.resource === 'scrap').every(node => node.remaining <= node.stock));
});

test('robots without a deployed program do not earn resources', () => {
  const deliveries = [];
  const sim = new SalvageSimulation((...delivery) => deliveries.push(delivery));
  sim.syncCrew({ scavenger: 1 });
  sim.deploy([]);
  for (let i = 0; i < 200; i++) sim.tick(.1);
  assert.equal(deliveries.length, 0);
  assert.equal(sim.robots[0].status, 'Waiting for a program');
});

test('a deployed program can target one robot and survives assignment reload', () => {
  const sim = new SalvageSimulation();
  sim.syncCrew({ scavenger: 2 });
  const scrapProgram = [{ action: 'patrol' }, { action: 'scan' }, { action: 'collect', resource: 'scrap' }];
  assert.equal(sim.deploy(scrapProgram, 1), 3);
  assert.equal(sim.robots[0].program[2].resource, 'credits');
  assert.equal(sim.robots[1].program[2].resource, 'scrap');

  const restored = new SalvageSimulation();
  restored.loadAssignments(sim.assignments());
  restored.syncCrew({ scavenger: 2 });
  assert.equal(restored.robots[0].program[2].resource, 'credits');
  assert.equal(restored.robots[1].program[2].resource, 'scrap');
});

test('Blockly compiler emits bounded cargo and cache branches with correct skips', () => {
  const branch = block('sb_if_cargo', {
    inputs: { DO: block('sb_wait', { fields: { SECONDS: 2 }, next: block('sb_scan') }) },
    next: block('sb_if_site', { fields: { RESOURCE: 'scrap' }, inputs: { DO: block('sb_collect', { fields: { RESOURCE: 'scrap' } }) } }),
  });
  const result = compileProgram(workspace(block('sb_forever', { inputs: { DO: branch } })));
  assert.equal(result.error, '');
  assert.deepEqual(result.program, [
    { action: 'if_cargo', skip: 2 }, { action: 'wait', seconds: 2 }, { action: 'scan' },
    { action: 'if_site', resource: 'scrap', skip: 1 }, { action: 'collect', resource: 'scrap' },
  ]);
  assert.equal(parseProgram(result.program).length, 5);
  assert.deepEqual(parseProgram([{ action: 'if_cargo', skip: 9 }]), []);
});

test('cargo and cache conditions control which robot instructions execute', () => {
  const cargoSim = new SalvageSimulation();
  cargoSim.syncCrew({ scavenger: 1 });
  cargoSim.deploy([{ action: 'if_cargo', skip: 1 }, { action: 'wait', seconds: 20 }, { action: 'patrol' }]);
  cargoSim.robots[0].cargo = 1;
  cargoSim.tick(.1);
  assert.equal(cargoSim.robots[0].status, 'Waiting');

  const emptySiteSim = new SalvageSimulation();
  emptySiteSim.syncCrew({ scavenger: 1 });
  emptySiteSim.nodes.forEach(node => { node.remaining = 0; node.respawn = 100; });
  emptySiteSim.deploy([{ action: 'if_site', resource: 'scrap', skip: 1 }, { action: 'wait', seconds: 20 }, { action: 'patrol' }]);
  emptySiteSim.tick(.1);
  assert.equal(emptySiteSim.robots[0].status, 'No matching salvage nearby');
});

test('Blockly navigation instructions and manual inputs move bots within expanded field bounds', () => {
  const moveProgram = compileProgram(workspace(block('sb_move_to', { fields: { X: 2, Z: -1 }, next: block('sb_return_home') })));
  assert.deepEqual(moveProgram.program, [{ action: 'move_to', x: 2, z: -1 }, { action: 'return_home' }]);
  assert.equal(parseProgram(moveProgram.program).length, 2);
  assert.equal(parseProgram([{ action: 'move_to', x: 15, z: -8 }]).length, 1);
  assert.deepEqual(parseProgram([{ action: 'move_to', x: 99, z: 0 }]), []);

  const sim = new SalvageSimulation(); sim.syncCrew({ scavenger: 1 }); sim.deploy([]);
  const robot = sim.robots[0], startX = robot.x;
  sim.manualInput(0, 1, 0); sim.tick(.1);
  assert.ok(robot.x > startX); assert.equal(robot.status, 'Manual pilot');
  sim.manualDestination(0, 20, -20);
  assert.deepEqual(robot.destination, { x: FIELD_BOUNDS.maxX, z: FIELD_BOUNDS.minZ });
  for (let tick = 0; tick < 500; tick++) sim.tick(.1);
  assert.equal(robot.x, FIELD_BOUNDS.maxX); assert.equal(robot.z, FIELD_BOUNDS.minZ);
  assert.equal(robot.destination, null);
});

test('multiple robots avoid overlap on a shared waypoint and replay deterministically', () => {
  const run = () => {
    const sim = new SalvageSimulation();
    sim.syncCrew({ scavenger: 20 });
    sim.deploy([{ action: 'move_to', x: 6, z: 0 }, { action: 'return_home' }]);
    let minimumSeparation = Infinity;
    let minimumObstacleClearance = Infinity;
    for (let tick = 0; tick < 1200; tick++) {
      sim.tick(.1);
      for (let left = 0; left < sim.robots.length; left++) {
        for (let right = left + 1; right < sim.robots.length; right++) {
          minimumSeparation = Math.min(minimumSeparation, Math.hypot(
            sim.robots[left].x - sim.robots[right].x,
            sim.robots[left].z - sim.robots[right].z,
          ));
        }
        for (const obstacle of NAVIGATION_OBSTACLES) {
          minimumObstacleClearance = Math.min(minimumObstacleClearance,
            Math.hypot(sim.robots[left].x - obstacle.x, sim.robots[left].z - obstacle.z) - obstacle.radius);
        }
      }
    }
    return { snapshot: sim.snapshot(), minimumSeparation, minimumObstacleClearance };
  };
  const first = run(), replay = run();
  assert.deepEqual(replay, first);
  assert.ok(first.minimumSeparation >= .649, `minimum robot separation was ${first.minimumSeparation}`);
  assert.ok(first.minimumObstacleClearance >= -1e-9, `minimum obstacle clearance was ${first.minimumObstacleClearance}`);
  assert.equal(first.snapshot.robots.length, 20);
  assert.ok(first.snapshot.robots.every(robot => Math.abs(robot.x) <= FIELD_BOUNDS.maxX && Math.abs(robot.z) <= FIELD_BOUNDS.maxZ));
});

test('manual pilot movement preserves the same robot spacing and field bounds', () => {
  const sim = new SalvageSimulation();
  sim.syncCrew({ scavenger: 2 });
  sim.manualInput(0, 1, 0);
  sim.manualInput(1, -1, 0);
  let minimumSeparation = Infinity;
  for (let tick = 0; tick < 300; tick++) {
    sim.tick(.1);
    const [left, right] = sim.robots;
    minimumSeparation = Math.min(minimumSeparation, Math.hypot(left.x - right.x, left.z - right.z));
  }
  assert.ok(minimumSeparation >= .649);
  assert.ok(sim.robots.every(robot => Math.abs(robot.x) <= FIELD_BOUNDS.maxX && Math.abs(robot.z) <= FIELD_BOUNDS.maxZ));
});

test('robots route around static field obstacles without rerolling blocked site cells', () => {
  const sim = new SalvageSimulation();
  sim.syncCrew({ scavenger: 1 });
  sim.deploy([{ action: 'move_to', x: -9, z: 2 }]);
  let minimumClearance = Infinity;
  for (let tick = 0; tick < 1200; tick++) {
    sim.tick(.1);
    for (const obstacle of NAVIGATION_OBSTACLES) {
      minimumClearance = Math.min(minimumClearance,
        Math.hypot(sim.robots[0].x - obstacle.x, sim.robots[0].z - obstacle.z) - obstacle.radius);
    }
  }
  assert.ok(minimumClearance >= -1e-9, `obstacle clearance was ${minimumClearance}`);
  assert.ok(Math.hypot(sim.robots[0].x + 9, sim.robots[0].z - 2) < .01);
  assert.ok(salvageSitesForSeed(1234).every(site => NAVIGATION_OBSTACLES.every(obstacle =>
    Math.hypot(site.x - obstacle.x, site.z - obstacle.z) >= obstacle.radius + .3,
  )));
});

test('an impossible obstacle-blocked waypoint is abandoned before work continues', () => {
  const sim = new SalvageSimulation();
  sim.syncCrew({ scavenger: 1 });
  sim.deploy([{ action: 'move_to', x: -4.7, z: 1.7 }, { action: 'wait', seconds: 30 }]);
  let routeFailureReported = false;
  for (let tick = 0; tick < 250; tick++) {
    sim.tick(.1);
    routeFailureReported ||= sim.robots[0].status === 'Route blocked; replanning';
  }
  assert.equal(routeFailureReported, true);
  assert.equal(sim.robots[0].phase, 'wait');
  assert.equal(sim.robots[0].status, 'Waiting');
  assert.equal(sim.robots[0].cargo, 0);
});

test('seeded ten-minute fixed-step runs produce identical event and delivery traces', () => {
  const run = seed => {
    const payouts = [];
    const sim = new SalvageSimulation((resource, amount) => payouts.push({ resource, amount }), { seed });
    sim.syncCrew({ scavenger: 1 });
    sim.deploy(DEFAULT_PROGRAM);
    for (let tick = 0; tick < 6000; tick++) sim.tick(.1);
    return { snapshot: sim.snapshot(), payouts };
  };
  const first = run(31415), replay = run(31415), otherSeed = run(31416);
  assert.deepEqual(replay, first);
  assert.ok(first.payouts.length > 0);
  assert.notDeepEqual(otherSeed.snapshot.nodes.map(({ x, z }) => [x, z]), first.snapshot.nodes.map(({ x, z }) => [x, z]));
});

test('seeded salvage sites vary deterministically across the larger field and avoid the depot', () => {
  const first = salvageSitesForSeed(1234), replay = salvageSitesForSeed(1234), other = salvageSitesForSeed(1235);
  assert.deepEqual(replay, first);
  assert.notDeepEqual(other, first);
  assert.equal(first.length, 8);
  assert.deepEqual(first.map(({ x, z, stock }) => [x, z, stock]), [
    [8, 2, 6], [10, -7, 4], [14, 8, 7], [-3, 9, 4],
    [2, -7, 6], [11, -5, 4], [-13, -6, 7], [-14, 4, 6],
  ]);
  assert.ok(first.every(site => Math.abs(site.x) <= 16 && Math.abs(site.z) <= 10));
  assert.ok(first.every(site => Number.isInteger(site.x) && Number.isInteger(site.z)));
  assert.equal(new Set(first.map(site => `${site.x}:${site.z}`)).size, first.length);
  assert.ok(first.every(site => Math.abs(site.x) > 6 || Math.abs(site.z) > 4));
  assert.deepEqual(first.map(site => site.resource).sort(), ['credits', 'credits', 'credits', 'credits', 'scrap', 'scrap', 'scrap', 'scrap']);
  const surveyed = salvageSitesForSeed(1234, undefined, { unlockResources: ['alloy'], unlockZones: ['quarry'], spawnWeightMultipliers: { alloy: 2 } });
  assert.deepEqual(surveyed.map(site => site.resource), ['credits', 'credits', 'scrap', 'credits', 'alloy', 'credits', 'alloy', 'alloy']);
  assert.deepEqual(salvageSitesForSeed(1234, undefined, { unlockResources: ['alloy'], unlockZones: ['quarry'], spawnWeightMultipliers: { alloy: 2 } }), surveyed);
  const refined = salvageSitesForSeed(1234, undefined, {
    unlockResources: ['alloy'], unlockZones: ['quarry'], spawnWeightMultipliers: { alloy: 2 },
    stockMultipliers: { alloy: 1.5 }, respawnTimeMultipliers: { alloy: .5 },
  });
  assert.deepEqual(refined.filter(site => site.resource === 'alloy').map(({ stock, respawnSeconds }) => [stock, respawnSeconds]), [[5, 2.5], [6, 2.5], [5, 2.5]]);
});

test('headless simulation contract replays bounded snapshots and rejects unsafe work', () => {
  const input = {
    coreVersion: 5, seed: 42, crew: { scavenger: 1, scrap_hound: 1, fabricator: 0 },
    assignments: { crew: DEFAULT_PROGRAM, units: { '1': [{ action: 'patrol' }, { action: 'scan' }, { action: 'collect', resource: 'scrap' }] } },
    upgrades: { servo: true, magnet: false }, ticks: 1200,
  };
  const first = resolveSimulation(input), replay = resolveSimulation(input);
  assert.equal(first.ok, true);
  assert.deepEqual(replay, first);
  assert.equal(first.coreVersion, 5);
  assert.ok(first.snapshot.elapsed <= MAX_SIMULATION_TICKS / 10);
  assert.ok(first.payouts.every(payout => ['credits', 'scrap'].includes(payout.resource)));
  assert.equal(resolveSimulation({ ...input, ticks: MAX_SIMULATION_TICKS + 1 }).ok, false);
  assert.equal(resolveSimulation({ ...input, crew: { scavenger: 21, scrap_hound: 0, fabricator: 0 } }).ok, false);
  assert.equal(resolveSimulation({ ...input, assignments: { units: { '20': DEFAULT_PROGRAM } } }).ok, false);
});

test('fast-check: arbitrary programs are bounded and allowlisted', () => {
  const instruction = fc.oneof(
    fc.constant({ action: 'patrol' }), fc.constant({ action: 'scan' }),
    fc.record({ action: fc.constant('collect'), resource: fc.constantFrom('credits', 'scrap', 'alloy') }),
    fc.record({ action: fc.constant('wait'), seconds: fc.integer({ min: 1, max: 30 }) }),
    fc.record({ action: fc.constant('move_to'), x: fc.double({ min: -16, max: 16, noNaN: true }), z: fc.double({ min: -10, max: 10, noNaN: true }) }),
    fc.constant({ action: 'return_home' }),
    fc.record({ action: fc.constant('if_cargo'), skip: fc.integer({ min: 0, max: 40 }) }),
    fc.record({ action: fc.constant('if_site'), resource: fc.constantFrom('credits', 'scrap', 'alloy'), skip: fc.integer({ min: 0, max: 40 }) }),
  );
  fc.assert(fc.property(fc.array(instruction, { maxLength: 100 }), input => {
    const program = parseProgram(input);
    assert.ok(program.length <= 40);
    assert.ok(program.every(step => ['patrol', 'scan', 'collect', 'wait', 'move_to', 'return_home', 'if_cargo', 'if_site'].includes(step.action)));
  }));
});

test('fast-check: malformed saved programs are rejected as a whole', () => {
  fc.assert(fc.property(fc.string(), unknownAction => {
    fc.pre(!['patrol', 'scan', 'collect', 'wait', 'move_to', 'return_home', 'if_cargo', 'if_site'].includes(unknownAction));
    assert.deepEqual(parseProgram([{ action: unknownAction }]), []);
  }));
});
