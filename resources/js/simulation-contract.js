import { z } from 'zod';
import { ProgramSchema } from './program-schema.js';
import { SIMULATION_CORE_VERSION, SalvageSimulation } from './simulation-core.js';

export const MAX_SIMULATION_TICKS = 6000;

const CrewSchema = z.object({
  scavenger: z.number().int().min(0).max(20).default(1),
  scrap_hound: z.number().int().min(0).max(20).default(0),
  fabricator: z.number().int().min(0).max(20).default(0),
  sky_miner: z.number().int().min(0).max(20).default(0),
  block_miner: z.number().int().min(0).max(20).default(0),
  cargo_hauler: z.number().int().min(0).max(20).default(0),
  buffer_bot: z.number().int().min(0).max(20).default(0),
}).strict().default({ scavenger: 1, scrap_hound: 0, fabricator: 0, sky_miner: 0, block_miner: 0, cargo_hauler: 0, buffer_bot: 0 }).superRefine((crew, context) => {
  if (Object.values(crew).reduce((total, count) => total + count, 0) > 20) {
    context.addIssue({ code: 'custom', message: 'Crew size cannot exceed 20 robots.' });
  }
});

const AssignmentsSchema = z.object({
  crew: ProgramSchema.optional(),
  units: z.record(z.string(), ProgramSchema).default({}),
}).strict().optional();

export const SimulationInputSchema = z.object({
  coreVersion: z.literal(SIMULATION_CORE_VERSION),
  seed: z.number().int().min(0).max(0xffffffff).default(7),
  crew: CrewSchema,
  assignments: AssignmentsSchema,
  upgrades: z.object({ servo: z.boolean().default(false), magnet: z.boolean().default(false) }).strict().default({}),
  ticks: z.number().int().min(0).max(MAX_SIMULATION_TICKS),
}).strict().superRefine((input, context) => {
  for (const unitId of Object.keys(input.assignments?.units || {})) {
    const crewSize = Object.values(input.crew).reduce((total, count) => total + count, 0);
    if (!/^(0|[1-9]\d*)$/.test(unitId) || Number(unitId) >= crewSize) {
      context.addIssue({ code: 'custom', path: ['assignments', 'units', unitId], message: 'Unit program keys must reference an owned robot.' });
    }
  }
});

/** Resolve one bounded, fixed-step simulation entirely in memory. */
export function resolveSimulation(input) {
  const parsed = SimulationInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid simulation input.' };

  const data = parsed.data;
  const payouts = [];
  const simulation = new SalvageSimulation((resource, amount, robot) => {
    payouts.push({ robotId: robot.id, resource, amount });
  }, { seed: data.seed });
  simulation.syncCrew(data.crew);
  simulation.setUpgrades(data.upgrades);
  if (data.assignments) simulation.loadAssignments(data.assignments);
  for (let tick = 0; tick < data.ticks; tick++) simulation.tick(.1);

  return {
    ok: true,
    coreVersion: SIMULATION_CORE_VERSION,
    input: data,
    snapshot: simulation.snapshot(),
    payouts,
  };
}
