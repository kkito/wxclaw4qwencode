import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CronJobStore } from '../../src/cron/store.js';
import { CronJob } from '../../src/cron/types.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('CronJobStore', () => {
  let store: CronJobStore;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `ownclaw-cron-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    store = new CronJobStore(testDir);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('loadJobs', () => {
    it('should return empty array when no jobs file exists', () => {
      const jobs = store.loadJobs();
      expect(jobs).toEqual([]);
    });

    it('should load jobs from file', () => {
      const jobs: CronJob[] = [
        {
          id: 'job_1',
          name: 'Test Job',
          cron: '0 2 * * *',
          command: 'echo test',
          enabled: true,
          createdAt: '2026-04-26T10:00:00.000Z',
          updatedAt: '2026-04-26T10:00:00.000Z',
        },
      ];

      fs.writeFileSync(
        path.join(testDir, 'jobs.json'),
        JSON.stringify(jobs, null, 2)
      );

      const loaded = store.loadJobs();
      expect(loaded).toEqual(jobs);
    });
  });

  describe('saveJobs', () => {
    it('should save jobs to file', () => {
      const jobs: CronJob[] = [
        {
          id: 'job_1',
          name: 'Test Job',
          cron: '0 2 * * *',
          command: 'echo test',
          enabled: true,
          createdAt: '2026-04-26T10:00:00.000Z',
          updatedAt: '2026-04-26T10:00:00.000Z',
        },
      ];

      store.saveJobs(jobs);

      const content = fs.readFileSync(path.join(testDir, 'jobs.json'), 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('job_1');
    });
  });

  describe('CRUD operations', () => {
    it('should add a job', () => {
      const job: CronJob = {
        id: 'job_1',
        name: 'Test Job',
        cron: '0 2 * * *',
        command: 'echo test',
        enabled: true,
        createdAt: '2026-04-26T10:00:00.000Z',
        updatedAt: '2026-04-26T10:00:00.000Z',
      };

      store.addJob(job);
      const jobs = store.loadJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe('job_1');
    });

    it('should update a job', () => {
      const job: CronJob = {
        id: 'job_1',
        name: 'Original',
        cron: '0 2 * * *',
        command: 'echo test',
        enabled: true,
        createdAt: '2026-04-26T10:00:00.000Z',
        updatedAt: '2026-04-26T10:00:00.000Z',
      };
      store.addJob(job);

      const updated: CronJob = { ...job, name: 'Updated', updatedAt: new Date().toISOString() };
      store.updateJob('job_1', updated);

      const jobs = store.loadJobs();
      expect(jobs[0].name).toBe('Updated');
    });

    it('should delete a job', () => {
      const job: CronJob = {
        id: 'job_1',
        name: 'Test',
        cron: '0 2 * * *',
        command: 'echo test',
        enabled: true,
        createdAt: '2026-04-26T10:00:00.000Z',
        updatedAt: '2026-04-26T10:00:00.000Z',
      };
      store.addJob(job);

      store.deleteJob('job_1');
      const jobs = store.loadJobs();
      expect(jobs).toHaveLength(0);
    });

    it('should find a job by id', () => {
      const job: CronJob = {
        id: 'job_1',
        name: 'Test',
        cron: '0 2 * * *',
        command: 'echo test',
        enabled: true,
        createdAt: '2026-04-26T10:00:00.000Z',
        updatedAt: '2026-04-26T10:00:00.000Z',
      };
      store.addJob(job);

      const found = store.findJob('job_1');
      expect(found).toBeDefined();
      expect(found?.id).toBe('job_1');

      const notFound = store.findJob('nonexistent');
      expect(notFound).toBeUndefined();
    });
  });

  describe('log operations', () => {
    it('should append a log entry', () => {
      const entry = {
        executedAt: '2026-04-26T02:00:00.000Z',
        exitCode: 0,
        durationMs: 1234,
        stdout: 'hello\n',
        stderr: '',
      };

      store.appendLog('job_1', entry);

      const logs = store.readLogs('job_1');
      expect(logs).toHaveLength(1);
      expect(logs[0].exitCode).toBe(0);
    });

    it('should read logs for non-existent job', () => {
      const logs = store.readLogs('nonexistent');
      expect(logs).toEqual([]);
    });

    it('should clear logs for a job', () => {
      const entry = {
        executedAt: '2026-04-26T02:00:00.000Z',
        exitCode: 0,
        durationMs: 1234,
        stdout: 'hello\n',
        stderr: '',
      };
      store.appendLog('job_1', entry);
      store.appendLog('job_1', entry);

      store.clearLogs('job_1');
      const logs = store.readLogs('job_1');
      expect(logs).toHaveLength(0);
    });
  });
});
