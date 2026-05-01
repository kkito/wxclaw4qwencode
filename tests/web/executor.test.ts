import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWebServer, WebServerConfig } from '../../src/web/server.js';
import type { TaskResult } from '../../src/executor/runner.js';
import { ExecutorManager } from '../../src/executor/manager.js';
import { ExecutorPage } from '../../src/web/views/executor.js';
import { jsx } from 'hono/jsx';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const _mockRun = vi.fn<(task: unknown, config: unknown, onOutput?: (text: string) => void) => Promise<TaskResult>>()
  .mockResolvedValue({
    status: 'success',
    startedAt: '2026-05-02T10:00:00Z',
    endedAt: '2026-05-02T10:01:00Z',
    result: 'done',
    confirmResponse: '是',
  });

vi.mock('../../src/executor/runner.js', () => {
  return {
    ExecutorRunner: class {
      run = _mockRun;
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ExecutorRunner } from '../../src/executor/runner.js';

describe('Executor Web Pages', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `executor-web-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    _mockRun.mockResolvedValue({
      status: 'success',
      startedAt: '2026-05-02T10:00:00Z',
      endedAt: '2026-05-02T10:01:00Z',
      result: 'done',
      confirmResponse: '是',
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('GET /executor', () => {
    it('renders the executor page', async () => {
      const manager = new ExecutorManager(tempDir);
      manager.stop();
      const config: WebServerConfig = { port: 0, executorManager: manager };
      const { app } = createWebServer(config);

      const res = await app.request('/executor');
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('长程任务执行器');
      expect(html).toContain('执行流程');
      expect(html).toContain('全局配置');
      expect(html).toContain('添加任务');
      expect(html).toContain('任务列表');
    });
  });

  describe('POST /executor/tasks', () => {
    it('creates a task via form submission', async () => {
      const manager = new ExecutorManager(tempDir);
      manager.stop();
      const config: WebServerConfig = { port: 0, executorManager: manager };
      const { app } = createWebServer(config);

      const formData = new FormData();
      formData.append('projectId', '/tmp/proj');
      formData.append('specPath', 'docs/spec.md');

      const res = await app.request('/executor/tasks', { method: 'POST', body: formData });
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/executor');
      expect(manager.getTasks()).toHaveLength(1);
    });
  });

  describe('POST /executor/tasks/:id/delete', () => {
    it('deletes a task', async () => {
      const manager = new ExecutorManager(tempDir);
      manager.stop();
      const task = manager.addTask('/p', 's.md');
      const config: WebServerConfig = { port: 0, executorManager: manager };
      const { app } = createWebServer(config);

      const res = await app.request(`/executor/tasks/${task.id}/delete`, { method: 'POST' });
      expect(res.status).toBe(302);
      expect(manager.getTasks()).toHaveLength(0);
    });
  });

  describe('POST /executor/tasks/:id/requeue', () => {
    it('resets task to pending', async () => {
      const manager = new ExecutorManager(tempDir);
      manager.stop();
      const task = manager.addTask('/p', 's.md');
      manager.getStore().updateTask(task.id, { status: 'success', endedAt: new Date().toISOString() });
      const config: WebServerConfig = { port: 0, executorManager: manager };
      const { app } = createWebServer(config);

      const res = await app.request(`/executor/tasks/${task.id}/requeue`, { method: 'POST' });
      expect(res.status).toBe(302);
      expect(manager.getTasks()[0].status).toBe('pending');
    });
  });

  describe('POST /executor/start', () => {
    it('enables executor', async () => {
      const manager = new ExecutorManager(tempDir);
      manager.stop();
      const config: WebServerConfig = { port: 0, executorManager: manager };
      const { app } = createWebServer(config);

      const res = await app.request('/executor/start', { method: 'POST' });
      expect(res.status).toBe(302);
      expect(manager.isEnabled).toBe(true);
    });
  });

  describe('POST /executor/stop', () => {
    it('disables executor', async () => {
      const manager = new ExecutorManager(tempDir);
      manager.stop();
      manager.isEnabled = true;
      const config: WebServerConfig = { port: 0, executorManager: manager };
      const { app } = createWebServer(config);

      const res = await app.request('/executor/stop', { method: 'POST' });
      expect(res.status).toBe(302);
      expect(manager.isEnabled).toBe(false);
    });
  });

  describe('POST /executor/config', () => {
    it('updates global config', async () => {
      const manager = new ExecutorManager(tempDir);
      manager.stop();
      const config: WebServerConfig = { port: 0, executorManager: manager };
      const { app } = createWebServer(config);

      const formData = new FormData();
      formData.append('defaultInitialPrompt', 'custom init');
      formData.append('defaultConfirmPrompt', 'custom confirm');

      const res = await app.request('/executor/config', { method: 'POST', body: formData });
      expect(res.status).toBe(302);

      const loaded = manager.getStore().loadConfig();
      expect(loaded.defaultInitialPrompt).toBe('custom init');
      expect(loaded.defaultConfirmPrompt).toBe('custom confirm');
    });
  });

  describe('ExecutorPage component', () => {
    it('renders with empty tasks', () => {
      const html = jsx(ExecutorPage, {
        tasks: [],
        config: { defaultInitialPrompt: 'init', defaultConfirmPrompt: 'confirm' },
        isEnabled: false,
        isExecuting: false,
        currentTask: null,
        projectDirs: ['/tmp/proj'],
        specFiles: ['docs/spec.md'],
      }).toString();
      expect(html).toContain('暂无任务');
    });

    it('renders with pending tasks', () => {
      const html = jsx(ExecutorPage, {
        tasks: [{
          id: 'exec_abc',
          projectId: '/tmp/proj',
          specPath: 'docs/spec.md',
          initialPrompt: null,
          confirmPrompt: null,
          status: 'pending',
          startedAt: null,
          endedAt: null,
          result: null,
          confirmResponse: null,
          createdAt: '2026-05-02T10:00:00Z',
        }],
        config: { defaultInitialPrompt: 'init', defaultConfirmPrompt: 'confirm' },
        isEnabled: true,
        isExecuting: false,
        currentTask: null,
        projectDirs: ['/tmp/proj'],
        specFiles: ['docs/spec.md'],
      }).toString();
      expect(html).toContain('等待中');
      expect(html).toContain('已开启');
    });

    it('shows running status when executing', () => {
      const currentTask = {
        id: 'exec_run',
        projectId: '/tmp/proj',
        specPath: 'docs/running.md',
        initialPrompt: null,
        confirmPrompt: null,
        status: 'running' as const,
        startedAt: '2026-05-02T10:00:00Z',
        endedAt: null,
        result: null,
        confirmResponse: null,
        createdAt: '2026-05-02T10:00:00Z',
      };
      const html = jsx(ExecutorPage, {
        tasks: [currentTask],
        config: { defaultInitialPrompt: 'init', defaultConfirmPrompt: 'confirm' },
        isEnabled: true,
        isExecuting: true,
        currentTask,
        projectDirs: [],
        specFiles: [],
      }).toString();
      expect(html).toContain('执行中');
      expect(html).toContain('docs/running.md');
    });
  });
});
