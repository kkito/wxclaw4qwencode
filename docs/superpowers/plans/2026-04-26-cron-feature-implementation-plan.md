# Cron 定时任务功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 OwnClaw 添加 cron 定时任务功能,支持通过 Web API 和界面管理 bash 脚本的定时执行

**架构:** 使用 node-cron 库进行调度,配置和日志存储在 `~/.ownclaw/cron/` 目录,Web 服务启动时自动注册定时任务

**Tech Stack:** node-cron, zod, hono, child_process, TypeScript

---

## 文件结构概览

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/cron/types.ts` | TypeScript 类型定义 (CronJob, CronLogEntry) |
| `src/cron/schema.ts` | Zod 验证 schema (CronJobSchema, CronLogEntrySchema) |
| `src/cron/store.ts` | jobs.json 文件读写操作 |
| `src/cron/executor.ts` | bash 命令执行 + 日志记录 |
| `src/cron/scheduler.ts` | node-cron 调度管理,注册/停止任务 |
| `src/cron/manager.ts` | 高层管理器,组合 store/scheduler/executor |
| `src/cron/index.ts` | 统一导出 |
| `src/web/views/cron.tsx` | /cron 页面 UI |
| `tests/cron/schema.test.ts` | Zod schema 单元测试 |
| `tests/cron/store.test.ts` | 文件存储单元测试 |
| `tests/cron/executor.test.ts` | bash 执行器单元测试 |
| `tests/cron/manager.test.ts` | 管理器单元测试 |
| `tests/cron/api.test.ts` | Web API 集成测试 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/web/server.tsx` | 添加 `/api/cron/*` 路由和 `/cron` 页面路由 |
| `src/start-web.ts` | 启动时初始化 cron manager |
| `package.json` | 添加 `node-cron` 和 `@types/node-cron` 依赖 |

---

### Task 1: 安装依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 node-cron 依赖**

```bash
pnpm add node-cron
pnpm add -D @types/node-cron
```

- [ ] **Step 2: 验证安装成功**

```bash
pnpm run build
```

预期: 编译成功,无错误

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add node-cron dependency for scheduled tasks"
```

---

### Task 2: 定义 Cron 类型

**Files:**
- Create: `src/cron/types.ts`

- [ ] **Step 1: 编写类型定义**

创建 `src/cron/types.ts`:

```typescript
/**
 * Cron 定时任务定义
 */
export interface CronJob {
  /** 唯一标识 */
  id: string;
  /** 任务名称 */
  name: string;
  /** cron 表达式 (如 "0 2 * * *") */
  cron: string;
  /** 要执行的 bash 命令 */
  command: string;
  /** 是否启用 */
  enabled: boolean;
  /** 创建时间 */
  createdAt: string;
  /** 最后更新时间 */
  updatedAt: string;
}

/**
 * Cron 任务执行日志条目
 */
export interface CronLogEntry {
  /** 执行时间 */
  executedAt: string;
  /** 退出码 (0 表示成功) */
  exitCode: number;
  /** 执行耗时(毫秒) */
  durationMs: number;
  /** 标准输出 */
  stdout: string;
  /** 标准错误 */
  stderr: string;
}

/**
 * Cron 管理器配置
 */
export interface CronManagerConfig {
  /** 状态目录 (默认 ~/.ownclaw/cron) */
  stateDir?: string;
}
```

- [ ] **Step 2: 编译验证**

```bash
pnpm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/cron/types.ts
git commit -m "feat(cron): add TypeScript type definitions"
```

---

### Task 3: 定义 Zod Schema

**Files:**
- Create: `src/cron/schema.ts`
- Test: `tests/cron/schema.test.ts`

- [ ] **Step 1: 编写测试(先写)**

创建 `tests/cron/schema.test.ts`:

```typescript
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

      // cron 表达式应包含 5 或 6 个字段
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
```

- [ ] **Step 2: 运行测试验证失败**

```bash
pnpm run test:run tests/cron/schema.test.ts
```

预期: FAIL (文件不存在)

- [ ] **Step 3: 编写 Schema 实现**

创建 `src/cron/schema.ts`:

```typescript
import { z } from 'zod';

/**
 * Cron 任务验证 Schema
 */
export const CronJobSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cron: z.string().refine(
    (val) => {
      // cron 表达式应有 5 或 6 个空格分隔的字段
      const parts = val.trim().split(/\s+/);
      return parts.length === 5 || parts.length === 6;
    },
    { message: 'Invalid cron expression: must have 5 or 6 fields' }
  ),
  command: z.string().min(1),
  enabled: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * Cron 日志条目验证 Schema
 */
export const CronLogEntrySchema = z.object({
  executedAt: z.string().datetime(),
  exitCode: z.number().int().min(-1),
  durationMs: z.number().min(0),
  stdout: z.string().default(''),
  stderr: z.string().default(''),
});

/**
 * 导出的类型推断
 */
export type CronJobInput = z.input<typeof CronJobSchema>;
export type CronJobOutput = z.output<typeof CronJobSchema>;
export type CronLogEntryInput = z.input<typeof CronLogEntrySchema>;
export type CronLogEntryOutput = z.output<typeof CronLogEntrySchema>;
```

- [ ] **Step 4: 运行测试验证通过**

```bash
pnpm run test:run tests/cron/schema.test.ts
```

预期: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/cron/schema.ts tests/cron/schema.test.ts
git commit -m "feat(cron): add Zod validation schemas with tests"
```

---

### Task 4: 实现文件存储层

**Files:**
- Create: `src/cron/store.ts`
- Test: `tests/cron/store.test.ts`

- [ ] **Step 1: 编写测试(先写)**

