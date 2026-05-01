import { describe, it, expect } from 'vitest';
import { LongTaskSchema, ExecutorConfigSchema } from '../../src/executor/schema.js';

describe('LongTaskSchema', () => {
  it('should pass for valid task', () => {
    const valid = {
      id: 'task_abc123',
      projectId: '/path/to/project',
      specPath: 'docs/superpowers/specs/test-design.md',
      initialPrompt: null,
      confirmPrompt: null,
      status: 'pending',
      startedAt: null,
      endedAt: null,
      result: null,
      confirmResponse: null,
      createdAt: '2026-05-02T10:00:00Z',
    };
    expect(LongTaskSchema.parse(valid)).toEqual(valid);
  });

  it('should fail for missing required fields', () => {
    expect(() => LongTaskSchema.parse({ id: 'x' })).toThrow();
  });

  it('should fail for invalid status', () => {
    const invalid = {
      id: 'task_1',
      projectId: '/p',
      specPath: 'docs/spec.md',
      initialPrompt: null,
      confirmPrompt: null,
      status: 'invalid_status',
      startedAt: null,
      endedAt: null,
      result: null,
      confirmResponse: null,
      createdAt: '2026-05-02T10:00:00Z',
    };
    expect(() => LongTaskSchema.parse(invalid)).toThrow();
  });
});

describe('ExecutorConfigSchema', () => {
  it('should pass for valid config', () => {
    const valid = {
      defaultInitialPrompt: 'do it',
      defaultConfirmPrompt: 'done?',
    };
    expect(ExecutorConfigSchema.parse(valid)).toEqual(valid);
  });

  it('should fail for empty strings', () => {
    expect(() =>
      ExecutorConfigSchema.parse({ defaultInitialPrompt: '', defaultConfirmPrompt: '' }),
    ).toThrow();
  });
});
