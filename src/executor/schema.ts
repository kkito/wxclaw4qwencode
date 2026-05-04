import { z } from 'zod';

export const LongTaskSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  specPath: z.string().min(1),
  initialPrompt: z.string().nullable(),
  confirmPrompt: z.string().nullable(),
  status: z.enum(['pending', 'running', 'success', 'failed', 'timeout']),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  result: z.string().nullable(),
  confirmResponse: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().nullable(),
  latestOutput: z.string().nullable(),
});

export const ExecutorConfigSchema = z.object({
  defaultInitialPrompt: z.string().min(1),
  defaultConfirmPrompt: z.string().min(1),
});

export type LongTaskInput = z.input<typeof LongTaskSchema>;
export type LongTaskOutput = z.output<typeof LongTaskSchema>;
