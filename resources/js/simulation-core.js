import { parseProgram } from './program-schema.js';

export const SIMULATION_CORE_VERSION = 1;

export const SALVAGE_SITES = [
  { id: 'east-cache', x: 3.3, z: 1.7, resource: 'credits', stock: 4 },
  { id: 'north-cache', x: -2.5, z: -1.7, resource: 'credits', stock: 4 },
  { id: 'west-pile', x: -3.6, z: 1.4, resource: 'scrap', stock: 5 },
  { id: 'south-pile', x: 2.5, z: -1.8, resource: 'scrap', stock: 5 },
];

export const DEFAULT_PROGRAM = [
  { action: 'patrol' }, { action: 'scan' }, { action: 'collect', resource: 'credits' },
];

const HOME = { x: 0, z: 1.5 };
const RESOURCE_VALUE = { credits: 5, scrap: 2 };
let magnetScrapMultiplier = 1.6;

export function setSimulationCatalog(catalog) {
  const rewards = catalog?.rewards;
  if (!rewards) return;
  if (Number.isFinite(rewards.creditsPerCargo) && rewards.creditsPerCargo > 0) RESOURCE_VALUE.credits = rewards.creditsPerCargo;
  if (Number.isFinite(rewards.scrapPerCargo) && rewards.scrapPerCargo > 0) RESOURCE_VALUE.scrap = rewards.scrapPerCargo;
  if (Number.isFinite(rewards.magnetScrapMultiplier) && rewards.magnetScrapMultiplier >= 1) magnetScrapMultiplier = rewards.magnetScrapMultiplier;
}
export class SalvageSimulation {
  constructor(onDelivery = () => {}, { seed = 7 } = {}) {
    this.onDelivery = onDelivery;
    this.seed = Number.isInteger(seed) ? seed >>> 0 : 7;
    this.events = [];
    this.nextEventId = 1;
    this.activeProgram = [...DEFAULT_PROGRAM];
    this.unitPrograms = {};
    this.upgrades = {};
    this.elapsed = 0;
    let state = this.seed || 1;
    this.nodes = SALVAGE_SITES.map(site => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const stock = site.stock + (state % 3);
      return { ...site, stock, remaining: stock, respawn: 0, scanned: false };
    });
    this.robots = [];
  }

  syncCrew(owned = {}) {
    const count = Math.min(20, Object.values(owned).reduce((sum, n) => sum + Math.max(0, Number(n) || 0), 0));
    const old = this.robots.length;
    this.robots.length = count;
    for (let i = old; i < count; i++) {
      const kind = i < (owned.scavenger || 0) ? 'scavenger' : i < (owned.scavenger || 0) + (owned.scrap_hound || 0) ? 'scrap_hound' : 'fabricator';
      this.robots[i] = {
        id: i, kind, x: HOME.x + (i % 3 - 1) * .5, z: HOME.z + Math.floor(i / 3) * .45,
        program: (this.unitPrograms[i] || this.activeProgram).map(step => ({ ...step })), command: 0, phase: 'idle', targetId: null,
        cargo: 0, cargoType: 'credits', work: 0, wait: 0, status: 'Ready',
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
      robot.x = Math.max(-5, Math.min(5, robot.x + input.x / length * speed * dt));
      robot.z = Math.max(-3, Math.min(3, robot.z + input.z / length * speed * dt));
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
      if (target.remaining <= 0) target.respawn = 5;
      if (robot.cargo >= this.capacity(robot) || target.remaining <= 0) {
        robot.phase = 'return'; robot.status = 'Returning with cargo';
      }
    } else if (robot.phase === 'return') {
      if (this.moveToward(robot, HOME, dt)) {
        if (robot.cargo > 0) {
          const magnetBonus = robot.cargoType === 'scrap' && this.upgrades.magnet ? magnetScrapMultiplier : 1;
          const amount = Math.floor(robot.cargo * RESOURCE_VALUE[robot.cargoType] * magnetBonus);
          this.recordEvent('delivery', { robotId: robot.id, resource: robot.cargoType, cargo: robot.cargo, amount });
          this.onDelivery(robot.cargoType, amount, robot);
        }
        robot.cargo = 0; robot.targetId = null; robot.phase = 'idle'; robot.status = 'Cargo delivered'; this.next(robot);
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
    robot.destination = { x: Math.max(-5, Math.min(5, Number(x) || 0)), z: Math.max(-3, Math.min(3, Number(z) || 0)) };
    robot.targetId = null; robot.phase = 'travel'; robot.status = 'Driving to mouse waypoint';
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
    const dx = destination.x - robot.x, dz = destination.z - robot.z;
    const distance = Math.hypot(dx, dz), speed = (robot.kind === 'scrap_hound' ? 2.5 : 1.8) * (this.upgrades.servo ? 1.25 : 1);
    if (distance <= speed * dt) { robot.x = destination.x; robot.z = destination.z; return true; }
    robot.x += dx / distance * speed * dt; robot.z += dz / distance * speed * dt;
    return false;
  }

  snapshot() {
    return {
      robots: this.robots.map(({ id, kind, x, z, phase, targetId, cargo, cargoType, status }) => ({ id, kind, x, z, phase, targetId, cargo, cargoType, status })),
      nodes: this.nodes.map(({ id, x, z, resource, remaining, stock, scanned }) => ({ id, x, z, resource, remaining, stock, scanned })),
      events: this.events.map(event => ({ ...event })),
      seed: this.seed,
      elapsed: Number(this.elapsed.toFixed(3)),
    };
  }
}
