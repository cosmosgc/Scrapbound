import { z } from 'zod';

const actionSchemas = [
  z.object({ action: z.literal('patrol') }).strict(),
  z.object({ action: z.literal('scan') }).strict(),
  z.object({ action: z.literal('collect'), resource: z.enum(['credits', 'scrap']).default('credits') }).strict(),
  z.object({ action: z.literal('wait'), seconds: z.number().finite().min(1).max(30).default(1) }).strict(),
  z.object({ action: z.literal('move_to'), x: z.number().finite().min(-5).max(5), z: z.number().finite().min(-3).max(3) }).strict(),
  z.object({ action: z.literal('return_home') }).strict(),
  z.object({ action: z.literal('if_cargo'), skip: z.number().int().min(0).max(40) }).strict(),
  z.object({ action: z.literal('if_site'), resource: z.enum(['credits', 'scrap']).default('credits'), skip: z.number().int().min(0).max(40) }).strict(),
];

export const ProgramSchema = z.array(z.discriminatedUnion('action', actionSchemas)).max(40).superRefine((program, context) => {
  program.forEach((step, index) => {
    if ((step.action === 'if_cargo' || step.action === 'if_site') && index + 1 + step.skip > program.length) {
      context.addIssue({ code: 'custom', path: [index, 'skip'], message: 'Conditional jump must remain inside the program.' });
    }
  });
});

export function parseProgram(input) {
  const result = ProgramSchema.safeParse(input);
  return result.success ? result.data : [];
}
