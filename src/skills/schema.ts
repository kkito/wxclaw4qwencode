// src/skills/schema.ts

import { z } from 'zod';

export const SkillMetaSchema = z.object({
  id: z.string().min(1, 'ID cannot be empty'),
  name: z.string().default(''),
  description: z.string().default(''),
  content: z.string().default(''),
  files: z.array(z.string()).default([]),
});

export const CreateSkillInputSchema = z.object({
  id: z.string().min(1, 'ID cannot be empty').regex(/^[a-z0-9_-]+$/i, 'ID can only contain letters, numbers, hyphens and underscores'),
  skillMd: z.string().min(1, 'SKILL.md content cannot be empty'),
});

export const UpdateSkillInputSchema = z.object({
  skillMd: z.string().min(1, 'SKILL.md content cannot be empty'),
});

export type SkillMetaInput = z.input<typeof SkillMetaSchema>;
export type SkillMetaOutput = z.output<typeof SkillMetaSchema>;
export type CreateSkillInputType = z.input<typeof CreateSkillInputSchema>;
export type UpdateSkillInputType = z.input<typeof UpdateSkillInputSchema>;
