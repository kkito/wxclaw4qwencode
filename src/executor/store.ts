import fs from 'node:fs';
import path from 'node:path';
import type { LongTask, ExecutorConfig } from './types.js';
import { LongTaskSchema, ExecutorConfigSchema } from './schema.js';

const DEFAULT_CONFIG: ExecutorConfig = {
  defaultInitialPrompt: '请完成 spec 文件中定义的任务。完成后回复完成。',
  defaultConfirmPrompt: '任务是否完成？请回复是或否。',
};

export class LongTaskStore {
  private stateDir: string;

  constructor(stateDir: string) {
    this.stateDir = stateDir;
    fs.mkdirSync(this.stateDir, { recursive: true });
  }

  private get tasksFile(): string {
    return path.join(this.stateDir, 'tasks.json');
  }

  private get configFile(): string {
    return path.join(this.stateDir, 'config.json');
  }

  // --- Task CRUD ---

  loadTasks(): LongTask[] {
    if (!fs.existsSync(this.tasksFile)) {
      return [];
    }
    try {
      const raw = fs.readFileSync(this.tasksFile, 'utf-8');
      const parsed = JSON.parse(raw) as unknown[];
      return parsed.map((t) => LongTaskSchema.parse(t));
    } catch {
      return [];
    }
  }

  saveTasks(tasks: LongTask[]): void {
    for (const t of tasks) {
      LongTaskSchema.parse(t);
    }
    fs.writeFileSync(this.tasksFile, JSON.stringify(tasks, null, 2), 'utf-8');
  }

  addTask(task: LongTask): void {
    const tasks = this.loadTasks();
    tasks.push(task);
    this.saveTasks(tasks);
  }

  updateTask(id: string, updates: Partial<LongTask>): void {
    const tasks = this.loadTasks();
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) {
      throw new Error(`Task ${id} not found`);
    }
    tasks[idx] = { ...tasks[idx], ...updates };
    this.saveTasks(tasks);
  }

  removeTask(id: string): void {
    const tasks = this.loadTasks();
    const filtered = tasks.filter((t) => t.id !== id);
    if (filtered.length === tasks.length) {
      throw new Error(`Task ${id} not found`);
    }
    this.saveTasks(filtered);
  }

  getPendingTasks(): LongTask[] {
    return this.loadTasks().filter((t) => t.status === 'pending');
  }

  // --- Config ---

  loadConfig(): ExecutorConfig {
    if (!fs.existsSync(this.configFile)) {
      return DEFAULT_CONFIG;
    }
    try {
      const raw = fs.readFileSync(this.configFile, 'utf-8');
      const parsed = JSON.parse(raw);
      return ExecutorConfigSchema.parse(parsed);
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  saveConfig(config: ExecutorConfig): void {
    ExecutorConfigSchema.parse(config);
    fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2), 'utf-8');
  }

  // --- Resolve prompts ---

  resolvePrompts(task: LongTask): { initial: string; confirm: string } {
    const config = this.loadConfig();
    return {
      initial: task.initialPrompt ?? config.defaultInitialPrompt,
      confirm: task.confirmPrompt ?? config.defaultConfirmPrompt,
    };
  }
}
