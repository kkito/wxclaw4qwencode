import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { TaskResult } from '../../src/executor/runner.js';

const mockRunResult: TaskResult = {
  status: 'success',
  startedAt: '2026-05-02T10:00:00Z',
  endedAt: '2026-05-02T10:01:00Z',
  result: 'done',
  confirmResponse: '是',
};

const _mockRun = vi.fn<(task: unknown, config: unknown, onOutput?: (text: string) => void) => Promise<TaskResult>>()
  .mockResolvedValue(mockRunResult);

vi.mock('../../src/executor/runner.js', () => {
  return {
    ExecutorRunner: class {
      run = _mockRun;
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ExecutorRunner } from '../../src/executor/runner.js';
import { ExecutorManager } from '../../src/executor/manager.js';

describe('ExecutorManager', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `executor-mgr-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    _mockRun.mockResolvedValue(mockRunResult);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('addTask', () => {
    it('creates a pending task', () => {
      const manager = new ExecutorManager(tempDir);
      const task = manager.addTask('/tmp/proj', 'docs/spec.md');
      expect(task.status).toBe('pending');
      expect(task.projectId).toBe('/tmp/proj');
      expect(task.id.startsWith('exec_')).toBe(true);
    });
  });

  describe('getTasks', () => {
    it('returns all tasks', () => {
      const manager = new ExecutorManager(tempDir);
      manager.addTask('/p1', 's1.md');
      manager.addTask('/p2', 's2.md');
      const tasks = manager.getTasks();
      expect(tasks).toHaveLength(2);
    });
  });

  describe('removeTask', () => {
    it('removes a pending task', () => {
      const manager = new ExecutorManager(tempDir);
      const task = manager.addTask('/p', 's.md');
      manager.removeTask(task.id);
      expect(manager.getTasks()).toHaveLength(0);
    });

    it('prevents removing a running task', () => {
      const manager = new ExecutorManager(tempDir);
      manager['isExecuting'] = true;
      const task = manager.addTask('/p', 's.md');
      manager.getStore().updateTask(task.id, { status: 'running' });
      expect(() => manager.removeTask(task.id)).toThrow('running');
    });
  });

  describe('requeueTask', () => {
    it('resets task to pending', () => {
      const manager = new ExecutorManager(tempDir);
      const task = manager.addTask('/p', 's.md');
      manager.getStore().updateTask(task.id, { status: 'success', endedAt: new Date().toISOString() });
      manager.requeueTask(task.id);
      const tasks = manager.getTasks();
      expect(tasks[0].status).toBe('pending');
      expect(tasks[0].startedAt).toBeNull();
    });
  });

  describe('updateTask', () => {
    it('updates a non-running task', () => {
      const manager = new ExecutorManager(tempDir);
      const task = manager.addTask('/p', 's.md');
      manager.updateTask(task.id, { initialPrompt: 'custom prompt' });
      expect(manager.getTasks()[0].initialPrompt).toBe('custom prompt');
    });

    it('prevents updating a running task', () => {
      const manager = new ExecutorManager(tempDir);
      manager['isExecuting'] = true;
      const task = manager.addTask('/p', 's.md');
      manager.getStore().updateTask(task.id, { status: 'running' });
      expect(() => manager.updateTask(task.id, { status: 'pending' })).toThrow('running');
    });
  });

  describe('updateConfig', () => {
    it('saves global config', () => {
      const manager = new ExecutorManager(tempDir);
      manager.updateConfig({
        defaultInitialPrompt: 'new init',
        defaultConfirmPrompt: 'new confirm',
      });
      const config = manager.getStore().loadConfig();
      expect(config.defaultInitialPrompt).toBe('new init');
    });
  });

  describe('start/stop', () => {
    it('isEnabled starts as false', () => {
      const manager = new ExecutorManager(tempDir);
      expect(manager.isEnabled).toBe(false);
    });

    it('stop() when not executing disables immediately', () => {
      const manager = new ExecutorManager(tempDir);
      manager.isEnabled = true;
      manager.stop();
      expect(manager.isEnabled).toBe(false);
      expect(manager.running).toBe(false);
    });
  });
});
