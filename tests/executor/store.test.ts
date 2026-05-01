import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LongTaskStore } from '../../src/executor/store.js';
import type { LongTask } from '../../src/executor/types.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('LongTaskStore', () => {
  let store: LongTaskStore;
  let testDir: string;

  const makeTask = (id: string, status = 'pending'): LongTask => ({
    id,
    projectId: '/tmp/proj',
    specPath: 'docs/spec.md',
    initialPrompt: null,
    confirmPrompt: null,
    status,
    startedAt: null,
    endedAt: null,
    result: null,
    confirmResponse: null,
    createdAt: '2026-05-02T10:00:00Z',
  });

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `ownclaw-executor-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    store = new LongTaskStore(testDir);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('loadTasks', () => {
    it('should return empty array when file does not exist', () => {
      const tasks = store.loadTasks();
      expect(tasks).toEqual([]);
    });

    it('should return empty array when file is empty or invalid', () => {
      fs.writeFileSync(path.join(testDir, 'tasks.json'), 'not json', 'utf-8');
      const tasks = store.loadTasks();
      expect(tasks).toEqual([]);
    });

    it('should load tasks from file', () => {
      const tasks: LongTask[] = [makeTask('task_1'), makeTask('task_2')];
      fs.writeFileSync(
        path.join(testDir, 'tasks.json'),
        JSON.stringify(tasks, null, 2)
      );

      const loaded = store.loadTasks();
      expect(loaded).toHaveLength(2);
      expect(loaded[0].id).toBe('task_1');
      expect(loaded[1].id).toBe('task_2');
    });
  });

  describe('saveTasks', () => {
    it('should persist tasks to disk', () => {
      const tasks = [makeTask('t1'), makeTask('t2')];
      store.saveTasks(tasks);

      const content = fs.readFileSync(path.join(testDir, 'tasks.json'), 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBe('t1');
    });

    it('should round-trip through loadTasks', () => {
      const tasks = [makeTask('t1'), makeTask('t2')];
      store.saveTasks(tasks);
      const loaded = store.loadTasks();
      expect(loaded).toHaveLength(2);
      expect(loaded[0].id).toBe('t1');
      expect(loaded[1].id).toBe('t2');
    });
  });

  describe('CRUD operations', () => {
    it('addTask should append and persist', () => {
      store.addTask(makeTask('t1'));
      const tasks = store.loadTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('t1');
    });

    it('addTask should append multiple tasks', () => {
      store.addTask(makeTask('t1'));
      store.addTask(makeTask('t2'));
      const tasks = store.loadTasks();
      expect(tasks).toHaveLength(2);
    });

    it('updateTask should modify existing task', () => {
      store.addTask(makeTask('t1', 'pending'));
      store.updateTask('t1', { status: 'running', startedAt: '2026-05-02T11:00:00Z' });

      const tasks = store.loadTasks();
      expect(tasks[0].status).toBe('running');
      expect(tasks[0].startedAt).toBe('2026-05-02T11:00:00Z');
    });

    it('updateTask should throw when task not found', () => {
      expect(() => store.updateTask('nonexistent', { status: 'running' })).toThrow('not found');
    });

    it('removeTask should delete and persist', () => {
      store.addTask(makeTask('t1'));
      store.addTask(makeTask('t2'));
      store.removeTask('t1');

      const tasks = store.loadTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('t2');
    });

    it('removeTask should throw when task not found', () => {
      expect(() => store.removeTask('nonexistent')).toThrow('not found');
    });
  });

  describe('getPendingTasks', () => {
    it('should return only pending tasks', () => {
      store.addTask(makeTask('t1', 'pending'));
      store.addTask(makeTask('t2', 'success'));
      store.addTask(makeTask('t3', 'pending'));

      const pending = store.getPendingTasks();
      expect(pending).toHaveLength(2);
      expect(pending.map((t) => t.id).sort()).toEqual(['t1', 't3']);
    });

    it('should return empty when no pending tasks', () => {
      store.addTask(makeTask('t1', 'success'));
      store.addTask(makeTask('t2', 'failed'));

      const pending = store.getPendingTasks();
      expect(pending).toHaveLength(0);
    });
  });

  describe('config', () => {
    it('should return defaults when config file does not exist', () => {
      const config = store.loadConfig();
      expect(config.defaultInitialPrompt).toContain('完成');
      expect(config.defaultConfirmPrompt).toContain('完成');
    });

    it('should save and load custom config', () => {
      store.saveConfig({
        defaultInitialPrompt: 'custom init',
        defaultConfirmPrompt: 'custom confirm',
      });

      const config = store.loadConfig();
      expect(config.defaultInitialPrompt).toBe('custom init');
      expect(config.defaultConfirmPrompt).toBe('custom confirm');
    });

    it('should persist config to disk', () => {
      store.saveConfig({
        defaultInitialPrompt: 'persisted init',
        defaultConfirmPrompt: 'persisted confirm',
      });

      const content = fs.readFileSync(path.join(testDir, 'config.json'), 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.defaultInitialPrompt).toBe('persisted init');
      expect(parsed.defaultConfirmPrompt).toBe('persisted confirm');
    });
  });

  describe('resolvePrompts', () => {
    it('should use global defaults when task prompts are null', () => {
      store.saveConfig({
        defaultInitialPrompt: 'global init',
        defaultConfirmPrompt: 'global confirm',
      });

      const task = makeTask('t1');
      const resolved = store.resolvePrompts(task);
      expect(resolved).toEqual({ initial: 'global init', confirm: 'global confirm' });
    });

    it('should use default config when no custom config is set', () => {
      const task = makeTask('t1');
      const resolved = store.resolvePrompts(task);
      expect(resolved.initial).toContain('完成');
      expect(resolved.confirm).toContain('完成');
    });

    it('should use task prompts when they are set', () => {
      store.saveConfig({
        defaultInitialPrompt: 'global init',
        defaultConfirmPrompt: 'global confirm',
      });

      const task: LongTask = {
        ...makeTask('t1'),
        initialPrompt: 'task init',
        confirmPrompt: 'task confirm',
      };

      const resolved = store.resolvePrompts(task);
      expect(resolved).toEqual({ initial: 'task init', confirm: 'task confirm' });
    });

    it('should use task initialPrompt but fallback confirm to default', () => {
      store.saveConfig({
        defaultInitialPrompt: 'global init',
        defaultConfirmPrompt: 'global confirm',
      });

      const task: LongTask = {
        ...makeTask('t1'),
        initialPrompt: 'task init',
        confirmPrompt: null,
      };

      const resolved = store.resolvePrompts(task);
      expect(resolved).toEqual({ initial: 'task init', confirm: 'global confirm' });
    });

    it('should use default initialPrompt but task confirmPrompt', () => {
      store.saveConfig({
        defaultInitialPrompt: 'global init',
        defaultConfirmPrompt: 'global confirm',
      });

      const task: LongTask = {
        ...makeTask('t1'),
        initialPrompt: null,
        confirmPrompt: 'task confirm',
      };

      const resolved = store.resolvePrompts(task);
      expect(resolved).toEqual({ initial: 'global init', confirm: 'task confirm' });
    });
  });
});
