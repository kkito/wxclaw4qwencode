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
      updatedAt: null,
      latestOutput: null,
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
      updatedAt: null,
      latestOutput: null,
    };
    expect(() => LongTaskSchema.parse(invalid)).toThrow();
  });

  it('should accept null for updatedAt and latestOutput', () => {
    const valid = {
      id: 'task_1',
      projectId: '/p',
      specPath: 'docs/spec.md',
      initialPrompt: null,
      confirmPrompt: null,
      status: 'pending',
      startedAt: null,
      endedAt: null,
      result: null,
      confirmResponse: null,
      createdAt: '2026-05-02T10:00:00Z',
      updatedAt: null,
      latestOutput: null,
    };
    const result = LongTaskSchema.parse(valid);
    expect(result.updatedAt).toBeNull();
    expect(result.latestOutput).toBeNull();
  });

  it('should accept valid ISO date strings for updatedAt', () => {
    const valid = {
      id: 'task_1',
      projectId: '/p',
      specPath: 'docs/spec.md',
      initialPrompt: null,
      confirmPrompt: null,
      status: 'pending',
      startedAt: null,
      endedAt: null,
      result: null,
      confirmResponse: null,
      createdAt: '2026-05-02T10:00:00Z',
      updatedAt: '2026-05-02T10:05:00Z',
      latestOutput: 'some progress',
    };
    const result = LongTaskSchema.parse(valid);
    expect(result.updatedAt).toBe('2026-05-02T10:05:00Z');
    expect(result.latestOutput).toBe('some progress');
  });

  it('should accept any string for updatedAt (no date format validation)', () => {
    // Zod's z.string() accepts any string, including non-date formats
    // This is by design - we don't strictly validate date format at schema level
    const valid = {
      id: 'task_1',
      projectId: '/p',
      specPath: 'docs/spec.md',
      initialPrompt: null,
      confirmPrompt: null,
      status: 'pending',
      startedAt: null,
      endedAt: null,
      result: null,
      confirmResponse: null,
      createdAt: '2026-05-02T10:00:00Z',
      updatedAt: 'not-a-date',
      latestOutput: 'progress',
    };
    const result = LongTaskSchema.parse(valid);
    expect(result.updatedAt).toBe('not-a-date');
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
