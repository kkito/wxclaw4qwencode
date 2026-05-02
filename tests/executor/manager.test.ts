import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { TaskResult } from '../../src/executor/runner.js';
import type { TaskProgress } from '../../src/executor/types.js';

const mockRunResult: TaskResult = {
  status: 'success',
  startedAt: '2026-05-02T10:00:00Z',
  endedAt: '2026-05-02T10:01:00Z',
  result: 'done',
  confirmResponse: '是',
};

const _mockRun = vi.fn<(task: unknown, config: unknown, onProgress?: (progress: TaskProgress) => void) => Promise<TaskResult>>()
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
      expect(tasks[0].updatedAt).toBeNull();
      expect(tasks[0].latestOutput).toBeNull();
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

  describe('executeTask progress tracking', () => {
    it('sets startedAt and updatedAt immediately when task starts', async () => {
      const manager = new ExecutorManager(tempDir);
      const task = manager.addTask('/p', 's.md');

      // Mock run to capture updateTask calls
      const updateSpy = vi.spyOn(manager.getStore(), 'updateTask');

      // Manually call executeTask through processQueue
      manager['isExecuting'] = false;
      const executePromise = manager['executeTask'](task);

      // Check that updateTask was called with running status and timestamps
      const firstCall = updateSpy.mock.calls[0];
      expect(firstCall[0]).toBe(task.id);
      expect(firstCall[1]).toMatchObject({
        status: 'running',
        startedAt: expect.any(String),
        updatedAt: expect.any(String),
        latestOutput: null,
      });

      await executePromise;
    });

    it('updates progress via onProgress callback during execution', async () => {
      const manager = new ExecutorManager(tempDir);
      const task = manager.addTask('/p', 's.md');

      // Mock run to simulate onProgress callback
      _mockRun.mockImplementation(async (_task, _config, onProgress) => {
        if (onProgress) {
          onProgress({
            updatedAt: '2026-05-02T10:00:30Z',
            latestOutput: 'progress update',
          });
        }
        return mockRunResult;
      });

      await manager['executeTask'](task);

      const tasks = manager.getTasks();
      expect(tasks[0].latestOutput).toBe('progress update');
      // updatedAt is overwritten by completion time, so we just check it exists
      expect(tasks[0].updatedAt).toBeDefined();
    });

    it('sets endedAt and updatedAt on task completion', async () => {
      const manager = new ExecutorManager(tempDir);
      const task = manager.addTask('/p', 's.md');

      await manager['executeTask'](task);

      const tasks = manager.getTasks();
      expect(tasks[0].status).toBe('success');
      expect(tasks[0].endedAt).toBe(mockRunResult.endedAt);
      expect(tasks[0].updatedAt).toBe(mockRunResult.endedAt);
    });

    it('sets endedAt and updatedAt on failure', async () => {
      const manager = new ExecutorManager(tempDir);
      const task = manager.addTask('/p', 's.md');

      _mockRun.mockRejectedValue(new Error('test error'));

      await manager['executeTask'](task);

      const tasks = manager.getTasks();
      expect(tasks[0].status).toBe('failed');
      expect(tasks[0].endedAt).toBeDefined();
      expect(tasks[0].updatedAt).toBe(tasks[0].endedAt);
    });
  });

  describe('addTask initializes new fields', () => {
    it('initializes updatedAt and latestOutput to null', () => {
      const manager = new ExecutorManager(tempDir);
      const task = manager.addTask('/p', 's.md');
      expect(task.updatedAt).toBeNull();
      expect(task.latestOutput).toBeNull();
    });
  });
});
