import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { DEFAULT_PROGRAM, SalvageSimulation } from '../resources/js/simulation.js';
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
  assert.notEqual(sim.robots[0].phase, 'idle');
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

test('Blockly navigation instructions and manual inputs move bots within workshop bounds', () => {
  const moveProgram = compileProgram(workspace(block('sb_move_to', { fields: { X: 2, Z: -1 }, next: block('sb_return_home') })));
  assert.deepEqual(moveProgram.program, [{ action: 'move_to', x: 2, z: -1 }, { action: 'return_home' }]);
  assert.equal(parseProgram(moveProgram.program).length, 2);
  assert.deepEqual(parseProgram([{ action: 'move_to', x: 99, z: 0 }]), []);

  const sim = new SalvageSimulation(); sim.syncCrew({ scavenger: 1 }); sim.deploy([]);
  const robot = sim.robots[0], startX = robot.x;
  sim.manualInput(0, 1, 0); sim.tick(.1);
  assert.ok(robot.x > startX); assert.equal(robot.status, 'Manual pilot');
  sim.manualDestination(0, 20, -20);
  assert.deepEqual(robot.destination, { x: 5, z: -3 });
  for (let tick = 0; tick < 500; tick++) sim.tick(.1);
  assert.equal(robot.x, 5); assert.equal(robot.z, -3);
  assert.equal(robot.destination, null);
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
  assert.notDeepEqual(otherSeed.snapshot.nodes.map(node => node.stock), first.snapshot.nodes.map(node => node.stock));
});

test('headless simulation contract replays bounded snapshots and rejects unsafe work', () => {
  const input = {
    coreVersion: 1, seed: 42, crew: { scavenger: 1, scrap_hound: 1, fabricator: 0 },
    assignments: { crew: DEFAULT_PROGRAM, units: { '1': [{ action: 'patrol' }, { action: 'scan' }, { action: 'collect', resource: 'scrap' }] } },
    upgrades: { servo: true, magnet: false }, ticks: 1200,
  };
  const first = resolveSimulation(input), replay = resolveSimulation(input);
  assert.equal(first.ok, true);
  assert.deepEqual(replay, first);
  assert.equal(first.coreVersion, 1);
  assert.ok(first.snapshot.elapsed <= MAX_SIMULATION_TICKS / 10);
  assert.ok(first.payouts.every(payout => ['credits', 'scrap'].includes(payout.resource)));
  assert.equal(resolveSimulation({ ...input, ticks: MAX_SIMULATION_TICKS + 1 }).ok, false);
  assert.equal(resolveSimulation({ ...input, crew: { scavenger: 21, scrap_hound: 0, fabricator: 0 } }).ok, false);
  assert.equal(resolveSimulation({ ...input, assignments: { units: { '20': DEFAULT_PROGRAM } } }).ok, false);
});

test('fast-check: arbitrary programs are bounded and allowlisted', () => {
  const instruction = fc.oneof(
    fc.constant({ action: 'patrol' }), fc.constant({ action: 'scan' }),
    fc.record({ action: fc.constant('collect'), resource: fc.constantFrom('credits', 'scrap') }),
    fc.record({ action: fc.constant('wait'), seconds: fc.integer({ min: 1, max: 30 }) }),
    fc.record({ action: fc.constant('move_to'), x: fc.double({ min: -5, max: 5, noNaN: true }), z: fc.double({ min: -3, max: 3, noNaN: true }) }),
    fc.constant({ action: 'return_home' }),
    fc.record({ action: fc.constant('if_cargo'), skip: fc.integer({ min: 0, max: 40 }) }),
    fc.record({ action: fc.constant('if_site'), resource: fc.constantFrom('credits', 'scrap'), skip: fc.integer({ min: 0, max: 40 }) }),
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
