import * as path from 'node:path';
import * as os from 'node:os';
import type { LongTask, ExecutorConfig } from './types.js';
import { LongTaskStore } from './store.js';
import { ExecutorRunner } from './runner.js';
import { randomUUID } from 'node:crypto';

export class ExecutorManager {
  private store: LongTaskStore;
  private runner: ExecutorRunner;
  public isEnabled = false;
  public isExecuting = false;
  private running = false;

  constructor(stateDir?: string) {
    const dir = stateDir || path.join(os.homedir(), '.ownclaw', 'executor');
    this.store = new LongTaskStore(dir);
    this.runner = new ExecutorRunner();
  }

  getStore(): LongTaskStore {
    return this.store;
  }

  async start(): Promise<void> {
    if (this.isEnabled) return;
    this.isEnabled = true;
    this.running = true;
    await this.processQueue();
  }

  stop(): void {
    if (this.isExecuting) {
      // Wait for current task to finish, then stop
      this.running = false;
      return;
    }
    this.isEnabled = false;
    this.running = false;
  }

  private async processQueue(): Promise<void> {
    while (this.running) {
      const pending = this.store.getPendingTasks();
      if (pending.length === 0) {
        // No pending tasks, wait and check again
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      const task = pending[0];
      await this.executeTask(task);
    }
  }

  private async executeTask(task: LongTask): Promise<void> {
    this.isExecuting = true;

    try {
      const now = new Date().toISOString();
      this.store.updateTask(task.id, {
        status: 'running',
        startedAt: now,
        updatedAt: now,
        latestOutput: null,
      });

      const config = this.store.loadConfig();
      let latestOutput: string | null = null;
      const result = await this.runner.run(task, config, (progress) => {
        latestOutput = progress.latestOutput;
        this.store.updateTask(task.id, {
          updatedAt: progress.updatedAt,
          latestOutput: progress.latestOutput,
        });
      });

      this.store.updateTask(task.id, {
        status: result.status,
        startedAt: result.startedAt,
        endedAt: result.endedAt,
        updatedAt: result.endedAt,
        latestOutput: latestOutput,
        result: result.result ?? null,
        confirmResponse: result.confirmResponse ?? null,
      });
    } catch (error: unknown) {
      const endedAt = new Date().toISOString();
      this.store.updateTask(task.id, {
        status: 'failed',
        endedAt,
        updatedAt: endedAt,
        result: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isExecuting = false;
    }
  }

  addTask(projectId: string, specPath: string): LongTask {
    const task: LongTask = {
      id: `exec_${randomUUID().substring(0, 8)}`,
      projectId,
      specPath,
      initialPrompt: null,
      confirmPrompt: null,
      status: 'pending',
      startedAt: null,
      endedAt: null,
      result: null,
      confirmResponse: null,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      latestOutput: null,
    };
    this.store.addTask(task);
    return task;
  }

  removeTask(id: string): void {
    if (this.isExecuting) {
      const tasks = this.store.loadTasks();
      const running = tasks.find((t) => t.id === id && t.status === 'running');
      if (running) {
        throw new Error('Cannot remove a running task');
      }
    }
    this.store.removeTask(id);
  }

  getTasks(): LongTask[] {
    return this.store.loadTasks();
  }

  updateTask(id: string, updates: Partial<LongTask>): void {
    if (this.isExecuting) {
      const tasks = this.store.loadTasks();
      const running = tasks.find((t) => t.id === id && t.status === 'running');
      if (running) {
        throw new Error('Cannot update a running task');
      }
    }
    this.store.updateTask(id, updates);
  }

  requeueTask(id: string): void {
    this.store.updateTask(id, {
      status: 'pending',
      startedAt: null,
      endedAt: null,
      updatedAt: null,
      latestOutput: null,
      result: null,
      confirmResponse: null,
    });
  }

  updateConfig(config: ExecutorConfig): void {
    this.store.saveConfig(config);
  }
}
