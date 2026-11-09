import { parseProgram } from './program-schema.js';

export const SIMULATION_CORE_VERSION = 5;
export const FIELD_BOUNDS = Object.freeze({ minX: -16, maxX: 16, minZ: -10, maxZ: 10 });
export const STORAGE_DEPOT = Object.freeze({ x: 0, z: 0 });
export const NAVIGATION_OBSTACLES = Object.freeze([
  Object.freeze({ x: -4.7, z: 1.7, radius: .78 }),
  Object.freeze({ x: 4.35, z: 1.6, radius: .78 }),
  Object.freeze({ x: -4.4, z: -2.6, radius: .78 }),
  Object.freeze({ x: -3.8, z: -1.8, radius: .45 }),
  Object.freeze({ x: 3.8, z: -1.8, radius: .45 }),
]);

const SITE_SLOTS = [];
for (let z = FIELD_BOUNDS.minZ + 1; z < FIELD_BOUNDS.maxZ; z++) {
  for (let x = FIELD_BOUNDS.minX + 1; x < FIELD_BOUNDS.maxX; x++) {
    // The central operating platform/depot occupies this reserved grid region.
    if (Math.abs(x) <= 6 && Math.abs(z) <= 4) continue;
    if (NAVIGATION_OBSTACLES.some(obstacle => Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius + .3)) continue;
    SITE_SLOTS.push([x, z]);
  }
}

let RESOURCE_DEFINITIONS = [
  { id: 'credits', currency: 'credits', valuePerCargo: 5, spawnWeight: 1, minStock: 4, maxStock: 6, respawnSeconds: 5, zone: 'frontier' },
  { id: 'scrap', currency: 'scrap', valuePerCargo: 2, spawnWeight: 1, minStock: 5, maxStock: 7, respawnSeconds: 5, zone: 'frontier' },
  { id: 'alloy', currency: 'credits', valuePerCargo: 18, spawnWeight: .5, minStock: 2, maxStock: 4, respawnSeconds: 5, zone: 'quarry', unlockNode: 'prospecting' },
];

export function salvageSitesForSeed(seed = 7, resources = RESOURCE_DEFINITIONS, technologyEffects = {}) {
  let state = Number.isInteger(seed) ? seed >>> 0 : 7;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const slots = SITE_SLOTS.map(([x, z]) => ({ x, z }));
  for (let index = slots.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [slots[index], slots[swap]] = [slots[swap], slots[index]];
  }

  const unlocked = technologyEffects.unlockResources || [];
  const unlockedZones = [...new Set(['frontier', ...(technologyEffects.unlockZones || [])])];
  const eligible = resources.filter(resource => (!resource.unlockNode || unlocked.includes(resource.id))
    && (!resource.zone || unlockedZones.includes(resource.zone)));
  return slots.slice(0, 8).map((slot, index) => {
    const totalWeight = eligible.reduce((sum, resource) => sum + resource.spawnWeight * (technologyEffects.spawnWeightMultipliers?.[resource.id] ?? 1), 0);
    let roll = random() * totalWeight;
    let resource = eligible[0];
    for (const candidate of eligible) {
      roll -= candidate.spawnWeight * (technologyEffects.spawnWeightMultipliers?.[candidate.id] ?? 1);
      if (roll < 0) { resource = candidate; break; }
    }
    const baseStock = resource.minStock + Math.floor(random() * (resource.maxStock - resource.minStock + 1));
    const stock = Math.min(1000, Math.ceil(baseStock * (technologyEffects.stockMultipliers?.[resource.id] ?? 1)));
    const respawnSeconds = resource.respawnSeconds * (technologyEffects.respawnTimeMultipliers?.[resource.id] ?? 1);
    return { id: `site-${index}`, x: slot.x, z: slot.z, resource: resource.id, stock, respawnSeconds };
  });
}

export const SALVAGE_SITES = salvageSitesForSeed();

