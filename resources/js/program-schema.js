import { z } from 'zod';

const FIELD_BOUNDS = { minX: -16, maxX: 16, minZ: -10, maxZ: 10 };

const actionSchemas = [
  z.object({ action: z.literal('patrol') }).strict(),
  z.object({ action: z.literal('scan') }).strict(),
  z.object({ action: z.literal('collect'), resource: z.enum(['credits', 'scrap', 'alloy']).default('credits') }).strict(),
  z.object({ action: z.literal('wait'), seconds: z.number().finite().min(1).max(30).default(1) }).strict(),
  z.object({ action: z.literal('move_to'), x: z.number().finite().min(FIELD_BOUNDS.minX).max(FIELD_BOUNDS.maxX), z: z.number().finite().min(FIELD_BOUNDS.minZ).max(FIELD_BOUNDS.maxZ) }).strict(),
  z.object({ action: z.literal('return_home') }).strict(),
  z.object({ action: z.literal('seek'), resource: z.enum(['credits', 'scrap', 'alloy']).default('credits') }).strict(),
  z.object({ action: z.literal('mine'), resource: z.enum(['credits', 'scrap', 'alloy']).default('credits') }).strict(),
  z.object({ action: z.literal('collect_drops'), resource: z.enum(['credits', 'scrap', 'alloy']).default('scrap') }).strict(),
  z.object({ action: z.literal('assist'), seconds: z.number().finite().min(1).max(30).default(10) }).strict(),
  z.object({ action: z.literal('if_cargo'), skip: z.number().int().min(0).max(40) }).strict(),
  z.object({ action: z.literal('if_full'), skip: z.number().int().min(0).max(40) }).strict(),
  z.object({ action: z.literal('if_cargo_percent'), percent: z.number().int().min(1).max(100).default(50), skip: z.number().int().min(0).max(40) }).strict(),
  z.object({ action: z.literal('if_robot_type'), kind: z.enum(['scavenger', 'scrap_hound', 'fabricator', 'sky_miner', 'block_miner', 'cargo_hauler', 'buffer_bot']), skip: z.number().int().min(0).max(40) }).strict(),
  z.object({ action: z.literal('if_site'), resource: z.enum(['credits', 'scrap', 'alloy']).default('credits'), skip: z.number().int().min(0).max(40) }).strict(),
  z.object({ action: z.literal('if_drop'), resource: z.enum(['credits', 'scrap', 'alloy']).default('scrap'), skip: z.number().int().min(0).max(40) }).strict(),
];

export const ProgramSchema = z.array(z.discriminatedUnion('action', actionSchemas)).max(40).superRefine((program, context) => {
  program.forEach((step, index) => {
    if (['if_cargo', 'if_full', 'if_cargo_percent', 'if_robot_type', 'if_site', 'if_drop'].includes(step.action) && index + 1 + step.skip > program.length) {
      context.addIssue({ code: 'custom', path: [index, 'skip'], message: 'Conditional jump must remain inside the program.' });
    }
  });
});

export function parseProgram(input) {
  const result = ProgramSchema.safeParse(input);
  return result.success ? result.data : [];
}