创建 `tests/cron/store.test.ts`:

```typescript
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
    // 使用临时目录隔离测试
    testDir = path.join(os.tmpdir(), `ownclaw-cron-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    store = new CronJobStore(testDir);
  });

  afterEach(() => {
    // 清理临时目录
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
```

- [ ] **Step 2: 运行测试验证失败**

```bash
pnpm run test:run tests/cron/store.test.ts
```

预期: FAIL

- [ ] **Step 3: 编写 Store 实现**

创建 `src/cron/store.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';
import { CronJob } from './types.js';
import { CronLogEntry } from './types.js';

/**
 * Cron 任务文件存储管理器
 */
export class CronJobStore {
  private stateDir: string;
  private logsDir: string;

  constructor(stateDir: string) {
    this.stateDir = stateDir;
    this.logsDir = path.join(stateDir, 'logs');
    // 确保目录存在
    fs.mkdirSync(this.stateDir, { recursive: true });
    fs.mkdirSync(this.logsDir, { recursive: true });
  }

  private get jobsFile(): string {
    return path.join(this.stateDir, 'jobs.json');
  }

  private getLogPath(jobId: string): string {
    return path.join(this.logsDir, `${jobId}.json`);
  }

  /** 加载所有任务 */
  loadJobs(): CronJob[] {
    if (!fs.existsSync(this.jobsFile)) {
      return [];
    }
    try {
      const content = fs.readFileSync(this.jobsFile, 'utf-8');
      return JSON.parse(content) as CronJob[];
    } catch {
      return [];
    }
  }

  /** 保存所有任务 */
  saveJobs(jobs: CronJob[]): void {
    fs.writeFileSync(this.jobsFile, JSON.stringify(jobs, null, 2), 'utf-8');
  }

  /** 添加任务 */
  addJob(job: CronJob): void {
    const jobs = this.loadJobs();
    jobs.push(job);
    this.saveJobs(jobs);
  }

  /** 更新任务 */
  updateJob(jobId: string, updated: CronJob): void {
    const jobs = this.loadJobs();
    const index = jobs.findIndex((j) => j.id === jobId);
    if (index === -1) {
      throw new Error(`Job ${jobId} not found`);
    }
    jobs[index] = updated;
    this.saveJobs(jobs);
  }

  /** 删除任务 */
  deleteJob(jobId: string): void {
    const jobs = this.loadJobs();
    const filtered = jobs.filter((j) => j.id !== jobId);
    if (filtered.length === jobs.length) {
      throw new Error(`Job ${jobId} not found`);
    }
    this.saveJobs(filtered);
  }

  /** 查找任务 */
  findJob(jobId: string): CronJob | undefined {
    const jobs = this.loadJobs();
    return jobs.find((j) => j.id === jobId);
  }

  /** 追加日志 */
  appendLog(jobId: string, entry: CronLogEntry): void {
    const logs = this.readLogs(jobId);
    logs.push(entry);
    const logPath = this.getLogPath(jobId);
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2), 'utf-8');
  }

  /** 读取日志 */
  readLogs(jobId: string): CronLogEntry[] {
    const logPath = this.getLogPath(jobId);
    if (!fs.existsSync(logPath)) {
      return [];
    }
    try {
      const content = fs.readFileSync(logPath, 'utf-8');
      return JSON.parse(content) as CronLogEntry[];
    } catch {
      return [];
    }
  }

  /** 清空日志 */
  clearLogs(jobId: string): void {
    const logPath = this.getLogPath(jobId);
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
pnpm run test:run tests/cron/store.test.ts
```

预期: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/cron/store.ts tests/cron/store.test.ts
git commit -m "feat(cron): implement file-based job and log storage with tests"
```

---

### Task 5: 实现 Bash 执行器

**Files:**
- Create: `src/cron/executor.ts`
- Test: `tests/cron/executor.test.ts`

- [ ] **Step 1: 编写测试(先写)**

创建 `tests/cron/executor.test.ts`:

```typescript
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
```

- [ ] **Step 2: 运行测试验证失败**

```bash
pnpm run test:run tests/cron/executor.test.ts
```

预期: FAIL

- [ ] **Step 3: 编写 Executor 实现**

创建 `src/cron/executor.ts`:

```typescript
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { CronJobStore } from './store.js';
import { CronLogEntry } from './types.js';

const execAsync = promisify(exec);

export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Cron 任务执行器
 * 负责执行 bash 命令并捕获输出
 */
export class CronExecutor {
  private store: CronJobStore;

  constructor(store: CronJobStore) {
    this.store = store;
  }

  /**
   * 执行 bash 命令
   */
  async executeJob(command: string): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 300_000, // 5 分钟超时
        maxBuffer: 10 * 1024 * 1024, // 10MB 输出限制
      });

      const durationMs = Date.now() - startTime;

      return {
        exitCode: 0,
        stdout,
        stderr,
        durationMs,
      };
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;

      // exec 抛出非零退出码时会抛出 ChildProcessException
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        'stdout' in error &&
        'stderr' in error
      ) {
        const execError = error as {
          code: number;
          stdout: string;
          stderr: string;
        };
        return {
          exitCode: execError.code ?? 1,
          stdout: execError.stdout ?? '',
          stderr: execError.stderr ?? '',
          durationMs,
        };
      }

      // 其他未知错误
      return {
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        durationMs,
      };
    }
  }

  /**
   * 执行命令并记录日志
   */
  async executeAndLog(jobId: string, command: string): Promise<ExecutionResult> {
    const result = await this.executeJob(command);

    const logEntry: CronLogEntry = {
      executedAt: new Date().toISOString(),
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      stdout: result.stdout,
      stderr: result.stderr,
    };

    this.store.appendLog(jobId, logEntry);

    return result;
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
pnpm run test:run tests/cron/executor.test.ts
```

预期: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/cron/executor.ts tests/cron/executor.test.ts
git commit -m "feat(cron): implement bash executor with output capture and logging"
```

---

### Task 6: 实现调度器

**Files:**
- Create: `src/cron/scheduler.ts`

- [ ] **Step 1: 编写调度器**

创建 `src/cron/scheduler.ts`:

```typescript
import cron from 'node-cron';
import { CronJob } from './types.js';
import { CronExecutor } from './executor.js';

/**
 * Cron 调度器
 * 负责注册/停止定时任务
 */
export class CronScheduler {
  private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();
  private executor: CronExecutor;

  constructor(executor: CronExecutor) {
    this.executor = executor;
  }

  /**
   * 注册单个任务
   */
  scheduleJob(job: CronJob): void {
    if (!job.enabled) {
      return;
    }

    // 如果已存在,先停止旧的
    this.stopJob(job.id);

    const task = cron.schedule(job.cron, async () => {
      try {
        await this.executor.executeAndLog(job.id, job.command);
      } catch (error) {
        console.error(`[Cron] Job ${job.id} execution error:`, error);
      }
    });

    this.scheduledTasks.set(job.id, task);
    task.start();

    console.log(`[Cron] Scheduled job "${job.name}" (${job.cron})`);
  }

  /**
   * 停止单个任务
   */
  stopJob(jobId: string): void {
    const task = this.scheduledTasks.get(jobId);
    if (task) {
      task.stop();
      this.scheduledTasks.delete(jobId);
      console.log(`[Cron] Stopped job ${jobId}`);
    }
  }

  /**
   * 停止所有任务
   */
  stopAll(): void {
    for (const [id, task] of this.scheduledTasks.entries()) {
      task.stop();
    }
    this.scheduledTasks.clear();
    console.log('[Cron] All scheduled tasks stopped');
  }

  /**
   * 获取已注册的任务数量
   */
  get scheduledCount(): number {
    return this.scheduledTasks.size;
  }
}
```

- [ ] **Step 2: 编译验证**

```bash
pnpm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/cron/scheduler.ts
git commit -m "feat(cron): implement cron scheduler with start/stop controls"
```

---

### Task 7: 实现 CronManager 高层管理器

**Files:**
- Create: `src/cron/manager.ts`
- Test: `tests/cron/manager.test.ts`

- [ ] **Step 1: 编写测试(先写)**

创建 `tests/cron/manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
      // 调度器只注册 enabled 的任务
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

      // 创建新实例模拟重启
      const newManager = new CronManager({ stateDir: testDir });
      newManager.initialize();

      expect(newManager.scheduledCount).toBe(2);
      newManager.shutdown();
    });
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
pnpm run test:run tests/cron/manager.test.ts
```

预期: FAIL

- [ ] **Step 3: 编写 Manager 实现**

创建 `src/cron/manager.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import { CronJobStore } from './store.js';
import { CronExecutor } from './executor.js';
import { CronScheduler } from './scheduler.js';
import { CronJob, CronManagerConfig, CronLogEntry } from './types.js';
import { CronJobSchema } from './schema.js';