export const DEFAULT_PROGRAM = [
  { action: 'patrol' }, { action: 'scan' }, { action: 'collect', resource: 'credits' },
];

const HOME = STORAGE_DEPOT;
let magnetScrapMultiplier = 1.6;

export function setSimulationCatalog(catalog) {
  const rewards = catalog?.rewards;
  if (Array.isArray(catalog?.resources) && catalog.resources.length) RESOURCE_DEFINITIONS = catalog.resources.map(resource => ({ ...resource }));
  if (rewards && Number.isFinite(rewards.magnetScrapMultiplier) && rewards.magnetScrapMultiplier >= 1) magnetScrapMultiplier = rewards.magnetScrapMultiplier;
}
export class SalvageSimulation {
  constructor(onDelivery = () => {}, { seed = 7, technologyEffects = {} } = {}) {
    this.onDelivery = onDelivery;
    this.seed = Number.isInteger(seed) ? seed >>> 0 : 7;
    this.technologyEffects = technologyEffects;
    this.resourceDefinitions = RESOURCE_DEFINITIONS.map(resource => ({ ...resource }));
    this.events = [];
    this.nextEventId = 1;
    this.activeProgram = [...DEFAULT_PROGRAM];
    this.unitPrograms = {};
    this.upgrades = {};
    this.elapsed = 0;
    this.nodes = salvageSitesForSeed(this.seed, this.resourceDefinitions, this.technologyEffects).map(site => ({ ...site, remaining: site.stock, respawn: 0, scanned: false }));
    this.robots = [];
  }

