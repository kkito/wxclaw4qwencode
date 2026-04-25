import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CronManager } from '../../src/cron/manager.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('CronManager', () => {
  let manager: CronManager;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `ownclaw-manager-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    manager = new CronManager({ stateDir: testDir });
  });

  afterEach(() => {
    manager.shutdown();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('createJob', () => {
    it('should create a new job and schedule it', () => {
      const job = manager.createJob({
        name: 'Test Job',
        cron: '0 2 * * *',
        command: 'echo test',
        enabled: true,
      });

      expect(job.id).toBeDefined();
      expect(job.name).toBe('Test Job');
      expect(job.enabled).toBe(true);

      const jobs = manager.listJobs();
      expect(jobs).toHaveLength(1);
    });

    it('should not schedule disabled jobs', () => {
      const job = manager.createJob({
        name: 'Disabled Job',
        cron: '0 2 * * *',
        command: 'echo test',
        enabled: false,
      });

      const jobs = manager.listJobs();
      expect(jobs).toHaveLength(1);
      expect(manager.scheduledCount).toBe(0);
    });
  });

  describe('updateJob', () => {
    it('should update job and reschedule if cron changed', () => {
      const job = manager.createJob({
        name: 'Test',
        cron: '0 2 * * *',
        command: 'echo test',
        enabled: true,
      });

      manager.updateJob(job.id, { cron: '0 3 * * *' });

      const updated = manager.getJob(job.id);
      expect(updated?.cron).toBe('0 3 * * *');
    });
  });

  describe('deleteJob', () => {
    it('should delete job and stop scheduler', () => {
      const job = manager.createJob({
        name: 'Test',
        cron: '0 2 * * *',
        command: 'echo test',
        enabled: true,
      });

      manager.deleteJob(job.id);

      expect(manager.listJobs()).toHaveLength(0);
      expect(manager.scheduledCount).toBe(0);
    });
  });

  describe('runJob', () => {
    it('should manually trigger job execution', async () => {
      const job = manager.createJob({
        name: 'Test',
        cron: '0 2 * * *',
        command: 'echo manual_run',
        enabled: true,
      });

      const result = await manager.runJob(job.id);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('manual_run');

      const logs = manager.getLogs(job.id);
      expect(logs).toHaveLength(1);
    });
  });

  describe('initialize', () => {
    it('should load and schedule jobs from disk', () => {
      manager.createJob({
        name: 'Job 1',
        cron: '0 2 * * *',
        command: 'echo job1',
        enabled: true,
      });
      manager.createJob({
        name: 'Job 2',
        cron: '0 3 * * *',
        command: 'echo job2',
        enabled: true,
      });

      const newManager = new CronManager({ stateDir: testDir });
      newManager.initialize();

      expect(newManager.scheduledCount).toBe(2);
      newManager.shutdown();
    });
  });
});
