import { z } from 'zod';

export const CronJobSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cron: z.string().refine(
    (val) => {
      const parts = val.trim().split(/\s+/);
      return parts.length === 5 || parts.length === 6;
    },
    { message: 'Invalid cron expression: must have 5 or 6 fields' },
  ),
  command: z.string().min(1),
  enabled: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CronLogEntrySchema = z.object({
  executedAt: z.string().datetime(),
  exitCode: z.number().int().min(-1),
  durationMs: z.number().min(0),
  stdout: z.string().default(''),
  stderr: z.string().default(''),
});

export type CronJobInput = z.input<typeof CronJobSchema>;
export type CronJobOutput = z.output<typeof CronJobSchema>;
export type CronLogEntryInput = z.input<typeof CronLogEntrySchema>;
export type CronLogEntryOutput = z.output<typeof CronLogEntrySchema>;