  setWorldSeed(seed) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return false;
    this.seed = seed >>> 0;
    this.nodes = salvageSitesForSeed(this.seed, this.resourceDefinitions, this.technologyEffects).map(site => ({ ...site, remaining: site.stock, respawn: 0, scanned: false }));
    return true;
  }

  setTechnologyEffects(effects = {}) {
    this.technologyEffects = effects;
    this.nodes = salvageSitesForSeed(this.seed, this.resourceDefinitions, effects).map(site => ({ ...site, remaining: site.stock, respawn: 0, scanned: false }));
  }

  setResourceDefinitions(resources) {
    if (!Array.isArray(resources) || !resources.length) return false;
    this.resourceDefinitions = resources.map(resource => ({ ...resource }));
    this.nodes = salvageSitesForSeed(this.seed, this.resourceDefinitions, this.technologyEffects).map(site => ({ ...site, remaining: site.stock, respawn: 0, scanned: false }));
    return true;
  }

  applyWorldSnapshot(nodes) {
    if (!Array.isArray(nodes) || nodes.length !== this.nodes.length) return false;
    const incoming = new Map(nodes.map(node => [node.id, node]));
    if (this.nodes.some(node => !incoming.has(node.id))) return false;
    this.nodes = this.nodes.map(node => {
      const value = incoming.get(node.id);
      if (!Number.isFinite(value.x) || !Number.isFinite(value.z) || Math.abs(value.x) > 16 || Math.abs(value.z) > 10
        || !this.resourceDefinitions.some(resource => resource.id === value.resource) || !Number.isFinite(value.stock) || !Number.isFinite(value.remaining)) return node;
      return { ...node, x: value.x, z: value.z, resource: value.resource, stock: value.stock,
        remaining: value.remaining, scanned: Boolean(value.scanned),
        ...(Number.isFinite(value.respawnSeconds) && value.respawnSeconds > 0 ? { respawnSeconds: value.respawnSeconds } : {}) };
    });
    return true;
  }

  syncCrew(owned = {}) {
    const count = Math.min(20, Object.values(owned).reduce((sum, n) => sum + Math.max(0, Number(n) || 0), 0));
    const old = this.robots.length;
    this.robots.length = count;
    for (let i = old; i < count; i++) {
      const kind = i < (owned.scavenger || 0) ? 'scavenger' : i < (owned.scavenger || 0) + (owned.scrap_hound || 0) ? 'scrap_hound' : 'fabricator';
      this.robots[i] = {
        id: i, kind, x: HOME.x + (i % 3 - 1) * .85, z: HOME.z + 1.1 + Math.floor(i / 3) * .8,
        program: (this.unitPrograms[i] || this.activeProgram).map(step => ({ ...step })), command: 0, phase: 'idle', targetId: null,
        cargo: 0, cargoType: 'credits', work: 0, wait: 0, status: 'Ready',
        navigationGoal: null, bestDistance: null, stalledTicks: 0,
      };
    }
    this.robots.forEach((robot, index) => { robot.id = index; });
  }

  loadAssignments(assignments = {}) {
    const crewProgram = parseProgram(assignments.crew);
    this.activeProgram = crewProgram.length ? crewProgram : [...DEFAULT_PROGRAM];
    this.unitPrograms = {};
    if (assignments.units && typeof assignments.units === 'object' && !Array.isArray(assignments.units)) {
      for (const [id, program] of Object.entries(assignments.units)) {
        const unitId = Number(id), safeProgram = parseProgram(program);
        if (Number.isInteger(unitId) && unitId >= 0 && safeProgram.length) this.unitPrograms[unitId] = safeProgram;
      }
    }
    this.robots.forEach(robot => this.applyProgram(robot, this.unitPrograms[robot.id] || this.activeProgram));
  }

  assignments() {
    return { crew: this.activeProgram.map(step => ({ ...step })), units: Object.fromEntries(Object.entries(this.unitPrograms).map(([id, program]) => [id, program.map(step => ({ ...step }))])) };
  }

  deploy(program, targetId = null) {
    const safeProgram = parseProgram(program);
    if (targetId === null || targetId === 'all') {
      this.activeProgram = safeProgram.map(step => ({ ...step }));
      this.unitPrograms = {};
      this.robots.forEach(robot => this.applyProgram(robot, this.activeProgram));
    } else {
      const robot = this.robots[Number(targetId)];
      if (!robot) return 0;
      this.unitPrograms[robot.id] = safeProgram.map(step => ({ ...step }));
      this.applyProgram(robot, safeProgram);
    }
    return safeProgram.length;
  }

  applyProgram(robot, program) {
    robot.program = program.map(step => ({ ...step }));
    robot.command = 0; robot.phase = 'idle'; robot.targetId = null; robot.cargo = 0;
    robot.navigationGoal = null; robot.bestDistance = null; robot.stalledTicks = 0;
    robot.status = program.length ? 'Program deployed' : 'No program loaded';
  }

  setUpgrades(upgrades = {}) { this.upgrades = { ...upgrades }; }

  tick(deltaSeconds) {
    const dt = Math.max(0, Math.min(.1, Number(deltaSeconds) || 0));
    if (!dt) return;
    this.elapsed += dt;
    for (const node of this.nodes) {
      if (node.remaining <= 0) {
        node.respawn -= dt;
        if (node.respawn <= 0) { node.remaining = node.stock; node.scanned = false; }
      }
    }
    this.robots.forEach(robot => this.stepRobot(robot, dt));
  }

  stepRobot(robot, dt) {
    const input = robot.manualInput || { x: 0, z: 0 };
    if (input.x || input.z) {
      if (!robot.manualActive) { robot.phase = 'manual'; robot.targetId = null; robot.destination = null; }
      robot.manualActive = true; robot.phase = 'manual'; robot.status = 'Manual pilot';
      const length = Math.hypot(input.x, input.z) || 1;
      const speed = (robot.kind === 'scrap_hound' ? 2.5 : 1.8) * (this.upgrades.servo ? 1.25 : 1);
      const angle = Math.atan2(input.z / length, input.x / length), side = robot.id % 2 === 0 ? 1 : -1;
      const offsets = [0];
      for (let turn = 1; turn <= 8; turn++) offsets.push(side * turn * .35, -side * turn * .35);
      offsets.push(Math.PI);
      for (const offset of offsets) {
        const x = robot.x + Math.cos(angle + offset) * speed * dt;
        const z = robot.z + Math.sin(angle + offset) * speed * dt;
        if (Math.abs(x) > FIELD_BOUNDS.maxX || Math.abs(z) > FIELD_BOUNDS.maxZ || !this.positionIsClear(robot, x, z)) continue;
        robot.x = x; robot.z = z;
        break;
      }
      return;
    }
    if (robot.manualActive) { robot.manualActive = false; robot.phase = 'idle'; robot.status = 'Program resumed'; }
    if (!robot.program.length && robot.phase === 'idle') { robot.status = 'Waiting for a program'; return; }
    let safety = 0;
    while (robot.phase === 'idle' && safety++ < 8) {
      const step = robot.program[robot.command % robot.program.length];
      if (step.action === 'patrol') {
        const collectStep = robot.program.slice(robot.command).find(item => item.action === 'collect') || robot.program.find(item => item.action === 'collect');
        const target = this.findSite(robot, collectStep?.resource || 'credits');
        if (!target) { robot.status = 'No matching salvage nearby'; return; }
        robot.targetId = target.id; robot.phase = 'travel'; robot.status = `Driving to ${target.resource} cache`;
      } else if (step.action === 'scan') {
        const target = this.target(robot);
        if (!target || target.remaining <= 0) { this.next(robot); continue; }
        robot.phase = 'scan'; robot.work = .65; robot.status = 'Scanning salvage';
      } else if (step.action === 'collect') {
        const target = this.target(robot);
        if (!target || !target.scanned || target.remaining <= 0) { this.next(robot); continue; }
        robot.cargoType = step.resource; robot.phase = 'collect'; robot.work = 0;
        robot.status = `Collecting ${step.resource}`;
      } else if (step.action === 'move_to') {
        robot.destination = { x: step.x, z: step.z };
        robot.targetId = null; robot.phase = 'travel'; robot.status = `Moving to (${step.x}, ${step.z})`;
      } else if (step.action === 'return_home') {
        robot.phase = 'return'; robot.status = robot.cargo ? 'Returning with cargo' : 'Returning to base';
      } else if (step.action === 'wait') {
        robot.wait = step.seconds; robot.phase = 'wait'; robot.status = 'Waiting';
      } else if (step.action === 'if_cargo') {
        if (robot.cargo > 0) this.next(robot);
        else this.next(robot, step.skip + 1);
        continue;
      } else if (step.action === 'if_site') {
        if (this.nodes.some(node => node.resource === step.resource && node.remaining > 0)) this.next(robot);
        else this.next(robot, step.skip + 1);
        continue;
      }
    }

    if (robot.phase === 'travel') {
      const target = this.target(robot) || robot.destination;
      if (!target || (target.remaining !== undefined && target.remaining <= 0)) { robot.targetId = null; robot.phase = 'idle'; return; }
      if (this.moveToward(robot, target, dt)) {
        robot.destination = null; robot.phase = 'idle';
        if (robot.program.length) this.next(robot); else robot.status = 'Waypoint reached';
        robot.navigationGoal = null; robot.bestDistance = null; robot.stalledTicks = 0;
      } else if (this.updateNavigationProgress(robot, target)) {
        if (robot.cargo === 0) {
          robot.targetId = null; robot.destination = null; robot.phase = 'idle';
          robot.status = 'Route blocked; replanning'; robot.navigationGoal = null; robot.bestDistance = null;
          robot.stalledTicks = 0; this.next(robot);
        } else {
          robot.status = 'Waiting for a clear route with cargo';
        }
      }
    } else if (robot.phase === 'scan') {
      robot.work -= dt;
      if (robot.work <= 0) {
        const target = this.target(robot);
        if (target && target.remaining > 0) {
          target.scanned = true; robot.status = 'Salvage found';
          this.recordEvent('scan', { robotId: robot.id, siteId: target.id, resource: target.resource });
        }
        robot.phase = 'idle'; this.next(robot);
      }
    } else if (robot.phase === 'collect') {
      const target = this.target(robot);
      if (!target || target.remaining <= 0 || robot.cargo >= this.capacity(robot)) {
        if (robot.cargo > 0) { robot.phase = 'return'; robot.status = 'Returning with cargo'; }
        else { robot.phase = 'idle'; robot.targetId = null; this.next(robot); }
        return;
      }
      const rate = robot.kind === 'scrap_hound' ? 1.7 : robot.kind === 'fabricator' ? .72 : 1;
      robot.work += dt * rate * (this.upgrades.servo ? 1.25 : 1);
      while (robot.work >= 1 && target.remaining > 0 && robot.cargo < this.capacity(robot)) {
        robot.work -= 1; target.remaining -= 1; robot.cargo += 1;
        this.recordEvent('collect', { robotId: robot.id, siteId: target.id, resource: robot.cargoType, amount: 1 });
      }
      if (target.remaining <= 0) target.respawn = target.respawnSeconds;
      if (robot.cargo >= this.capacity(robot) || target.remaining <= 0) {
        robot.phase = 'return'; robot.status = 'Returning with cargo';
      }
    } else if (robot.phase === 'return') {
      if (this.moveToward(robot, HOME, dt)) {
        if (robot.cargo > 0) {
          const definition = this.resourceDefinitions.find(resource => resource.id === robot.cargoType);
          const currency = definition?.currency || robot.cargoType;
          const magnetBonus = robot.cargoType === 'scrap' && this.upgrades.magnet ? magnetScrapMultiplier : 1;
          const valueBonus = this.technologyEffects.deliveryValueMultipliers?.[robot.cargoType] ?? 1;
          const amount = Math.floor(robot.cargo * (definition?.valuePerCargo || 0) * magnetBonus * valueBonus);
          this.recordEvent('delivery', { robotId: robot.id, resource: currency, cargoResource: robot.cargoType, cargo: robot.cargo, amount });
          this.onDelivery(currency, amount, robot);
        }
        robot.cargo = 0; robot.targetId = null; robot.phase = 'idle'; robot.status = 'Cargo delivered'; this.next(robot);
        robot.navigationGoal = null; robot.bestDistance = null; robot.stalledTicks = 0;
      } else if (this.updateNavigationProgress(robot, HOME)) {
        robot.status = 'Waiting for a clear depot approach';
      }
    } else if (robot.phase === 'wait') {
      robot.wait -= dt;
      if (robot.wait <= 0) { robot.phase = 'idle'; this.next(robot); }
    }
  }

  capacity(robot) { return robot.kind === 'fabricator' ? 6 : 4; }
  manualInput(robotId, x, z) {
    const robot = this.robots[Number(robotId)];
    if (!robot) return false;
    robot.manualInput = { x: Math.max(-1, Math.min(1, Number(x) || 0)), z: Math.max(-1, Math.min(1, Number(z) || 0)) };
    return true;
  }
  manualDestination(robotId, x, z) {
    const robot = this.robots[Number(robotId)];
    if (!robot) return false;
    robot.manualInput = { x: 0, z: 0 }; robot.manualActive = false;
    robot.destination = { x: Math.max(FIELD_BOUNDS.minX, Math.min(FIELD_BOUNDS.maxX, Number(x) || 0)), z: Math.max(FIELD_BOUNDS.minZ, Math.min(FIELD_BOUNDS.maxZ, Number(z) || 0)) };
    robot.targetId = null; robot.phase = 'travel'; robot.status = 'Driving to mouse waypoint';
    robot.navigationGoal = null; robot.bestDistance = null; robot.stalledTicks = 0;
    return true;
  }
  recordEvent(type, details) {
    const event = { id: this.nextEventId++, type, elapsed: Number(this.elapsed.toFixed(3)), ...details };
    this.events.push(event);
    if (this.events.length > 20) this.events.shift();
    return event;
  }
  target(robot) { return this.nodes.find(node => node.id === robot.targetId) || null; }
  findSite(robot, resource) {
    const candidates = this.nodes.filter(node => node.resource === resource && node.remaining > 0);
    candidates.sort((a, b) => Math.hypot(a.x - robot.x, a.z - robot.z) - Math.hypot(b.x - robot.x, b.z - robot.z));
    return candidates[0] || null;
  }
  next(robot, amount = 1) { robot.command = (robot.command + amount) % robot.program.length; }
  moveToward(robot, destination, dt) {
    const usesBerth = robot.targetId !== null || robot.phase === 'return'
      || (robot.phase === 'travel' && this.robots.length > 1);
    if (usesBerth) {
      if (robot.id > 0) {
        const angle = robot.id * 2.399963229728653;
        destination = { x: destination.x + Math.cos(angle) * .8, z: destination.z + Math.sin(angle) * .8 };
      }
    }
    const dx = destination.x - robot.x, dz = destination.z - robot.z;
    const distance = Math.hypot(dx, dz), speed = (robot.kind === 'scrap_hound' ? 2.5 : 1.8) * (this.upgrades.servo ? 1.25 : 1);
    if (distance <= .000001) return true;
    const directCompletion = distance <= speed * dt;
    const step = Math.min(speed * dt, distance);
    const angle = Math.atan2(dz, dx), side = robot.id % 2 === 0 ? 1 : -1;
    const offsets = [0];
    for (let turn = 1; turn <= 8; turn++) offsets.push(side * turn * .35, -side * turn * .35);
    offsets.push(Math.PI);
    for (const offset of offsets) {
      const nextX = directCompletion && offset === 0 ? destination.x : robot.x + Math.cos(angle + offset) * step;
      const nextZ = directCompletion && offset === 0 ? destination.z : robot.z + Math.sin(angle + offset) * step;
      if (Math.abs(nextX) > FIELD_BOUNDS.maxX || Math.abs(nextZ) > FIELD_BOUNDS.maxZ) continue;
      if (!this.positionIsClear(robot, nextX, nextZ)) continue;
      robot.x = nextX; robot.z = nextZ;
      return directCompletion && offset === 0;
    }
    return false;
  }

  positionIsClear(robot, x, z) {
    if (NAVIGATION_OBSTACLES.some(obstacle => Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius)) return false;
    if (this.technologyEffects.sceneUnlocks?.includes('survey_beacon') && Math.hypot(x + 3.1, z - 1.9) < .4) return false;
    if (this.technologyEffects.sceneUnlocks?.includes('refinery') && Math.hypot(x - 3.2, z + 1.9) < .75) return false;
    return this.robots.every(other => other.id === robot.id || Math.hypot(x - other.x, z - other.z) >= .65);
  }

  updateNavigationProgress(robot, goal) {
    const distance = Math.hypot(goal.x - robot.x, goal.z - robot.z);
    if (!robot.navigationGoal || Math.abs(robot.navigationGoal.x - goal.x) > .000001 || Math.abs(robot.navigationGoal.z - goal.z) > .000001) {
      robot.navigationGoal = { x: goal.x, z: goal.z };
      robot.bestDistance = distance;
      robot.stalledTicks = 0;
      return false;
    }
    if (distance < robot.bestDistance - .01) {
      robot.bestDistance = distance;
      robot.stalledTicks = 0;
      return false;
    }
    robot.stalledTicks++;
    return robot.stalledTicks >= 100;
  }

  snapshot() {
    return {
      robots: this.robots.map(({ id, kind, x, z, phase, targetId, cargo, cargoType, status }) => ({ id, kind, x, z, phase, targetId, cargo, cargoType, status })),
      nodes: this.nodes.map(({ id, x, z, resource, remaining, stock, scanned, respawnSeconds }) => ({ id, x, z, resource, remaining, stock, scanned, respawnSeconds })),
      events: this.events.map(event => ({ ...event })),
      seed: this.seed,
      elapsed: Number(this.elapsed.toFixed(3)),
    };
  }
}