export interface CreateJobInput {
  name: string;
  cron: string;
  command: string;
  enabled?: boolean;
}

export interface UpdateJobInput {
  name?: string;
  cron?: string;
  command?: string;
  enabled?: boolean;
}

/**
 * Cron 高层管理器
 * 组合 Store + Executor + Scheduler,提供统一 API
 */
export class CronManager {
  private store: CronJobStore;
  private executor: CronExecutor;
  private scheduler: CronScheduler;

  constructor(config: CronManagerConfig = {}) {
    const stateDir = config.stateDir || this.getDefaultStateDir();
    this.store = new CronJobStore(stateDir);
    this.executor = new CronExecutor(this.store);
    this.scheduler = new CronScheduler(this.executor);
  }

  /** 获取默认状态目录 */
  private getDefaultStateDir(): string {
    const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
    return `${home}/.ownclaw/cron`;
  }

  /**
   * 初始化: 从磁盘加载并调度所有启用的任务
   */
  initialize(): void {
    const jobs = this.store.loadJobs();
    for (const job of jobs) {
      if (job.enabled) {
        this.scheduler.scheduleJob(job);
      }
    }
    console.log(`[Cron] Initialized with ${this.scheduler.scheduledCount} scheduled jobs`);
  }

  /**
   * 创建任务
   */
  createJob(input: CreateJobInput): CronJob {
    const now = new Date().toISOString();
    const job: CronJob = {
      id: `job_${randomUUID().substring(0, 8)}`,
      name: input.name,
      cron: input.cron,
      command: input.command,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };

    // 验证
    CronJobSchema.parse(job);

    this.store.addJob(job);

    if (job.enabled) {
      this.scheduler.scheduleJob(job);
    }

    return job;
  }

  /**
   * 列出所有任务
   */
  listJobs(): CronJob[] {
    return this.store.loadJobs();
  }

  /**
   * 获取单个任务
   */
  getJob(jobId: string): CronJob | undefined {
    return this.store.findJob(jobId);
  }

  /**
   * 更新任务
   */
  updateJob(jobId: string, input: UpdateJobInput): CronJob {
    const job = this.store.findJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const updated: CronJob = {
      ...job,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.cron !== undefined && { cron: input.cron }),
      ...(input.command !== undefined && { command: input.command }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
      updatedAt: new Date().toISOString(),
    };

    // 验证
    CronJobSchema.parse(updated);

    this.store.updateJob(jobId, updated);

    // 重新调度
    this.scheduler.stopJob(jobId);
    if (updated.enabled) {
      this.scheduler.scheduleJob(updated);
    }

    return updated;
  }

