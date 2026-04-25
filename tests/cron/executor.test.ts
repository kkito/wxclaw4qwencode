import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CronExecutor } from '../../src/cron/executor.js';
import { CronJobStore } from '../../src/cron/store.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('CronExecutor', () => {
  let executor: CronExecutor;
  let store: CronJobStore;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `ownclaw-executor-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    store = new CronJobStore(testDir);
    executor = new CronExecutor(store);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should execute a simple command and log result', async () => {
    const result = await executor.executeJob('echo "hello world"');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello world');
    expect(result.stderr).toBe('');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should capture stderr for failing commands', async () => {
    const result = await executor.executeJob('ls /nonexistent_path_12345');

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  it('should handle command that takes time', async () => {
    const result = await executor.executeJob('sleep 0.1 && echo done');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('done');
    expect(result.durationMs).toBeGreaterThanOrEqual(100);
  });

  it('should append log to store after execution', async () => {
    await executor.executeAndLog('job_test', 'echo test_output');

    const logs = store.readLogs('job_test');
    expect(logs).toHaveLength(1);
    expect(logs[0].exitCode).toBe(0);
    expect(logs[0].stdout).toContain('test_output');
  });
});
