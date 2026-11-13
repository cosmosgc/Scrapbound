import { parseProgram } from './program-schema.js';

export const SIMULATION_CORE_VERSION = 6;
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
const NAVIGATION_GRID_STEP = .5;
for (let z = -9; z <= 9; z += 2) {
  for (let x = -15; x <= 15; x += 2) {
    // Solid voxel blocks fill the mining field; keep the depot/platform clear.
    if (Math.abs(x) <= 5 && Math.abs(z) <= 3) continue;
    SITE_SLOTS.push([x, z]);
  }
}

let RESOURCE_DEFINITIONS = [
  { id: 'credits', currency: 'credits', valuePerCargo: 5, spawnWeight: 1, minStock: 4, maxStock: 6, respawnSeconds: 60, zone: 'frontier' },
  { id: 'scrap', currency: 'scrap', valuePerCargo: 2, spawnWeight: 1, minStock: 5, maxStock: 7, respawnSeconds: 60, zone: 'frontier' },
  { id: 'alloy', currency: 'credits', valuePerCargo: 18, spawnWeight: .5, minStock: 2, maxStock: 4, respawnSeconds: 60, zone: 'quarry', unlockNode: 'prospecting' },
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
  return slots.map((slot, index) => {
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
    return { id: `block-${index}`, x: slot.x, z: slot.z, resource: resource.id, stock, respawnSeconds };
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
    this.rolePrograms = {};
    this.upgrades = {};
    this.elapsed = 0;
    this.nodes = salvageSitesForSeed(this.seed, this.resourceDefinitions, this.technologyEffects).map(site => ({ ...site, remaining: site.stock, respawn: 0, scanned: false }));
    this.robots = [];
    this.drops = [];
  }

  setWorldSeed(seed) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return false;
    this.seed = seed >>> 0;
    this.nodes = salvageSitesForSeed(this.seed, this.resourceDefinitions, this.technologyEffects).map(site => ({ ...site, remaining: site.stock, respawn: 0, scanned: false }));
    this.robots.forEach(robot => this.resetNavigationPath(robot));
    return true;
  }

  setTechnologyEffects(effects = {}) {
    this.technologyEffects = effects;
    this.nodes = salvageSitesForSeed(this.seed, this.resourceDefinitions, effects).map(site => ({ ...site, remaining: site.stock, respawn: 0, scanned: false }));
    this.robots.forEach(robot => this.resetNavigationPath(robot));
  }

  setResourceDefinitions(resources) {
    if (!Array.isArray(resources) || !resources.length) return false;
    this.resourceDefinitions = resources.map(resource => ({ ...resource }));
    this.nodes = salvageSitesForSeed(this.seed, this.resourceDefinitions, this.technologyEffects).map(site => ({ ...site, remaining: site.stock, respawn: 0, scanned: false }));
    this.robots.forEach(robot => this.resetNavigationPath(robot));
    return true;
  }

  applyWorldSnapshot(nodes, drops = []) {
    if (!Array.isArray(nodes) || nodes.length !== this.nodes.length) return false;
    const incoming = new Map(nodes.map(node => [node.id, node]));
    if (this.nodes.some(node => !incoming.has(node.id))) return false;
    this.nodes = this.nodes.map(node => {
      const value = incoming.get(node.id);
      if (!Number.isFinite(value.x) || !Number.isFinite(value.z) || Math.abs(value.x) > 16 || Math.abs(value.z) > 10
        || !this.resourceDefinitions.some(resource => resource.id === value.resource) || !Number.isFinite(value.stock) || !Number.isFinite(value.remaining)) return node;
      return { ...node, x: value.x, z: value.z, resource: value.resource, stock: value.stock,
        remaining: value.remaining, scanned: Boolean(value.scanned),
        ...(Number.isFinite(value.respawnRemaining) && value.respawnRemaining >= 0 ? { respawn: value.respawnRemaining } : {}),
        ...(Number.isFinite(value.respawnSeconds) && value.respawnSeconds > 0 ? { respawnSeconds: value.respawnSeconds } : {}) };
    });
    this.robots.forEach(robot => this.resetNavigationPath(robot));
    if (Array.isArray(drops) && drops.length <= 500) {
      const validResources = new Set(this.resourceDefinitions.map(resource => resource.id));
      this.drops = drops.filter(drop => drop && typeof drop.id === 'string' && drop.id.length <= 80
        && Number.isFinite(drop.x) && Number.isFinite(drop.z) && Math.abs(drop.x) <= 16 && Math.abs(drop.z) <= 10
        && validResources.has(drop.resource) && Number.isInteger(drop.amount) && drop.amount > 0)
        .map(drop => ({ id: drop.id, x: drop.x, z: drop.z, resource: drop.resource, amount: Math.min(1000, drop.amount) }));
    }
    return true;
  }

  syncCrew(owned = {}) {
    const count = Math.min(20, Object.values(owned).reduce((sum, n) => sum + Math.max(0, Number(n) || 0), 0));
    const old = this.robots.length;
    this.robots.length = count;
    for (let i = old; i < count; i++) {
      let kind = 'scavenger', boundary = 0;
      for (const [candidate, amount] of Object.entries(owned)) {
        boundary += Math.max(0, Number(amount) || 0);
        if (i < boundary) { kind = candidate; break; }
      }
      this.robots[i] = {
        id: i, kind, x: HOME.x + (i % 3 - 1) * .85, z: HOME.z + 1.1 + Math.floor(i / 3) * .8,
        program: (this.unitPrograms[i] || this.rolePrograms[kind] || this.activeProgram).map(step => ({ ...step })), command: 0, phase: 'idle', targetId: null,
        cargo: 0, cargoType: 'credits', work: 0, wait: 0, status: 'Ready', automation: !this.unitPrograms[i] && !this.rolePrograms[kind] && JSON.stringify(this.activeProgram) === JSON.stringify(DEFAULT_PROGRAM),
        programTask: null, assistTime: 0,
        navigationGoal: null, bestDistance: null, stalledTicks: 0,
        navigationPathGoal: null, navigationPath: [], navigationPathReady: false, navigationPathBlocked: false,
        manualWaypointActive: false,
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
    this.robots.forEach(robot => {
      const program = this.unitPrograms[robot.id] || this.rolePrograms[robot.kind] || this.activeProgram;
      this.applyProgram(robot, program);
      robot.automation = !this.rolePrograms[robot.kind] && JSON.stringify(program) === JSON.stringify(DEFAULT_PROGRAM);
    });
  }

  assignments() {
    return { crew: this.activeProgram.map(step => ({ ...step })), units: Object.fromEntries(Object.entries(this.unitPrograms).map(([id, program]) => [id, program.map(step => ({ ...step }))])) };
  }

  deploy(program, targetId = null) {
    const safeProgram = parseProgram(program);
    const automatic = JSON.stringify(safeProgram) === JSON.stringify(DEFAULT_PROGRAM);
    if (targetId === null || targetId === 'all') {
      this.activeProgram = safeProgram.map(step => ({ ...step }));
      this.unitPrograms = {};
      this.rolePrograms = {};
      this.robots.forEach(robot => { this.applyProgram(robot, this.activeProgram); robot.automation = automatic; });
    } else {
      const robot = this.robots[Number(targetId)];
      if (!robot) return 0;
      this.unitPrograms[robot.id] = safeProgram.map(step => ({ ...step }));
      this.applyProgram(robot, safeProgram);
      robot.automation = automatic;
    }
    return safeProgram.length;
  }

  deployRole(kind, program) {
    const safeProgram = parseProgram(program);
    if (!safeProgram.length) return 0;
    this.rolePrograms[kind] = safeProgram;
    this.robots.filter(robot => robot.kind === kind).forEach(robot => {
      delete this.unitPrograms[robot.id];
      this.applyProgram(robot, safeProgram);
      robot.automation = false;
    });
    return safeProgram.length;
  }

  applyProgram(robot, program) {
    robot.program = program.map(step => ({ ...step }));
    robot.command = 0; robot.phase = 'idle'; robot.targetId = null; robot.cargo = 0;
    robot.programTask = null; robot.assistTime = 0;
    robot.navigationGoal = null; robot.bestDistance = null; robot.stalledTicks = 0;
    this.resetNavigationPath(robot);
    robot.status = program.length ? 'Program deployed' : 'No program loaded';
  }

  resetNavigationPath(robot) {
    robot.navigationPathGoal = null; robot.navigationPath = [];
    robot.navigationPathReady = false; robot.navigationPathBlocked = false;
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
    this.drops = this.drops.filter(drop => drop.amount > 0);
    this.robots.forEach(robot => this.stepRobot(robot, dt));
  }

  stepRobot(robot, dt) {
    const input = robot.manualInput || { x: 0, z: 0 };
    if (input.x || input.z) {
      if (!robot.manualActive) {
        robot.phase = 'manual'; robot.targetId = null; robot.targetDropId = null; robot.destination = null;
        robot.manualWaypointActive = false; this.resetNavigationPath(robot);
      }
      robot.manualActive = true; robot.phase = 'manual'; robot.status = 'Manual pilot';
      const length = Math.hypot(input.x, input.z) || 1;
      const speed = this.movementSpeed(robot) * (this.upgrades.servo ? 1.25 : 1);
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
    if (robot.manualWaypointActive) {
      const destination = robot.destination;
      if (!destination || this.moveToward(robot, destination, dt, false)) {
        robot.manualWaypointActive = false; robot.destination = null; robot.phase = 'idle'; robot.status = 'Waypoint reached';
        robot.navigationGoal = null; robot.bestDistance = null; robot.stalledTicks = 0; this.resetNavigationPath(robot);
      } else if (this.updateNavigationProgress(robot, destination)) {
        robot.manualWaypointActive = false; robot.destination = null; robot.phase = 'idle'; robot.status = 'Route blocked; replanning';
        robot.navigationGoal = null; robot.bestDistance = null; robot.stalledTicks = 0; this.resetNavigationPath(robot);
      }
      return;
    }
    if (robot.manualActive) {
      robot.manualActive = false; robot.phase = 'idle'; robot.status = robot.automation ? 'Automation resumed' : 'Program resumed';
    }
    if (robot.automation && ['scavenger', 'scrap_hound', 'fabricator', 'block_miner', 'sky_miner', 'cargo_hauler', 'buffer_bot'].includes(robot.kind)) {
      this.stepAutomaticRobot(robot, dt);
      return;
    }
    if (robot.phase === 'assist') {
      this.stepAssist(robot, dt);
      return;
    }
    if (!robot.program.length && robot.phase === 'idle') { robot.status = 'Waiting for a program'; return; }
    let safety = 0;
    while (robot.phase === 'idle' && safety++ < 8) {
      const step = robot.program[robot.command % robot.program.length];
      if (step.action === 'patrol') {
        const collectStep = robot.program.slice(robot.command).find(item => item.action === 'collect') || robot.program.find(item => item.action === 'collect');
        const target = this.findSite(robot, collectStep?.resource || 'credits');
        if (!target) { robot.status = 'No matching salvage nearby'; return; }
        robot.targetId = target.id; robot.phase = 'travel'; robot.status = `Driving to ${target.resource} cache`;
      } else if (step.action === 'seek') {
        const target = this.findSite(robot, step.resource);
        if (!target) { robot.status = `No ${step.resource} site available`; return; }
        robot.targetId = target.id; robot.programTask = 'seek'; robot.phase = 'travel'; robot.status = `Seeking ${step.resource} site`;
      } else if (step.action === 'scan') {
        const target = this.target(robot);
        if (!target || target.remaining <= 0) { this.next(robot); continue; }
        robot.phase = 'scan'; robot.work = .65; robot.status = 'Scanning salvage';
      } else if (step.action === 'collect') {
        const target = this.target(robot);
        if (!target || !target.scanned || target.remaining <= 0) { this.next(robot); continue; }
        robot.cargoType = step.resource; robot.phase = 'collect'; robot.work = 0;
        robot.status = `Collecting ${step.resource}`;
      } else if (step.action === 'mine') {
        const target = this.findSite(robot, step.resource);
        if (!target) { robot.status = `No ${step.resource} block available`; return; }
        robot.targetId = target.id; robot.programTask = 'mine'; robot.phase = 'travel';
        robot.status = `Driving to ${step.resource} block`;
      } else if (step.action === 'collect_drops') {
        const target = this.findDrop(robot, step.resource);
        if (!target) { robot.status = `No ${step.resource} drops available`; return; }
        robot.targetId = target.id; robot.programTask = 'pickup'; robot.phase = 'travel';
        robot.status = `Driving to ${step.resource} drop`;
      } else if (step.action === 'assist') {
        robot.assistTime = step.seconds; robot.phase = 'assist'; robot.status = 'Looking for a teammate to assist';
        this.stepAssist(robot, dt);
        return;
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
      } else if (step.action === 'if_full') {
        if (robot.cargo >= this.capacity(robot)) this.next(robot);
        else this.next(robot, step.skip + 1);
        continue;
      } else if (step.action === 'if_cargo_percent') {
        if (robot.cargo / this.capacity(robot) * 100 >= step.percent) this.next(robot);
        else this.next(robot, step.skip + 1);
        continue;
      } else if (step.action === 'if_robot_type') {
        if (robot.kind === step.kind) this.next(robot);
        else this.next(robot, step.skip + 1);
        continue;
      } else if (step.action === 'if_site') {
        if (this.nodes.some(node => node.resource === step.resource && node.remaining > 0)) this.next(robot);
        else this.next(robot, step.skip + 1);
        continue;
      } else if (step.action === 'if_drop') {
        if (this.drops.some(drop => drop.resource === step.resource && drop.amount > 0)) this.next(robot);
        else this.next(robot, step.skip + 1);
        continue;
      }
    }

    if (robot.phase === 'travel') {
    const entity = this.target(robot) || this.drops.find(drop => drop.id === robot.targetId);
    const target = entity ? (this.target(robot) ? this.blockApproachPoint(robot, entity) : this.dropApproachPoint(robot, entity)) : robot.destination;
    if (!target) {
      const task = robot.programTask;
      robot.targetId = null; robot.phase = 'idle'; robot.programTask = null;
      if (task) this.next(robot);
      return;
    }
      if (!target || (target.remaining !== undefined && target.remaining <= 0)) { robot.targetId = null; robot.phase = 'idle'; return; }
      if (this.moveToward(robot, target, dt, !entity)) {
        robot.destination = null;
        if (robot.programTask === 'mine') {
          robot.phase = 'mining'; robot.work = 0; robot.status = 'Breaking resource block';
        } else if (robot.programTask === 'pickup') {
          robot.phase = 'pickup'; robot.status = 'Picking up dropped resource';
        } else {
          robot.phase = 'idle'; robot.programTask = null;
          if (robot.program.length) this.next(robot); else robot.status = 'Waypoint reached';
        }
        robot.navigationGoal = null; robot.bestDistance = null; robot.stalledTicks = 0;
        this.resetNavigationPath(robot);
      } else if (this.updateNavigationProgress(robot, target)) {
        if (robot.cargo === 0) {
          robot.targetId = null; robot.destination = null; robot.phase = 'idle';
          robot.status = 'Route blocked; replanning'; robot.navigationGoal = null; robot.bestDistance = null;
          robot.stalledTicks = 0; this.next(robot);
          this.resetNavigationPath(robot);
        } else {
          robot.status = 'Waiting for a clear route with cargo';
        }
      }
    } else if (robot.phase === 'mining') {
      const block = this.target(robot);
      if (!block || block.remaining <= 0) {
        robot.targetId = null; robot.phase = 'idle'; robot.programTask = null; this.next(robot); return;
      }
      const supported = this.robots.some(other => other.kind === 'buffer_bot' && Math.hypot(other.x - robot.x, other.z - robot.z) <= 2.5);
      const rate = robot.kind === 'block_miner' ? 2.4 : robot.kind === 'scrap_hound' ? 2 : robot.kind === 'fabricator' ? 1.2 : robot.kind === 'sky_miner' ? .85 : .8;
      robot.work += dt * rate * (supported ? 1.5 : 1) * (this.upgrades.servo ? 1.25 : 1);
      while (robot.work >= 1 && block.remaining > 0) { robot.work--; block.remaining--; }
      if (block.remaining <= 0) {
        const amount = Math.max(1, Math.ceil(block.stock / 3));
        this.drops.push({ id: `drop-${block.id}-${this.nextEventId}`, x: block.x, z: block.z, resource: block.resource, amount });
        block.respawn = block.respawnSeconds;
        this.recordEvent('block_break', { robotId: robot.id, blockId: block.id, resource: block.resource, amount });
        robot.targetId = null; robot.programTask = null; robot.phase = 'idle'; robot.status = `Block broken · ${amount} ${block.resource} dropped`; this.next(robot);
      }
    } else if (robot.phase === 'pickup') {
      const drop = this.drops.find(entry => entry.id === robot.targetId && entry.amount > 0);
      if (!drop) { robot.targetId = null; robot.programTask = null; robot.phase = 'idle'; this.next(robot); return; }
      const quantity = Math.min(drop.amount, this.capacity(robot) - robot.cargo);
      robot.cargo += quantity; robot.cargoType = drop.resource; drop.amount -= quantity;
      this.recordEvent('pickup', { robotId: robot.id, dropId: drop.id, resource: drop.resource, amount: quantity });
      this.drops = this.drops.filter(entry => entry.amount > 0);
      robot.targetId = null; robot.programTask = null; robot.phase = 'return'; robot.status = 'Returning with mined resources';
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
      const rate = robot.kind === 'scrap_hound' ? 1.7 : robot.kind === 'fabricator' ? .72 : robot.kind === 'sky_miner' ? .42 : robot.kind === 'block_miner' ? 2 : robot.kind === 'cargo_hauler' ? .8 : 1;
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
        this.resetNavigationPath(robot);
      } else if (this.updateNavigationProgress(robot, HOME)) {
        robot.status = 'Waiting for a clear depot approach';
        this.resetNavigationPath(robot);
      }
    } else if (robot.phase === 'wait') {
      robot.wait -= dt;
      if (robot.wait <= 0) { robot.phase = 'idle'; this.next(robot); }
    }
  }

  stepAutomaticRobot(robot, dt) {
    if (robot.kind === 'buffer_bot') {
      const supported = this.robots.find(other => other.id !== robot.id && ['mining', 'travel'].includes(other.phase) && ['fabricator', 'block_miner', 'sky_miner', 'scavenger'].includes(other.kind));
      if (supported) {
        robot.x = supported.x - .9; robot.z = supported.z - .9;
        robot.status = `Boosting unit ${String(supported.id + 1).padStart(2, '0')}`;
      } else robot.status = 'Buffer ready at depot';
      robot.phase = 'support';
      return;
    }

    const isMiner = ['scrap_hound', 'fabricator', 'block_miner', 'sky_miner'].includes(robot.kind);
    const isGeneralist = robot.kind === 'scavenger';
    const assigned = new Set(this.robots.filter(other => other.id !== robot.id && other.targetId !== null).map(other => other.targetId));

    if (robot.phase === 'return') {
      if (this.moveToward(robot, HOME, dt)) {
        if (robot.cargo > 0) {
          const definition = this.resourceDefinitions.find(resource => resource.id === robot.cargoType);
          const currency = definition?.currency || robot.cargoType;
          const amount = Math.floor(robot.cargo * (definition?.valuePerCargo || 0) * (this.technologyEffects.deliveryValueMultipliers?.[robot.cargoType] ?? 1));
          this.recordEvent('delivery', { robotId: robot.id, resource: currency, cargoResource: robot.cargoType, cargo: robot.cargo, amount });
          this.onDelivery(currency, amount, robot);
        }
        robot.cargo = 0; robot.targetId = null; robot.phase = 'idle'; robot.status = 'Cargo delivered';
        this.resetNavigationPath(robot);
      } else if (this.updateNavigationProgress(robot, HOME)) {
        robot.status = 'Waiting for a clear depot approach';
        this.resetNavigationPath(robot);
      }
      return;
    }

    if (robot.phase === 'travel') {
      const block = this.nodes.find(node => node.id === robot.targetId);
      const drop = this.drops.find(entry => entry.id === robot.targetId && entry.amount > 0);
      const target = block || drop;
      if (!target) { robot.targetId = null; robot.phase = 'idle'; return; }
      const goal = block ? this.blockApproachPoint(robot, block) : this.dropApproachPoint(robot, drop);
      if (!goal) { robot.targetId = null; robot.phase = 'idle'; robot.status = 'Target blocked; choosing another route'; return; }
      if (this.moveToward(robot, goal, dt, false)) {
        robot.phase = block ? 'mining' : 'pickup';
        robot.work = 0;
        robot.status = block ? 'Breaking resource block' : 'Picking up dropped resource';
        robot.navigationGoal = null; robot.bestDistance = null; robot.stalledTicks = 0;
        this.resetNavigationPath(robot);
      } else if (this.updateNavigationProgress(robot, goal)) {
        robot.targetId = null; robot.phase = 'idle'; robot.status = 'Route blocked; choosing another target';
        robot.navigationGoal = null; robot.bestDistance = null; robot.stalledTicks = 0;
        this.resetNavigationPath(robot);
      }
      return;
    }

    if (robot.phase === 'mining') {
      const block = this.nodes.find(node => node.id === robot.targetId);
      if (!block || block.remaining <= 0) { robot.targetId = null; robot.phase = 'idle'; return; }
      const supported = this.robots.some(other => other.kind === 'buffer_bot' && Math.hypot(other.x - robot.x, other.z - robot.z) <= 2.5);
      const rate = robot.kind === 'sky_miner' ? .42 : robot.kind === 'block_miner' ? 2 : robot.kind === 'fabricator' ? 1.1 : robot.kind === 'scrap_hound' ? 1.7 : 1;
      robot.work += dt * rate * (supported ? 1.5 : 1);
      while (robot.work >= 1 && block.remaining > 0) {
        robot.work--;
        block.remaining--;
      }
      if (block.remaining <= 0) {
        const amount = Math.max(1, Math.ceil(block.stock / 3));
        this.drops.push({ id: `drop-${block.id}-${this.nextEventId}`, x: block.x, z: block.z, resource: block.resource, amount });
        block.respawn = block.respawnSeconds;
        this.recordEvent('block_break', { robotId: robot.id, blockId: block.id, resource: block.resource, amount });
        robot.targetId = null; robot.phase = 'idle'; robot.status = `Block broken · ${amount} ${block.resource} dropped`;
      }
      return;
    }

    if (robot.phase === 'pickup') {
      const drop = this.drops.find(entry => entry.id === robot.targetId && entry.amount > 0);
      if (!drop) { robot.targetId = null; robot.phase = 'idle'; return; }
      const quantity = Math.min(drop.amount, this.capacity(robot) - robot.cargo);
      drop.amount -= quantity; robot.cargo += quantity; robot.cargoType = drop.resource;
      this.recordEvent('pickup', { robotId: robot.id, dropId: drop.id, resource: drop.resource, amount: quantity });
      robot.targetId = null; robot.phase = 'return'; robot.status = 'Returning with mined resources';
      return;
    }

    if (robot.cargo >= this.capacity(robot)) { robot.phase = 'return'; return; }
    const availableDrop = this.drops.filter(drop => drop.amount > 0 && !assigned.has(drop.id))
      .sort((a, b) => Math.hypot(a.x - robot.x, a.z - robot.z) - Math.hypot(b.x - robot.x, b.z - robot.z))[0];
    if (!isMiner && availableDrop) {
      robot.targetId = availableDrop.id; robot.phase = 'travel'; robot.status = 'Driving to dropped resource';
      return;
    }
    if (!isMiner && !isGeneralist) { robot.status = 'Waiting for mined resources'; return; }
    const block = this.nodes.filter(node => node.remaining > 0 && !assigned.has(node.id) && this.blockApproachPoint(robot, node))
      .sort((a, b) => Math.hypot(a.x - robot.x, a.z - robot.z) - Math.hypot(b.x - robot.x, b.z - robot.z))[0];
    if (!block) { robot.status = 'Waiting for available block'; return; }
    robot.targetId = block.id; robot.phase = 'travel'; robot.status = 'Moving to resource block';
  }

  findDrop(robot, resource) {
    const assigned = new Set(this.robots.filter(other => other.id !== robot.id && other.targetId !== null).map(other => other.targetId));
    return this.drops.filter(drop => drop.resource === resource && drop.amount > 0 && !assigned.has(drop.id))
      .sort((a, b) => Math.hypot(a.x - robot.x, a.z - robot.z) - Math.hypot(b.x - robot.x, b.z - robot.z))[0] || null;
  }

  stepAssist(robot, dt) {
    robot.assistTime -= dt;
    const teammate = this.robots.filter(other => other.id !== robot.id && ['travel', 'mining', 'collect', 'scan'].includes(other.phase))
      .sort((a, b) => Math.hypot(a.x - robot.x, a.z - robot.z) - Math.hypot(b.x - robot.x, b.z - robot.z))[0];
    if (teammate) {
      const destination = { x: teammate.x - .9, z: teammate.z - .9 };
      this.moveToward(robot, destination, dt, false);
      robot.status = `Assisting unit ${String(teammate.id + 1).padStart(2, '0')}`;
    } else robot.status = 'No active teammate · holding position';
    if (robot.assistTime <= 0) {
      robot.assistTime = 0; robot.phase = 'idle'; robot.status = 'Support cycle complete'; this.next(robot);
    }
  }

  capacity(robot) { return robot.kind === 'cargo_hauler' ? 8 : robot.kind === 'fabricator' ? 6 : 4; }
  movementSpeed(robot) { return robot.kind === 'sky_miner' ? 3.2 : robot.kind === 'scrap_hound' ? 2.5 : robot.kind === 'cargo_hauler' ? 1.55 : 1.8; }
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
    robot.manualWaypointActive = true;
    robot.targetId = null; robot.phase = 'travel'; robot.status = 'Driving to mouse waypoint';
    robot.navigationGoal = null; robot.bestDistance = null; robot.stalledTicks = 0;
    this.resetNavigationPath(robot);
    return true;
  }
  recordEvent(type, details) {
    const event = { id: this.nextEventId++, type, elapsed: Number(this.elapsed.toFixed(3)), ...details };
    this.events.push(event);
    if (this.events.length > 20) this.events.shift();
    return event;
  }
  target(robot) { return this.nodes.find(node => node.id === robot.targetId) || null; }
  blockApproachPoint(robot, block) {
    const clearance = .96;
    const points = [
      { x: block.x + clearance, z: block.z }, { x: block.x - clearance, z: block.z },
      { x: block.x, z: block.z + clearance }, { x: block.x, z: block.z - clearance },
    ];
    const planned = robot.navigationPathGoal;
    if (planned) {
      const stable = points.find(point => Math.abs(point.x - planned.x) < .000001 && Math.abs(point.z - planned.z) < .000001);
      if (stable && this.positionIsStaticallyClear(robot, stable.x, stable.z)) return stable;
    }
    return points.filter(point => this.positionIsClear(robot, point.x, point.z))
      .sort((a, b) => Math.hypot(a.x - robot.x, a.z - robot.z) - Math.hypot(b.x - robot.x, b.z - robot.z))[0] || null;
  }
  dropApproachPoint(robot, drop) {
    const respawnedBlock = this.nodes.find(node => node.x === drop.x && node.z === drop.z && node.remaining > 0);
    return respawnedBlock ? this.blockApproachPoint(robot, respawnedBlock) : { x: drop.x, z: drop.z };
  }
  findSite(robot, resource) {
    const assigned = new Set(this.robots.filter(other => other.id !== robot.id && other.targetId !== null).map(other => other.targetId));
    const candidates = this.nodes.filter(node => node.resource === resource && node.remaining > 0 && !assigned.has(node.id)
      && this.blockApproachPoint(robot, node));
    candidates.sort((a, b) => Math.hypot(a.x - robot.x, a.z - robot.z) - Math.hypot(b.x - robot.x, b.z - robot.z));
    return candidates[0] || null;
  }
  next(robot, amount = 1) { robot.command = (robot.command + amount) % robot.program.length; }
  moveToward(robot, destination, dt, useBerth = true) {
    const usesBerth = useBerth && (robot.targetId !== null || robot.phase === 'return'
      || (robot.phase === 'travel' && this.robots.length > 1));
    if (usesBerth) {
      if (robot.id > 0) {
        const angle = robot.id * 2.399963229728653;
        destination = { x: destination.x + Math.cos(angle) * .8, z: destination.z + Math.sin(angle) * .8 };
      }
    }
    if (robot.kind !== 'sky_miner') {
      const goalChanged = !robot.navigationPathGoal
        || Math.abs(robot.navigationPathGoal.x - destination.x) > .000001
        || Math.abs(robot.navigationPathGoal.z - destination.z) > .000001;
      if (goalChanged) {
        robot.navigationPathGoal = { x: destination.x, z: destination.z };
        const path = this.findGridPath(robot, destination);
        robot.navigationPath = path || [];
        robot.navigationPathReady = true;
        robot.navigationPathBlocked = path === null;
      }
      if (robot.navigationPathBlocked) return false;
      while (robot.navigationPath.length && Math.hypot(
        robot.navigationPath[0].x - robot.x, robot.navigationPath[0].z - robot.z,
      ) <= .12) robot.navigationPath.shift();
      if (robot.navigationPath.length) {
        const waypoint = robot.navigationPath[0];
        if (this.moveDirectToward(robot, waypoint, dt)) {
          robot.navigationPath.shift();
        }
        return false;
      }
    }
    return this.moveDirectToward(robot, destination, dt);
  }

  findGridPath(robot, destination) {
    const width = Math.round((FIELD_BOUNDS.maxX - FIELD_BOUNDS.minX) / NAVIGATION_GRID_STEP) + 1;
    const height = Math.round((FIELD_BOUNDS.maxZ - FIELD_BOUNDS.minZ) / NAVIGATION_GRID_STEP) + 1;
    const total = width * height;
    const toCell = (x, z) => ({
      x: Math.max(0, Math.min(width - 1, Math.round((x - FIELD_BOUNDS.minX) / NAVIGATION_GRID_STEP))),
      z: Math.max(0, Math.min(height - 1, Math.round((z - FIELD_BOUNDS.minZ) / NAVIGATION_GRID_STEP))),
    });
    const indexOf = (cellX, cellZ) => cellZ * width + cellX;
    const pointOf = index => ({
      x: FIELD_BOUNDS.minX + (index % width) * NAVIGATION_GRID_STEP,
      z: FIELD_BOUNDS.minZ + Math.floor(index / width) * NAVIGATION_GRID_STEP,
    });
    if (!this.positionIsStaticallyClear(robot, destination.x, destination.z)) return null;
    const obstacles = robot.kind === 'sky_miner' ? [] : [...NAVIGATION_OBSTACLES,
      ...(this.technologyEffects.sceneUnlocks?.includes('survey_beacon') ? [{ x: -3.1, z: 1.9, radius: .4 }] : []),
      ...(this.technologyEffects.sceneUnlocks?.includes('refinery') ? [{ x: 3.2, z: -1.9, radius: .75 }] : []),
      ...this.nodes.filter(node => node.remaining > 0).map(node => ({ x: node.x, z: node.z, radius: .72 })),
    ];
    const blocked = new Uint8Array(total);
    for (const obstacle of obstacles) {
      const minX = Math.max(0, Math.floor((obstacle.x - obstacle.radius - FIELD_BOUNDS.minX) / NAVIGATION_GRID_STEP));
      const maxX = Math.min(width - 1, Math.ceil((obstacle.x + obstacle.radius - FIELD_BOUNDS.minX) / NAVIGATION_GRID_STEP));
      const minZ = Math.max(0, Math.floor((obstacle.z - obstacle.radius - FIELD_BOUNDS.minZ) / NAVIGATION_GRID_STEP));
      const maxZ = Math.min(height - 1, Math.ceil((obstacle.z + obstacle.radius - FIELD_BOUNDS.minZ) / NAVIGATION_GRID_STEP));
      for (let cellZ = minZ; cellZ <= maxZ; cellZ++) for (let cellX = minX; cellX <= maxX; cellX++) {
        const point = pointOf(indexOf(cellX, cellZ));
        if (Math.hypot(point.x - obstacle.x, point.z - obstacle.z) < obstacle.radius + NAVIGATION_GRID_STEP * .5) blocked[indexOf(cellX, cellZ)] = 1;
      }
    }
    const startCell = toCell(robot.x, robot.z);
    let start = -1;
    for (let radius = 0; radius <= 2 && start < 0; radius++) {
      const candidates = [];
      for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) + Math.abs(dz) !== radius) continue;
        const cellX = startCell.x + dx, cellZ = startCell.z + dz;
        if (cellX < 0 || cellX >= width || cellZ < 0 || cellZ >= height) continue;
        const index = indexOf(cellX, cellZ), point = pointOf(index);
        if (!blocked[index]) candidates.push({ index, gap: Math.hypot(point.x - robot.x, point.z - robot.z) });
      }
      candidates.sort((a, b) => a.gap - b.gap || a.index - b.index);
      if (candidates.length) start = candidates[0].index;
    }
    if (start < 0) return null;
    const goalCell = toCell(destination.x, destination.z);
    const goals = [];
    for (let radius = 0; radius <= 2; radius++) {
      for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) + Math.abs(dz) !== radius) continue;
        const cellX = goalCell.x + dx, cellZ = goalCell.z + dz;
        if (cellX < 0 || cellX >= width || cellZ < 0 || cellZ >= height) continue;
        const index = indexOf(cellX, cellZ), point = pointOf(index);
        const gap = Math.hypot(point.x - destination.x, point.z - destination.z);
        if (gap <= .8 && !blocked[index]) goals.push({ index, gap });
      }
      if (goals.length) break;
    }
    goals.sort((a, b) => a.gap - b.gap || a.index - b.index);
    if (!goals.length) return null;
    const goal = goals[0].index;
    if (goal === start) return [];

    const parents = new Int32Array(total);
    parents.fill(-2);
    parents[start] = -1;
    const queue = new Int32Array(total);
    let head = 0, tail = 0;
    queue[tail++] = start;
    const neighbors = [[1, 0], [0, 1], [0, -1], [-1, 0]];
    let found = false;
    while (head < tail && tail <= total) {
      const current = queue[head++];
      if (current === goal) { found = true; break; }
      const cellX = current % width, cellZ = Math.floor(current / width);
      for (const [dx, dz] of neighbors) {
        const nextX = cellX + dx, nextZ = cellZ + dz;
        if (nextX < 0 || nextX >= width || nextZ < 0 || nextZ >= height) continue;
        const next = indexOf(nextX, nextZ);
        if (parents[next] !== -2 || blocked[next]) continue;
        parents[next] = current;
        queue[tail++] = next;
      }
    }
    if (!found) return null;
    const path = [];
    for (let current = goal; current !== start; current = parents[current]) path.push(pointOf(current));
    path.reverse();
    return path;
  }

  positionIsStaticallyClear(robot, x, z) {
    if (robot.kind === 'sky_miner') return true;
    if (NAVIGATION_OBSTACLES.some(obstacle => Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius)) return false;
    if (this.nodes.some(node => node.remaining > 0 && Math.hypot(x - node.x, z - node.z) < .72)) return false;
    if (this.technologyEffects.sceneUnlocks?.includes('survey_beacon') && Math.hypot(x + 3.1, z - 1.9) < .4) return false;
    if (this.technologyEffects.sceneUnlocks?.includes('refinery') && Math.hypot(x - 3.2, z + 1.9) < .75) return false;
    return true;
  }

  moveDirectToward(robot, destination, dt) {
    const dx = destination.x - robot.x, dz = destination.z - robot.z;
    const distance = Math.hypot(dx, dz), speed = this.movementSpeed(robot) * (this.upgrades.servo ? 1.25 : 1);
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
    if (!this.positionIsStaticallyClear(robot, x, z)) return false;
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
      nodes: this.nodes.map(({ id, x, z, resource, remaining, stock, scanned, respawnSeconds, respawn }) => ({
        id, x, z, resource, remaining, stock, scanned, respawnSeconds, respawnRemaining: Math.max(0, respawn || 0),
      })),
      events: this.events.map(event => ({ ...event })),
      drops: this.drops.map(drop => ({ ...drop })),
      seed: this.seed,
      elapsed: Number(this.elapsed.toFixed(3)),
    };
  }
}