  /**
   * 删除任务
   */
  deleteJob(jobId: string): void {
    this.scheduler.stopJob(jobId);
    this.store.deleteJob(jobId);
  }

  /**
   * 手动触发执行
   */
  async runJob(jobId: string): Promise<{ exitCode: number; stdout: string; stderr: string; durationMs: number }> {
    const job = this.store.findJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    return this.executor.executeAndLog(jobId, job.command);
  }

  /**
   * 获取任务日志
   */
  getLogs(jobId: string): CronLogEntry[] {
    return this.store.readLogs(jobId);
  }

  /**
   * 清空任务日志
   */
  clearLogs(jobId: string): void {
    this.store.clearLogs(jobId);
  }

  /**
   * 获取已调度任务数量
   */
  get scheduledCount(): number {
    return this.scheduler.scheduledCount;
  }

  /**
   * 关闭所有调度任务
   */
  shutdown(): void {
    this.scheduler.stopAll();
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
pnpm run test:run tests/cron/manager.test.ts
```

预期: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/cron/manager.ts tests/cron/manager.test.ts
git commit -m "feat(cron): implement high-level manager with CRUD and scheduling"
```

---

### Task 8: 添加统一导出

**Files:**
- Create: `src/cron/index.ts`

- [ ] **Step 1: 创建导出文件**

创建 `src/cron/index.ts`:

```typescript
export { CronJobStore } from './store.js';
export { CronExecutor } from './executor.js';
export { CronScheduler } from './scheduler.js';
export { CronManager } from './manager.js';
export { CronJobSchema, CronLogEntrySchema } from './schema.js';
export type { CronJob, CronLogEntry, CronManagerConfig } from './types.js';
export type { CreateJobInput, UpdateJobInput } from './manager.js';
```

- [ ] **Step 2: 编译验证**

```bash
pnpm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/cron/index.ts
git commit -m "feat(cron): add unified module exports"
```

---

### Task 9: 添加 Web API 路由

**Files:**
- Modify: `src/web/server.tsx`

- [ ] **Step 1: 修改服务器添加 API 路由**

修改 `src/web/server.tsx`,在健康检查和首页路由之间添加:

```typescript
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import { IndexPage } from './views/index.js';
import { CronManager, CreateJobInput, UpdateJobInput } from '../cron/index.js';

export interface WebServerConfig {
  port: number;
  host?: string;
  cronManager?: CronManager; // 新增可选参数
}

export function createWebServer(config: WebServerConfig): { app: Hono; server: ServerType } {
  const app = new Hono();

  // 全局请求日志中间件
  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    if (c.req.path !== '/health') {
      console.log(`[HTTP] ${c.req.method} ${c.req.path} - ${c.res.status} (${duration}ms)`);
    }
  });

  // 健康检查端点
  app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // ===== Cron API 路由 =====
  if (config.cronManager) {
    const cron = config.cronManager;

    // GET /api/cron/jobs - 列出所有任务
    app.get('/api/cron/jobs', (c) => {
      const jobs = cron.listJobs();
      return c.json({ jobs });
    });

    // POST /api/cron/jobs - 创建任务
    app.post('/api/cron/jobs', async (c) => {
      try {
        const body = await c.req.json<CreateJobInput>();
        const job = cron.createJob(body);
        return c.json({ job }, 201);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Invalid request';
        return c.json({ error: message }, 400);
      }
    });

    // GET /api/cron/jobs/:id - 获取单个任务
    app.get('/api/cron/jobs/:id', (c) => {
      const job = cron.getJob(c.req.param('id'));
      if (!job) {
        return c.json({ error: 'Job not found' }, 404);
      }
      return c.json({ job });
    });

    // PUT /api/cron/jobs/:id - 更新任务
    app.put('/api/cron/jobs/:id', async (c) => {
      try {
        const body = await c.req.json<UpdateJobInput>();
        const job = cron.updateJob(c.req.param('id'), body);
        return c.json({ job });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Invalid request';
        return c.json({ error: message }, error instanceof Error && error.message.includes('not found') ? 404 : 400);
      }
    });

    // DELETE /api/cron/jobs/:id - 删除任务
    app.delete('/api/cron/jobs/:id', (c) => {
      try {
        cron.deleteJob(c.req.param('id'));
        return c.json({ success: true });
      } catch (error: unknown) {
        return c.json({ error: 'Job not found' }, 404);
      }
    });

    // POST /api/cron/jobs/:id/run - 手动触发
    app.post('/api/cron/jobs/:id/run', async (c) => {
      try {
        const result = await cron.runJob(c.req.param('id'));
        return c.json({ result });
      } catch (error: unknown) {
        return c.json({ error: 'Job not found' }, 404);
      }
    });

    // GET /api/cron/jobs/:id/logs - 查看日志
    app.get('/api/cron/jobs/:id/logs', (c) => {
      const logs = cron.getLogs(c.req.param('id'));
      return c.json({ logs });
    });

    // DELETE /api/cron/jobs/:id/logs - 清空日志
    app.delete('/api/cron/jobs/:id/logs', (c) => {
      cron.clearLogs(c.req.param('id'));
      return c.json({ success: true });
    });
  }

  // 首页路由
  app.get('/', (c) => {
    return c.html(<IndexPage title="OwnClaw" version="1.0.0" />);
  });

  // Cron 页面路由
  app.get('/cron', (c) => {
    const { CronPage } = await import('./views/cron.js');
    return c.html(<CronPage />);
  });

  // 启动服务器
  const server = serve({
    fetch: app.fetch,
    port: config.port,
    hostname: config.host || '0.0.0.0',
  });

  return { app, server };
}
```

等一下,这里有个问题: Hono 的路由处理函数不能直接使用 `await import`,需要改为同步导入或异步处理。让我修正:

```typescript
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import { IndexPage } from './views/index.js';
import { CronPage } from './views/cron.js';
import { CronManager, CreateJobInput, UpdateJobInput } from '../cron/index.js';

export interface WebServerConfig {
  port: number;
  host?: string;
  cronManager?: CronManager;
}

export function createWebServer(config: WebServerConfig): { app: Hono; server: ServerType } {
  const app = new Hono();

  // 全局请求日志中间件
  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    if (c.req.path !== '/health') {
      console.log(`[HTTP] ${c.req.method} ${c.req.path} - ${c.res.status} (${duration}ms)`);
    }
  });

  // 健康检查端点
  app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // ===== Cron API 路由 =====
  if (config.cronManager) {
    const cron = config.cronManager;

    // GET /api/cron/jobs - 列出所有任务
    app.get('/api/cron/jobs', (c) => {
      const jobs = cron.listJobs();
      return c.json({ jobs });
    });

    // POST /api/cron/jobs - 创建任务
    app.post('/api/cron/jobs', async (c) => {
      try {
        const body = await c.req.json<CreateJobInput>();
        const job = cron.createJob(body);
        return c.json({ job }, 201);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Invalid request';
        return c.json({ error: message }, 400);
      }
    });

    // GET /api/cron/jobs/:id - 获取单个任务
    app.get('/api/cron/jobs/:id', (c) => {
      const job = cron.getJob(c.req.param('id'));
      if (!job) {
        return c.json({ error: 'Job not found' }, 404);
      }
      return c.json({ job });
    });

    // PUT /api/cron/jobs/:id - 更新任务
    app.put('/api/cron/jobs/:id', async (c) => {
      try {
        const body = await c.req.json<UpdateJobInput>();
        const job = cron.updateJob(c.req.param('id'), body);
        return c.json({ job });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Invalid request';
        const isNotFound = error instanceof Error && error.message.includes('not found');
        return c.json({ error: message }, isNotFound ? 404 : 400);
      }
    });

    // DELETE /api/cron/jobs/:id - 删除任务
    app.delete('/api/cron/jobs/:id', (c) => {
      try {
        cron.deleteJob(c.req.param('id'));
        return c.json({ success: true });
      } catch (error: unknown) {
        return c.json({ error: 'Job not found' }, 404);
      }
    });

    // POST /api/cron/jobs/:id/run - 手动触发
    app.post('/api/cron/jobs/:id/run', async (c) => {
      try {
        const result = await cron.runJob(c.req.param('id'));
        return c.json({ result });
      } catch (error: unknown) {
        return c.json({ error: 'Job not found' }, 404);
      }
    });

    // GET /api/cron/jobs/:id/logs - 查看日志
    app.get('/api/cron/jobs/:id/logs', (c) => {
      const logs = cron.getLogs(c.req.param('id'));
      return c.json({ logs });
    });

    // DELETE /api/cron/jobs/:id/logs - 清空日志
    app.delete('/api/cron/jobs/:id/logs', (c) => {
      cron.clearLogs(c.req.param('id'));
      return c.json({ success: true });
    });
  }

  // 首页路由
  app.get('/', (c) => {
    return c.html(<IndexPage title="OwnClaw" version="1.0.0" />);
  });

  // Cron 页面路由
  app.get('/cron', (c) => {
    return c.html(<CronPage />);
  });

  // 启动服务器
  const server = serve({
    fetch: app.fetch,
    port: config.port,
    hostname: config.host || '0.0.0.0',
  });

  return { app, server };
}
```

- [ ] **Step 2: 编译验证**

```bash
pnpm run build
```

预期: 会因为缺少 `CronPage` 而编译失败,这是正常的,下一步会创建

- [ ] **Step 3: Commit**

```bash
git add src/web/server.tsx
git commit -m "feat(web): add cron API routes and /cron page route"
```

---

### Task 10: 创建 Cron Web 页面

**Files:**
- Create: `src/web/views/cron.tsx`

- [ ] **Step 1: 创建 Cron 页面组件**

创建 `src/web/views/cron.tsx`:

```typescript
import type { FC } from 'hono/jsx';

interface CronJob {
  id: string;
  name: string;
  cron: string;
  command: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CronLogEntry {
  executedAt: string;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
}

export const CronPage: FC = () => {
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>OwnClaw - Cron 管理</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              :root {
                --background: 0 0% 100%;
                --foreground: 222.2 84% 4.9%;
                --card: 0 0% 100%;
                --card-foreground: 222.2 84% 4.9%;
                --primary: 222.2 47.4% 11.2%;
                --primary-foreground: 210 40% 98%;
                --muted: 210 40% 96.1%;
                --muted-foreground: 215.4 16.3% 46.9%;
                --border: 214.3 31.8% 91.4%;
                --radius: 0.5rem;
                --success: 142 76% 36%;
                --danger: 0 84% 60%;
              }
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background: hsl(var(--background));
                color: hsl(var(--foreground));
                line-height: 1.6;
              }
              .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
              .header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 2rem;
                padding-bottom: 1rem;
                border-bottom: 1px solid hsl(var(--border));
              }
              .header h1 {
                font-size: 2rem;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
              }
              .btn {
                padding: 0.5rem 1rem;
                border: none;
                border-radius: var(--radius);
                cursor: pointer;
                font-size: 0.875rem;
                transition: opacity 0.2s;
              }
              .btn:hover { opacity: 0.8; }
              .btn-primary { background: #667eea; color: white; }
              .btn-success { background: hsl(var(--success)); color: white; }
              .btn-danger { background: hsl(var(--danger)); color: white; }
              .btn-muted { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
              .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
              .card {
                background: hsl(var(--card));
                border: 1px solid hsl(var(--border));
                border-radius: var(--radius);
                padding: 1.5rem;
                margin-bottom: 1rem;
              }
              .form-group { margin-bottom: 1rem; }
              .form-group label {
                display: block;
                margin-bottom: 0.25rem;
                font-weight: 500;
                font-size: 0.875rem;
              }
              .form-group input, .form-group textarea {
                width: 100%;
                padding: 0.5rem;
                border: 1px solid hsl(var(--border));
                border-radius: var(--radius);
                font-family: inherit;
              }
              .form-group textarea { min-height: 80px; resize: vertical; }
              .checkbox { display: flex; align-items: center; gap: 0.5rem; }
              table {
                width: 100%;
                border-collapse: collapse;
              }
              th, td {
                padding: 0.75rem;
                text-align: left;
                border-bottom: 1px solid hsl(var(--border));
              }
              th { font-weight: 600; font-size: 0.875rem; }
              td { font-size: 0.875rem; }
              .badge {
                display: inline-block;
                padding: 0.125rem 0.5rem;
                border-radius: 9999px;
                font-size: 0.75rem;
                font-weight: 500;
              }
              .badge-success { background: hsl(var(--success) / 0.1); color: hsl(var(--success)); }
              .badge-muted { background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }
              .modal {
                display: none;
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.5);
                align-items: center;
                justify-content: center;
              }
              .modal.active { display: flex; }
              .modal-content {
                background: white;
                padding: 2rem;
                border-radius: var(--radius);
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
              }
              .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 1rem;
              }
              .close-btn {
                background: none;
                border: none;
                font-size: 1.5rem;
                cursor: pointer;
              }
              .log-entry {
                padding: 0.5rem;
                margin-bottom: 0.5rem;
                background: hsl(var(--muted));
                border-radius: var(--radius);
                font-family: monospace;
                font-size: 0.75rem;
              }
              .actions { display: flex; gap: 0.25rem; flex-wrap: wrap; }
              .command-cell {
                max-width: 200px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              }
            `,
          }}
        />
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🕐 Cron 任务管理</h1>
            <button class="btn btn-primary" onclick="showCreateModal()">+ 新建任务</button>
          </div>

          <div class="card">
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>Cron</th>
                  <th>命令</th>
                  <th>状态</th>
                  <th>最后执行</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody id="jobs-table">
                <tr><td colspan="6">加载中...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 创建/编辑模态框 */}
        <div class="modal" id="job-modal">
          <div class="modal-content">
            <div class="modal-header">
              <h2 id="modal-title">新建任务</h2>
              <button class="close-btn" onclick="closeModal()">&times;</button>
            </div>
            <form id="job-form" onsubmit="handleSubmit(event)">
              <input type="hidden" id="job-id" />
              <div class="form-group">
                <label for="job-name">名称</label>
                <input type="text" id="job-name" required placeholder="例如: 每日数据清理" />
              </div>
              <div class="form-group">
                <label for="job-cron">Cron 表达式</label>
                <input type="text" id="job-cron" required placeholder="0 2 * * *" />
              </div>
              <div class="form-group">
                <label for="job-command">Bash 命令</label>
                <textarea id="job-command" required placeholder="echo hello"></textarea>
              </div>
              <div class="form-group checkbox">
                <input type="checkbox" id="job-enabled" checked />
                <label for="job-enabled">启用</label>
              </div>
              <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                <button type="button" class="btn btn-muted" onclick="closeModal()">取消</button>
                <button type="submit" class="btn btn-primary">保存</button>
              </div>
            </form>
          </div>
        </div>

        {/* 日志模态框 */}
        <div class="modal" id="log-modal">
          <div class="modal-content">
            <div class="modal-header">
              <h2>执行日志</h2>
              <button class="close-btn" onclick="closeLogModal()">&times;</button>
            </div>
            <div id="log-content">加载中...</div>
          </div>
        </div>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              let jobs = [];

              // 加载任务列表
              async function loadJobs() {
                const res = await fetch('/api/cron/jobs');
                const data = await res.json();
                jobs = data.jobs || [];
                renderJobs();
              }

              // 渲染任务表格
              function renderJobs() {
                const tbody = document.getElementById('jobs-table');
                if (jobs.length === 0) {
                  tbody.innerHTML = '<tr><td colspan="6">暂无任务</td></tr>';
                  return;
                }
                tbody.innerHTML = jobs.map(job => {
                  const lastLog = getLastLog(job.id);
                  return \`
                    <tr>
                      <td>\${escapeHtml(job.name)}</td>
                      <td><code>\${escapeHtml(job.cron)}</code></td>
                      <td class="command-cell" title="\${escapeHtml(job.command)}">\${escapeHtml(job.command)}</td>
                      <td>\${job.enabled ? '<span class="badge badge-success">启用</span>' : '<span class="badge badge-muted">禁用</span>'}</td>
                      <td>\${lastLog ? formatTime(lastLog.executedAt) + (lastLog.exitCode === 0 ? ' ✅' : ' ❌') : '-'}</td>
                      <td class="actions">
                        <button class="btn btn-sm btn-success" onclick="runJob('\${job.id}')">▶ 执行</button>
                        <button class="btn btn-sm btn-muted" onclick="showEditModal('\${job.id}')">✏ 编辑</button>
                        <button class="btn btn-sm btn-muted" onclick="showLogs('\${job.id}')">📋 日志</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteJob('\${job.id}')">🗑 删除</button>
                      </td>
                    </tr>
                  \`;
                }).join('');
              }

              // 获取最后一次日志
              function getLastLog(jobId) {
                const job = jobs.find(j => j.id === jobId);
                if (!job) return null;
                // 这里需要从 API 获取,但为简化先返回 null
                return null;
              }

              // 显示创建模态框
              function showCreateModal() {
                document.getElementById('modal-title').textContent = '新建任务';
                document.getElementById('job-id').value = '';
                document.getElementById('job-name').value = '';
                document.getElementById('job-cron').value = '';
                document.getElementById('job-command').value = '';
                document.getElementById('job-enabled').checked = true;
                document.getElementById('job-modal').classList.add('active');
              }

              // 显示编辑模态框
              async function showEditModal(jobId) {
                const job = jobs.find(j => j.id === jobId);
                if (!job) return;
                document.getElementById('modal-title').textContent = '编辑任务';
                document.getElementById('job-id').value = job.id;
                document.getElementById('job-name').value = job.name;
                document.getElementById('job-cron').value = job.cron;
                document.getElementById('job-command').value = job.command;
                document.getElementById('job-enabled').checked = job.enabled;
                document.getElementById('job-modal').classList.add('active');
              }

              // 关闭模态框
              function closeModal() {
                document.getElementById('job-modal').classList.remove('active');
              }

              // 提交表单
              async function handleSubmit(e) {
                e.preventDefault();
                const id = document.getElementById('job-id').value;
                const data = {
                  name: document.getElementById('job-name').value,
                  cron: document.getElementById('job-cron').value,
                  command: document.getElementById('job-command').value,
                  enabled: document.getElementById('job-enabled').checked,
                };

                const url = id ? \`/api/cron/jobs/\${id}\` : '/api/cron/jobs';
                const method = id ? 'PUT' : 'POST';

                const res = await fetch(url, {
                  method,
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(data),
                });

                if (res.ok) {
                  closeModal();
                  loadJobs();
                } else {
                  const err = await res.json();
                  alert('保存失败: ' + err.error);
                }
              }

              // 手动执行
              async function runJob(jobId) {
                const res = await fetch(\`/api/cron/jobs/\${jobId}/run\`, { method: 'POST' });
                const data = await res.json();
                if (res.ok) {
                  alert('执行成功 (退出码: ' + data.result.exitCode + ')');
                  loadJobs();
                } else {
                  alert('执行失败: ' + data.error);
                }
              }

              // 删除任务
              async function deleteJob(jobId) {
                if (!confirm('确定删除此任务?')) return;
                const res = await fetch(\`/api/cron/jobs/\${jobId}\`, { method: 'DELETE' });
                if (res.ok) {
                  loadJobs();
                }
              }

              // 显示日志
              async function showLogs(jobId) {
                document.getElementById('log-modal').classList.add('active');
                document.getElementById('log-content').textContent = '加载中...';

                const res = await fetch(\`/api/cron/jobs/\${jobId}/logs\`);
                const data = await res.json();

                if (data.logs.length === 0) {
                  document.getElementById('log-content').innerHTML = '<p>暂无日志</p>';
                  return;
                }

                document.getElementById('log-content').innerHTML = data.logs.reverse().map(log => \`
                  <div class="log-entry">
                    <div><strong>时间:</strong> \${formatTime(log.executedAt)} | <strong>退出码:</strong> \${log.exitCode} | <strong>耗时:</strong> \${log.durationMs}ms</div>
                    \${log.stdout ? '<pre>STDOUT: ' + escapeHtml(log.stdout) + '</pre>' : ''}
                    \${log.stderr ? '<pre style="color: red;">STDERR: ' + escapeHtml(log.stderr) + '</pre>' : ''}
                  </div>
                \`).join('');
              }

              // 关闭日志模态框
              function closeLogModal() {
                document.getElementById('log-modal').classList.remove('active');
              }

              // 工具函数
              function formatTime(iso) {
                return new Date(iso).toLocaleString('zh-CN');
              }

              function escapeHtml(str) {
                const div = document.createElement('div');
                div.textContent = str;
                return div.innerHTML;
              }

              // 初始化
              loadJobs();
            `,
          }}
        />
      </body>
    </html>
  );
};
```

- [ ] **Step 2: 编译验证**

```bash
pnpm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/web/views/cron.tsx
git commit -m "feat(web): create cron management page with CRUD UI"
```

---

### Task 11: 集成到 Web 启动脚本

**Files:**
- Modify: `src/start-web.ts`

- [ ] **Step 1: 修改启动脚本**

修改 `src/start-web.ts`,在导入和启动逻辑中添加 cron:

在文件顶部添加导入:

```typescript
import { parseArgs } from 'util';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createWebServer, WebServerConfig } from './web/index.js';
import { CronManager } from './cron/index.js'; // 新增
```

修改 `startWebMain` 函数:

```typescript
function startWebMain(): void {
  const config = resolveWebConfig();

  // 初始化 CronManager
  const cronManager = new CronManager();
  cronManager.initialize();

  console.log(`\n🚀 正在启动 OwnClaw Web 服务器...`);
  console.log(`🌐 地址: http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
  console.log(`📡 端口: ${config.port}`);
  console.log(`🕐 Cron 任务: ${cronManager.scheduledCount} 个已调度\n`);

  const { app, server } = createWebServer({ ...config, cronManager });

  // 优雅退出
  const shutdown = (signal: string) => {
    console.log(`\n收到 ${signal}，正在关闭...`);
    cronManager.shutdown();
    server.close(() => {
      console.log('👋 已关闭');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
```

- [ ] **Step 2: 编译验证**

```bash
pnpm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/start-web.ts
git commit -m "feat: integrate cron manager into web server startup"
```

---

### Task 12: 编写 Web API 集成测试

**Files:**
- Test: `tests/cron/api.test.ts`

- [ ] **Step 1: 编写 API 测试**

创建 `tests/cron/api.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWebServer, WebServerConfig } from '../../src/web/server.js';
import { CronManager } from '../../src/cron/manager.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Cron API Integration', () => {
  let cronManager: CronManager;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `ownclaw-api-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    cronManager = new CronManager({ stateDir: testDir });
    cronManager.initialize();
  });

  afterEach(() => {
    cronManager.shutdown();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  async function createApp() {
    const config: WebServerConfig = { port: 0, cronManager };
    const { app } = createWebServer(config);
    return app;
  }

  it('GET /api/cron/jobs returns empty list', async () => {
    const app = await createApp();
    const res = await app.request('/api/cron/jobs');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toEqual([]);
  });

  it('POST /api/cron/jobs creates a job', async () => {
    const app = await createApp();
    const res = await app.request('/api/cron/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Job',
        cron: '0 2 * * *',
        command: 'echo test',
        enabled: true,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.job.name).toBe('Test Job');
    expect(body.job.id).toBeDefined();
  });

  it('GET /api/cron/jobs/:id returns job', async () => {
    const app = await createApp();

    // 先创建
    const createRes = await app.request('/api/cron/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test',
        cron: '0 2 * * *',
        command: 'echo test',
      }),
    });
    const { job } = await createRes.json();

    // 再获取
    const res = await app.request(`/api/cron/jobs/${job.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.job.id).toBe(job.id);
  });

  it('DELETE /api/cron/jobs/:id deletes job', async () => {
    const app = await createApp();

    const createRes = await app.request('/api/cron/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'ToDelete',
        cron: '0 2 * * *',
        command: 'echo test',
      }),
    });
    const { job } = await createRes.json();

    const delRes = await app.request(`/api/cron/jobs/${job.id}`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);

    const getRes = await app.request(`/api/cron/jobs/${job.id}`);
    expect(getRes.status).toBe(404);
  });

  it('POST /api/cron/jobs/:id/run executes job', async () => {
    const app = await createApp();

    const createRes = await app.request('/api/cron/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'RunTest',
        cron: '0 2 * * *',
        command: 'echo hello_api',
      }),
    });
    const { job } = await createRes.json();

    const res = await app.request(`/api/cron/jobs/${job.id}/run`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.exitCode).toBe(0);
    expect(body.result.stdout).toContain('hello_api');
  });

  it('GET /api/cron/jobs/:id/logs returns logs after execution', async () => {
    const app = await createApp();

    const createRes = await app.request('/api/cron/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'LogTest',
        cron: '0 2 * * *',
        command: 'echo log_me',
      }),
    });
    const { job } = await createRes.json();

    // 先执行
    await app.request(`/api/cron/jobs/${job.id}/run`, { method: 'POST' });

    // 再查日志
    const res = await app.request(`/api/cron/jobs/${job.id}/logs`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs.length).toBeGreaterThan(0);
    expect(body.logs[0].stdout).toContain('log_me');
  });

  it('GET /cron returns HTML page', async () => {
    const app = await createApp();
    const res = await app.request('/cron');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Cron 任务管理');
    expect(html).toContain('<html');
  });
});
```

- [ ] **Step 2: 运行测试**

```bash
pnpm run test:run tests/cron/api.test.ts
```

预期: 全部 PASS

- [ ] **Step 3: Commit**

```bash
git add tests/cron/api.test.ts
git commit -m "test(cron): add web API integration tests"
```

---

### Task 13: 运行完整测试套件

**Files:**
- 全部测试

- [ ] **Step 1: 运行所有测试**

```bash
pnpm run test:run
```

预期: 全部 PASS

- [ ] **Step 2: 类型检查**

```bash
pnpm run typecheck
```

预期: 无错误

- [ ] **Step 3: 编译**

```bash
pnpm run build
```

预期: 成功

- [ ] **Step 4: Commit (如果还有未提交的)**

```bash
git status
git add -A
git commit -m "chore: ensure all tests pass and build succeeds"
```

---

### Task 14: 更新文档

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/TODO.md`

- [ ] **Step 1: 更新 AGENTS.md**

在 AGENTS.md 的"项目结构"部分添加 cron 目录:

```markdown
src/
├── cron/                  # Cron 定时任务模块
│   ├── types.ts           # 类型定义
│   ├── schema.ts          # Zod 验证
│   ├── store.ts           # 文件存储
│   ├── executor.ts        # bash 执行
│   ├── scheduler.ts       # node-cron 调度
│   └── manager.ts         # 高层管理
```

在配置表添加:

| `OWNCLAW_CRON_STATE_DIR` | 否 | `~/.ownclaw/cron` | Cron 状态目录 |

- [ ] **Step 2: 更新 docs/TODO.md**

标记 Cron 功能为已完成(或进行中)

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md docs/TODO.md
git commit -m "docs: update documentation for cron feature"
```

---

## 最终验证

所有任务完成后,执行:

```bash
# 完整测试
pnpm run test:run && pnpm run typecheck && pnpm run build

# 手动测试 Web 服务器
pnpm run web
# 访问 http://localhost:3525/cron
```
