import { describe, it, expect } from 'vitest';
import { CronJobSchema, CronLogEntrySchema } from '../../src/cron/schema.js';

describe('Cron Schema', () => {
  describe('CronJobSchema', () => {
    it('should validate a valid cron job', () => {
      const valid = {
        id: 'job_123',
        name: 'Test Job',
        cron: '0 2 * * *',
        command: 'echo hello',
        enabled: true,
        createdAt: '2026-04-26T10:00:00.000Z',
        updatedAt: '2026-04-26T10:00:00.000Z',
      };

      const result = CronJobSchema.parse(valid);
      expect(result).toEqual(valid);
    });

    it('should reject missing required fields', () => {
      const invalid = { id: 'job_123' };

      expect(() => CronJobSchema.parse(invalid)).toThrow();
    });

    it('should reject invalid cron expression format', () => {
      const invalid = {
        id: 'job_123',
        name: 'Test',
        cron: 'not-a-cron',
        command: 'echo test',
        enabled: true,
        createdAt: '2026-04-26T10:00:00.000Z',
        updatedAt: '2026-04-26T10:00:00.000Z',
      };

      expect(() => CronJobSchema.parse(invalid)).toThrow();
    });

    it('should reject empty command', () => {
      const invalid = {
        id: 'job_123',
        name: 'Test',
        cron: '0 2 * * *',
        command: '',
        enabled: true,
        createdAt: '2026-04-26T10:00:00.000Z',
        updatedAt: '2026-04-26T10:00:00.000Z',
      };

      expect(() => CronJobSchema.parse(invalid)).toThrow();
    });
  });

  describe('CronLogEntrySchema', () => {
    it('should validate a valid log entry', () => {
      const valid = {
        executedAt: '2026-04-26T02:00:00.000Z',
        exitCode: 0,
        durationMs: 1234,
        stdout: 'hello\n',
        stderr: '',
      };

      const result = CronLogEntrySchema.parse(valid);
      expect(result).toEqual(valid);
    });

    it('should reject negative duration', () => {
      const invalid = {
        executedAt: '2026-04-26T02:00:00.000Z',
        exitCode: 0,
        durationMs: -100,
        stdout: '',
        stderr: '',
      };

      expect(() => CronLogEntrySchema.parse(invalid)).toThrow();
    });
  });
});
