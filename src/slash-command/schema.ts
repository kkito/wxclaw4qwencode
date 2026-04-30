import { z } from 'zod';

export const CommandManifestSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  usage: z.string().optional(),
  handler: z.string().refine((val) => {
    // Prevent path traversal: must start with ./ or /
    return val.startsWith('./') || val.startsWith('/');
  }),
});

export type CommandManifest = z.infer<typeof CommandManifestSchema>;
