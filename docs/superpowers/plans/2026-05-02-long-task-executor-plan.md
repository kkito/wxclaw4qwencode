# 长程任务执行器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现基于 ACP 协议的长程任务执行器，支持后台管理任务队列、串行执行、状态追踪和 Web 管理页面。

**Architecture:** 独立 `src/executor/` 模块，复用现有 `AcpClient`。包含 types/schema/store/runner/manager 五层结构。Web 页面通过表单交互，无 JSON API。

**Tech Stack:** TypeScript (ES2022), Zod v4, Hono (TSX), @agentclientprotocol/sdk, AcpClient (现有)

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/executor/types.ts` | 新建 | LongTask, ExecutorConfig, TaskStatus 等类型定义 |
| `src/executor/schema.ts` | 新建 | Zod 验证 schema |
| `src/executor/store.ts` | 新建 | 文件存储（tasks.json + config.json） |
| `src/executor/runner.ts` | 新建 | 单任务执行器，包装 AcpClient |
| `src/executor/manager.ts` | 新建 | 高层管理器，串行调度 + 状态控制 |
| `src/executor/index.ts` | 新建 | 统一导出 |
| `src/web/views/executor.tsx` | 新建 | 管理页面 TSX |
| `src/web/server.tsx` | 修改 | 注册 /executor 路由 |
| `tests/executor/schema.test.ts` | 新建 | Schema 验证测试 |
| `tests/executor/store.test.ts` | 新建 | Store CRUD + 配置测试 |
| `tests/executor/runner.test.ts` | 新建 | Runner 正常/异常/超时路径 |
| `tests/executor/manager.test.ts` | 新建 | Manager 串行调度 + 状态控制 |
| `tests/web/executor.test.ts` | 新建 | Web 页面 + 表单提交测试 |

---

### Task 1: Types + Schema

**Files:**
- Create: `src/executor/types.ts`
- Create: `src/executor/schema.ts`
- Test: `tests/executor/schema.test.ts`

- [ ] **Step 1: Write types**

```typescript
// src/executor/types.ts
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'timeout';

export interface LongTask {
  id: string;
  projectId: string;
  specPath: string;
  initialPrompt: string | null;
  confirmPrompt: string | null;
  status: TaskStatus;
  startedAt: string | null;
  endedAt: string | null;
  result: string | null;
  confirmResponse: string | null;
  createdAt: string;
}

export interface ExecutorConfig {
  defaultInitialPrompt: string;
  defaultConfirmPrompt: string;
}
```

- [ ] **Step 2: Write schema**

```typescript
// src/executor/schema.ts
import { z } from 'zod';
import type { LongTask, ExecutorConfig, TaskStatus } from './types.js';

export const TASK_STATUSES: TaskStatus[] = ['pending', 'running', 'success', 'failed', 'timeout'];

export const LongTaskSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  specPath: z.string().min(1),
  initialPrompt: z.string().nullable(),
  confirmPrompt: z.string().nullable(),
  status: z.enum(['pending', 'running', 'success', 'failed', 'timeout']),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  result: z.string().nullable(),
  confirmResponse: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const ExecutorConfigSchema = z.object({
  defaultInitialPrompt: z.string().min(1),
  defaultConfirmPrompt: z.string().min(1),
});

export type LongTaskInput = z.input<typeof LongTaskSchema>;
export type LongTaskOutput = z.output<typeof LongTaskSchema>;
```

- [ ] **Step 3: Write schema tests**

```typescript
// tests/executor/schema.test.ts
import { describe, it, expect } from 'vitest';
import { LongTaskSchema, ExecutorConfigSchema } from '../../src/executor/schema.js';

describe('LongTaskSchema', () => {
  it('should pass for valid task', () => {
    const valid = {
      id: 'task_abc123',
      projectId: '/path/to/project',
      specPath: 'docs/superpowers/specs/test-design.md',
      initialPrompt: null,
      confirmPrompt: null,
      status: 'pending',
      startedAt: null,
      endedAt: null,
      result: null,
      confirmResponse: null,
      createdAt: '2026-05-02T10:00:00Z',
    };
    expect(LongTaskSchema.parse(valid)).toEqual(valid);
  });

  it('should fail for missing required fields', () => {
    expect(() => LongTaskSchema.parse({ id: 'x' })).toThrow();
  });

  it('should fail for invalid status', () => {
    const invalid = {
      id: 'task_1',
      projectId: '/p',
      specPath: 'docs/spec.md',
      initialPrompt: null,
      confirmPrompt: null,
      status: 'invalid_status',
      startedAt: null,
      endedAt: null,
      result: null,
      confirmResponse: null,
      createdAt: '2026-05-02T10:00:00Z',
    };
    expect(() => LongTaskSchema.parse(invalid)).toThrow();
  });
});

describe('ExecutorConfigSchema', () => {
  it('should pass for valid config', () => {
    const valid = {
      defaultInitialPrompt: 'do it',
      defaultConfirmPrompt: 'done?',
    };
    expect(ExecutorConfigSchema.parse(valid)).toEqual(valid);
  });

  it('should fail for empty strings', () => {
    expect(() => ExecutorConfigSchema.parse({ defaultInitialPrompt: '', defaultConfirmPrompt: '' })).toThrow();
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/executor/schema.test.ts -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/executor/types.ts src/executor/schema.ts tests/executor/schema.test.ts
git commit -m "feat(executor): add types and schema with tests"
```

---

### Task 2: Store

**Files:**
- Create: `src/executor/store.ts`
- Test: `tests/executor/store.test.ts`

- [ ] **Step 1: Write store**

```typescript
// src/executor/store.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
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
```

- [ ] **Step 2: Write store tests**

```typescript
// tests/executor/store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { LongTaskStore } from '../../src/executor/store.js';
import type { LongTask } from '../../src/executor/types.js';

describe('LongTaskStore', () => {
  let tempDir: string;
  let store: LongTaskStore;

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
    tempDir = path.join(os.tmpdir(), `executor-store-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    store = new LongTaskStore(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('loadTasks', () => {
    it('returns empty array when file does not exist', () => {
      expect(store.loadTasks()).toEqual([]);
    });

    it('returns empty array when file is empty or invalid', () => {
      fs.writeFileSync(path.join(tempDir, 'tasks.json'), 'not json', 'utf-8');
      expect(store.loadTasks()).toEqual([]);
    });
  });

  describe('saveTasks', () => {
    it('persists tasks to disk', () => {
      const tasks = [makeTask('t1'), makeTask('t2')];
      store.saveTasks(tasks);
      const loaded = store.loadTasks();
      expect(loaded).toHaveLength(2);
      expect(loaded[0].id).toBe('t1');
    });
  });

  describe('CRUD operations', () => {
    it('addTask appends and persists', () => {
      store.addTask(makeTask('t1'));
      expect(store.loadTasks()).toHaveLength(1);
    });

    it('updateTask modifies existing task', () => {
      store.addTask(makeTask('t1', 'pending'));
      store.updateTask('t1', { status: 'running', startedAt: '2026-05-02T11:00:00Z' });
      const tasks = store.loadTasks();
      expect(tasks[0].status).toBe('running');
      expect(tasks[0].startedAt).toBe('2026-05-02T11:00:00Z');
    });

    it('updateTask throws when task not found', () => {
      expect(() => store.updateTask('nonexistent', { status: 'running' })).toThrow('not found');
    });

    it('removeTask deletes and persists', () => {
      store.addTask(makeTask('t1'));
      store.addTask(makeTask('t2'));
      store.removeTask('t1');
      expect(store.loadTasks()).toHaveLength(1);
      expect(store.loadTasks()[0].id).toBe('t2');
    });

    it('removeTask throws when task not found', () => {
      expect(() => store.removeTask('nonexistent')).toThrow('not found');
    });
  });

  describe('getPendingTasks', () => {
    it('returns only pending tasks', () => {
      store.addTask(makeTask('t1', 'pending'));
      store.addTask(makeTask('t2', 'success'));
      store.addTask(makeTask('t3', 'pending'));
      const pending = store.getPendingTasks();
      expect(pending).toHaveLength(2);
      expect(pending.map((t) => t.id).sort()).toEqual(['t1', 't3']);
    });
  });

  describe('config', () => {
    it('returns defaults when config file does not exist', () => {
      const config = store.loadConfig();
      expect(config.defaultInitialPrompt).toContain('完成');
      expect(config.defaultConfirmPrompt).toContain('完成');
    });

    it('saves and loads custom config', () => {
      store.saveConfig({
        defaultInitialPrompt: 'custom init',
        defaultConfirmPrompt: 'custom confirm',
      });
      const config = store.loadConfig();
      expect(config.defaultInitialPrompt).toBe('custom init');
      expect(config.defaultConfirmPrompt).toBe('custom confirm');
    });
  });

  describe('resolvePrompts', () => {
    it('uses global defaults when task prompts are null', () => {
      store.saveConfig({
        defaultInitialPrompt: 'global init',
        defaultConfirmPrompt: 'global confirm',
      });
      const task = makeTask('t1');
      const resolved = store.resolvePrompts(task);
      expect(resolved).toEqual({ initial: 'global init', confirm: 'global confirm' });
    });

    it('uses task prompts when they are set', () => {
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
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run tests/executor/store.test.ts -v`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/executor/store.ts tests/executor/store.test.ts
git commit -m "feat(executor): add store with CRUD and config support"
```

---

### Task 3: Runner

**Files:**
- Create: `src/executor/runner.ts`
- Test: `tests/executor/runner.test.ts`

- [ ] **Step 1: Write runner**

```typescript
// src/executor/runner.ts
import { AcpClient } from '../acp/client.js';
import type { LongTask, ExecutorConfig } from './types.js';
import type { PromptResponse } from '@agentclientprotocol/sdk';

export interface TaskResult {
  status: 'success' | 'failed' | 'timeout';
  startedAt: string;
  endedAt: string;
  result?: string;
  confirmResponse?: string;
}

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export class ExecutorRunner {
  async run(
    task: LongTask,
    config: ExecutorConfig,
    onOutput?: (text: string) => void,
  ): Promise<TaskResult> {
    const startedAt = new Date().toISOString();
    const client = new AcpClient({ cwd: task.projectId, autoApprove: true });

    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;

    try {
      await client.start();

      const initialPrompt = task.initialPrompt ?? config.defaultInitialPrompt;
      const confirmPrompt = task.confirmPrompt ?? config.defaultConfirmPrompt;

      // Set up output callback if provided
      if (onOutput) {
        client.setSessionUpdateCallback((update) => {
          if (update.sessionUpdate === 'agent_message_chunk' && 'content' in update) {
            const content = update.content as { type: string; text?: string };
            if (content.type === 'text' && content.text) {
              onOutput(content.text);
            }
          }
        });
      }

      // Stage 1: Send initial prompt
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutTimer = setTimeout(() => {
          timedOut = true;
          reject(new Error('TIMEOUT'));
        }, TIMEOUT_MS);
      });

      const promptPromise = client.sendMessage(`${task.specPath}\n\n${initialPrompt}`);
      const stage1Response: PromptResponse = await Promise.race([promptPromise, timeoutPromise]);

      // Stage 2: If normal completion, send confirmation prompt
      let result: TaskResult;

      if (stage1Response.stopReason === 'end_turn') {
        // Normal completion, send confirm prompt
        const confirmPromptText = confirmPrompt || '任务是否完成？请回复是或否。';
        const confirmResponse = await Promise.race([
          client.sendMessage(confirmPromptText),
          timeoutPromise,
        ]);

        result = {
          status: confirmResponse.stopReason === 'end_turn' ? 'success' : 'failed',
          startedAt,
          endedAt: new Date().toISOString(),
          result: this.extractResultText(stage1Response),
          confirmResponse: this.extractResultText(confirmResponse),
        };
      } else {
        // Non-normal completion
        result = {
          status: 'failed',
          startedAt,
          endedAt: new Date().toISOString(),
          result: `${stage1Response.stopReason}`,
        };
      }

      return result;
    } catch (error: unknown) {
      const endedAt = new Date().toISOString();
      if (timedOut || (error instanceof Error && error.message === 'TIMEOUT')) {
        return { status: 'timeout', startedAt, endedAt };
      }
      return {
        status: 'failed',
        startedAt,
        endedAt,
        result: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
    }
  }

  private extractResultText(response: PromptResponse): string {
    // Extract text from the prompt response
    // The ACP SDK may store final text in different fields
    // We'll use the usage and stopReason as fallback
    const usage = response.usage
      ? ` [input: ${response.usage.input_tokens}, output: ${response.usage.output_tokens}]`
      : '';
    return `${response.stopReason}${usage}`;
  }
}
```

Wait - I need to reconsider how to capture the actual text response from the ACP prompt. The `PromptResponse` from `@agentclientprotocol/sdk` only contains `stopReason`, `usage`, and `userMessageId`. The actual text content is streamed through `sessionUpdate` events. Let me adjust the approach to accumulate text from the session updates.

```typescript
// src/executor/runner.ts (revised)
import { AcpClient } from '../acp/client.js';
import type { LongTask, ExecutorConfig } from './types.js';
import type { PromptResponse, SessionUpdate } from '@agentclientprotocol/sdk';

export interface TaskResult {
  status: 'success' | 'failed' | 'timeout';
  startedAt: string;
  endedAt: string;
  result?: string;
  confirmResponse?: string;
}

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export class ExecutorRunner {
  async run(
    task: LongTask,
    config: ExecutorConfig,
    onOutput?: (text: string) => void,
  ): Promise<TaskResult> {
    const startedAt = new Date().toISOString();
    const client = new AcpClient({ cwd: task.projectId, autoApprove: true });

    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;

    // Accumulate text from session updates
    let accumulatedText = '';
    let confirmAccumulatedText = '';
    let stage = 'initial' as 'initial' | 'confirm';

    client.setSessionUpdateCallback((update: SessionUpdate) => {
      if (update.sessionUpdate === 'agent_message_chunk' && 'content' in update) {
        const content = update.content as { type: string; text?: string };
        if (content.type === 'text' && content.text) {
          if (stage === 'initial') {
            accumulatedText += content.text;
          } else {
            confirmAccumulatedText += content.text;
          }
          if (onOutput) {
            onOutput(content.text);
          }
        }
      }
    });

    try {
      await client.start();

      const initialPrompt = task.initialPrompt ?? config.defaultInitialPrompt;
      const confirmPrompt = task.confirmPrompt ?? config.defaultConfirmPrompt;

      // Set timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutTimer = setTimeout(() => {
          timedOut = true;
          reject(new Error('TIMEOUT'));
        }, TIMEOUT_MS);
      });

      // Stage 1: Send initial prompt
      const promptText = `${task.specPath}\n\n${initialPrompt}`;
      const stage1Response: PromptResponse = await Promise.race([
        client.sendMessage(promptText),
        timeoutPromise,
      ]);

      // Stage 2: If normal completion, send confirmation prompt
      let result: TaskResult;

      if (stage1Response.stopReason === 'end_turn') {
        stage = 'confirm';
        const confirmPromptText = confirmPrompt || '任务是否完成？请回复是或否。';
        const confirmResponse = await Promise.race([
          client.sendMessage(confirmPromptText),
          timeoutPromise,
        ]);

        result = {
          status: confirmResponse.stopReason === 'end_turn' ? 'success' : 'failed',
          startedAt,
          endedAt: new Date().toISOString(),
          result: accumulatedText.slice(-500), // Last 500 chars as summary
          confirmResponse: confirmAccumulatedText.slice(-500),
        };
      } else {
        result = {
          status: 'failed',
          startedAt,
          endedAt: new Date().toISOString(),
          result: `stopReason: ${stage1Response.stopReason}. ${accumulatedText.slice(-200)}`,
        };
      }

      return result;
    } catch (error: unknown) {
      const endedAt = new Date().toISOString();
      if (timedOut || (error instanceof Error && error.message === 'TIMEOUT')) {
        return { status: 'timeout', startedAt, endedAt };
      }
      return {
        status: 'failed',
        startedAt,
        endedAt,
        result: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}
```

- [ ] **Step 2: Write runner tests (mocking AcpClient)**

```typescript
// tests/executor/runner.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutorRunner } from '../../src/executor/runner.js';
import type { LongTask, ExecutorConfig } from '../../src/executor/types.js';
import { AcpClient } from '../../src/acp/client.js';
import type { PromptResponse, SessionUpdate } from '@agentclientprotocol/sdk';

vi.mock('../../src/acp/client.js');

describe('ExecutorRunner', () => {
  let runner: ExecutorRunner;
  let mockClient: {
    start: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    setSessionUpdateCallback: ReturnType<typeof vi.fn>;
  };

  const mockTask: LongTask = {
    id: 't1',
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
  };

  const mockConfig: ExecutorConfig = {
    defaultInitialPrompt: 'do the task',
    defaultConfirmPrompt: 'done?',
  };

  beforeEach(() => {
    vi.useFakeTimers();
    mockClient = {
      start: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
      setSessionUpdateCallback: vi.fn(),
    };
    vi.mocked(AcpClient).mockImplementation(() => mockClient as unknown as AcpClient);
    runner = new ExecutorRunner();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends spec path + initial prompt on stage 1', async () => {
    mockClient.sendMessage.mockResolvedValue({ stopReason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } });
    await runner.run(mockTask, mockConfig);
    expect(mockClient.sendMessage).toHaveBeenCalledWith('docs/spec.md\n\ndo the task');
  });

  it('sends confirm prompt on normal completion', async () => {
    mockClient.sendMessage
      .mockResolvedValueOnce({ stopReason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } })
      .mockResolvedValueOnce({ stopReason: 'end_turn', usage: { input_tokens: 5, output_tokens: 3 } });
    const result = await runner.run(mockTask, mockConfig);
    expect(mockClient.sendMessage).toHaveBeenCalledTimes(2);
    expect(mockClient.sendMessage).toHaveBeenLastCalledWith('done?');
    expect(result.status).toBe('success');
  });

  it('marks as failed when stage 1 stopReason is not end_turn', async () => {
    mockClient.sendMessage.mockResolvedValue({ stopReason: 'max_tokens' });
    const result = await runner.run(mockTask, mockConfig);
    expect(result.status).toBe('failed');
    expect(mockClient.sendMessage).toHaveBeenCalledTimes(1);
    expect(result.result).toContain('max_tokens');
  });

  it('marks as timeout when 30 minute timeout fires', async () => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT')), 30 * 60 * 1000);
    });
    mockClient.sendMessage.mockReturnValue(timeoutPromise);

    const resultPromise = runner.run(mockTask, mockConfig);
    vi.advanceTimersByTime(30 * 60 * 1000);

    const result = await resultPromise;
    expect(result.status).toBe('timeout');
    expect(mockClient.close).toHaveBeenCalled();
  });

  it('marks as failed when client throws', async () => {
    mockClient.sendMessage.mockRejectedValue(new Error('connection lost'));
    const result = await runner.run(mockTask, mockConfig);
    expect(result.status).toBe('failed');
    expect(result.result).toContain('connection lost');
  });

  it('accumulates text from session updates', async () => {
    let sessionCb: ((update: SessionUpdate) => void) | null = null;
    mockClient.setSessionUpdateCallback.mockImplementation((cb: (update: SessionUpdate) => void) => {
      sessionCb = cb;
    });
    mockClient.sendMessage
      .mockResolvedValueOnce({ stopReason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } })
      .mockResolvedValueOnce({ stopReason: 'end_turn', usage: { input_tokens: 5, output_tokens: 3 } });

    // Simulate streaming output
    if (sessionCb) {
      sessionCb({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hello ' } } as SessionUpdate);
      sessionCb({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'world' } } as SessionUpdate);
    }

    const result = await runner.run(mockTask, mockConfig);
    expect(result.result).toContain('hello world');
  });

  it('closes client in finally block', async () => {
    mockClient.sendMessage.mockResolvedValue({ stopReason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } });
    await runner.run(mockTask, mockConfig);
    expect(mockClient.close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run tests/executor/runner.test.ts -v`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/executor/runner.ts tests/executor/runner.test.ts
git commit -m "feat(executor): add runner with two-stage prompt and timeout"
```

---

### Task 4: Manager

**Files:**
- Create: `src/executor/manager.ts`
- Test: `tests/executor/manager.test.ts`

- [ ] **Step 1: Write manager**

```typescript
// src/executor/manager.ts
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
        // No pending tasks, wait a bit and check again
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
      // Update to running
      this.store.updateTask(task.id, {
        status: 'running',
        startedAt: null, // Will be set by runner
      });

      const config = this.store.loadConfig();
      const result = await this.runner.run(task, config, (text: string) => {
        console.error(`[Executor ${task.id}] ${text.slice(0, 100)}`);
      });

      // Update final status
      this.store.updateTask(task.id, {
        status: result.status,
        startedAt: result.startedAt,
        endedAt: result.endedAt,
        result: result.result ?? null,
        confirmResponse: result.confirmResponse ?? null,
      });
    } catch (error: unknown) {
      this.store.updateTask(task.id, {
        status: 'failed',
        endedAt: new Date().toISOString(),
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
    };
    this.store.addTask(task);
    return task;
  }

  removeTask(id: string): void {
    if (this.isExecuting) {
      const tasks = this.store.loadTasks();
      const running = tasks.find((t) => t.id === id && t.status === 'running');
      if (running) {
        throw new Error('Cannot remove a running的任务');
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
      result: null,
      confirmResponse: null,
    });
  }

  updateConfig(config: ExecutorConfig): void {
    this.store.saveConfig(config);
  }
}
```

Wait, I realize the manager test approach needs to be careful. Since the runner uses a real AcpClient which spawns a subprocess, the tests need to mock the runner. Let me reconsider the test approach.

For the manager tests, I'll mock `ExecutorRunner.run()` so we don't actually spawn `qwen --acp`.

- [ ] **Step 2: Write manager tests**

```typescript
// tests/executor/manager.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ExecutorManager } from '../../src/executor/manager.js';
import { ExecutorRunner } from '../../src/executor/runner.js';
import type { LongTask } from '../../src/executor/types.js';

vi.mock('../../src/executor/runner.js');

describe('ExecutorManager', () => {
  let tempDir: string;
  let manager: ExecutorManager;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `executor-mgr-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    // Mock runner.run to return immediately
    const mockRun = vi.fn().mockResolvedValue({
      status: 'success',
      startedAt: '2026-05-02T10:00:00Z',
      endedAt: '2026-05-02T10:01:00Z',
      result: 'done',
      confirmResponse: '是',
    });
    vi.mocked(ExecutorRunner).mockImplementation(() => ({ run: mockRun } as unknown as ExecutorRunner));

    manager = new ExecutorManager(tempDir);
    // Stop the auto-processing by default
    manager.stop();
  });

  afterEach(() => {
    manager.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('addTask', () => {
    it('creates a pending task', () => {
      const task = manager.addTask('/tmp/proj', 'docs/spec.md');
      expect(task.status).toBe('pending');
      expect(task.projectId).toBe('/tmp/proj');
      expect(task.id.startsWith('exec_')).toBe(true);
    });
  });

  describe('getTasks', () => {
    it('returns all tasks', () => {
      manager.addTask('/p1', 's1.md');
      manager.addTask('/p2', 's2.md');
      const tasks = manager.getTasks();
      expect(tasks).toHaveLength(2);
    });
  });

  describe('removeTask', () => {
    it('removes a pending task', () => {
      const task = manager.addTask('/p', 's.md');
      manager.removeTask(task.id);
      expect(manager.getTasks()).toHaveLength(0);
    });
  });

  describe('requeueTask', () => {
    it('resets task to pending', () => {
      const task = manager.addTask('/p', 's.md');
      manager.getStore().updateTask(task.id, { status: 'success' });
      manager.requeueTask(task.id);
      const tasks = manager.getTasks();
      expect(tasks[0].status).toBe('pending');
      expect(tasks[0].startedAt).toBeNull();
    });
  });

  describe('updateConfig', () => {
    it('saves global config', () => {
      manager.updateConfig({
        defaultInitialPrompt: 'new init',
        defaultConfirmPrompt: 'new confirm',
      });
      const config = manager.getStore().loadConfig();
      expect(config.defaultInitialPrompt).toBe('new init');
    });
  });

  describe('isExecuting protection', () => {
    it('prevents removing running task', async () => {
      manager['isExecuting'] = true;
      const task = manager.addTask('/p', 's.md');
      manager.getStore().updateTask(task.id, { status: 'running' });
      expect(() => manager.removeTask(task.id)).toThrow('运行');
    });

    it('prevents updating running task', async () => {
      manager['isExecuting'] = true;
      const task = manager.addTask('/p', 's.md');
      manager.getStore().updateTask(task.id, { status: 'running' });
      expect(() => manager.updateTask(task.id, { status: 'pending' })).toThrow('运行');
    });

    it('allows removing non-running tasks while executing', async () => {
      manager['isExecuting'] = true;
      const task = manager.addTask('/p', 's.md');
      // Task is still pending, should allow removal
      manager.removeTask(task.id);
      expect(manager.getTasks()).toHaveLength(0);
    });
  });

  describe('processQueue', () => {
    it('processes pending tasks sequentially', async () => {
      manager.addTask('/p1', 's1.md');
      manager.addTask('/p2', 's2.md');

      // Mock runner to resolve immediately
      vi.mocked(ExecutorRunner).mockImplementation(() => ({
        run: vi.fn().mockResolvedValue({
          status: 'success',
          startedAt: '2026-05-02T10:00:00Z',
          endedAt: '2026-05-02T10:01:00Z',
          result: 'done',
          confirmResponse: '是',
        }),
      } as unknown as ExecutorRunner));

      manager = new ExecutorManager(tempDir);

      // Start and let process a couple of tasks
      const startPromise = manager.start();

      // Wait for tasks to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));
      manager.stop();
      await startPromise;

      const tasks = manager.getTasks();
      expect(tasks.filter((t) => t.status === 'success').length).toBeGreaterThanOrEqual(1);
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run tests/executor/manager.test.ts -v`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/executor/manager.ts tests/executor/manager.test.ts
git commit -m "feat(executor): add manager with serial queue and execution protection"
```

---

### Task 5: Index exports

**Files:**
- Create: `src/executor/index.ts`

- [ ] **Step 1: Write index**

```typescript
// src/executor/index.ts
export { LongTaskStore } from './store.js';
export { ExecutorRunner, type TaskResult } from './runner.js';
export { ExecutorManager } from './manager.js';
export { LongTaskSchema, ExecutorConfigSchema } from './schema.js';
export type { LongTask, ExecutorConfig, TaskStatus } from './types.js';
export type { LongTaskInput, LongTaskOutput } from './schema.js';
```

- [ ] **Step 2: Commit**

```bash
git add src/executor/index.ts
git commit -m "feat(executor): add index exports"
```

---

### Task 6: Web View - Executor Page

**Files:**
- Create: `src/web/views/executor.tsx`
- Test: `tests/web/executor.test.ts`

- [ ] **Step 1: Write executor page view**

```tsx
// src/web/views/executor.tsx
import type { FC } from 'hono/jsx';
import type { LongTask, TaskStatus, ExecutorConfig } from '../../executor/types.js';

export interface ExecutorPageProps {
  tasks: LongTask[];
  config: ExecutorConfig;
  isEnabled: boolean;
  isExecuting: boolean;
  currentTask: LongTask | null;
  projectDirs: string[];
  specFiles: string[];
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: '等待中',
  running: '执行中',
  success: '成功',
  failed: '失败',
  timeout: '超时',
};

const STATUS_CLASS: Record<TaskStatus, string> = {
  pending: 'badge-muted',
  running: 'badge-running',
  success: 'badge-success',
  failed: 'badge-danger',
  timeout: 'badge-warn',
};

export const ExecutorPage: FC<ExecutorPageProps> = ({
  tasks,
  config,
  isEnabled,
  isExecuting,
  currentTask,
  projectDirs,
  specFiles,
}) => {
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>OwnClaw - 长程任务执行器</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              :root {
                --background: 0 0% 100%;
                --foreground: 222.2 84% 4.9%;
                --card: 0 0% 100%;
                --primary: 222.2 47.4% 11.2%;
                --muted: 210 40% 96.1%;
                --muted-foreground: 215.4 16.3% 46.9%;
                --border: 214.3 31.8% 91.4%;
                --radius: 0.5rem;
                --success: 142 76% 36%;
                --danger: 0 84% 60%;
                --warn: 38 92% 50%;
                --run: 217 91% 60%;
              }
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: hsl(var(--background)); color: hsl(var(--foreground)); line-height: 1.6; }
              .container { max-width: 1400px; margin: 0 auto; padding: 2rem; }
              .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid hsl(var(--border)); }
              .header h1 { font-size: 2rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
              .btn { padding: 0.5rem 1rem; border: none; border-radius: var(--radius); cursor: pointer; font-size: 0.875rem; transition: opacity 0.2s; }
              .btn:hover { opacity: 0.8; }
              .btn-primary { background: #667eea; color: white; }
              .btn-success { background: hsl(var(--success)); color: white; }
              .btn-danger { background: hsl(var(--danger)); color: white; }
              .btn-warn { background: hsl(var(--warn)); color: white; }
              .btn-muted { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
              .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
              .card { background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: var(--radius); padding: 1.5rem; margin-bottom: 1rem; }
              .card h2 { margin-bottom: 1rem; font-size: 1.25rem; }
              .form-group { margin-bottom: 1rem; }
              .form-group label { display: block; margin-bottom: 0.25rem; font-weight: 500; font-size: 0.875rem; }
              .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 0.5rem; border: 1px solid hsl(var(--border)); border-radius: var(--radius); font-family: inherit; }
              .form-group textarea { min-height: 60px; resize: vertical; }
              table { width: 100%; border-collapse: collapse; }
              th, td { padding: 0.5rem; text-align: left; border-bottom: 1px solid hsl(var(--border)); font-size: 0.8rem; }
              th { font-weight: 600; }
              .badge { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.7rem; font-weight: 500; }
              .badge-success { background: hsl(var(--success) / 0.1); color: hsl(var(--success)); }
              .badge-muted { background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }
              .badge-danger { background: hsl(var(--danger) / 0.1); color: hsl(var(--danger)); }
              .badge-warn { background: hsl(var(--warn) / 0.1); color: hsl(var(--warn)); }
              .badge-run { background: hsl(var(--run) / 0.1); color: hsl(var(--run)); }
              .actions { display: flex; gap: 0.25rem; flex-wrap: wrap; }
              .status-bar { display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem; }
              .status-indicator { padding: 0.5rem 1rem; border-radius: var(--radius); font-weight: 500; }
              .status-on { background: hsl(var(--run) / 0.1); color: hsl(var(--run)); }
              .status-off { background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }
              .flow-desc { font-size: 0.85rem; color: hsl(var(--muted-foreground)); line-height: 1.8; }
              .flow-desc code { background: hsl(var(--muted)); padding: 0.1rem 0.3rem; border-radius: 0.25rem; font-size: 0.8rem; }
              .cell-ellipsis { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
              .cell-result { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
            `,
          }}
        />
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚀 长程任务执行器</h1>
          </div>

          {/* 流程说明 */}
          <div class="card">
            <h2>执行流程</h2>
            <div class="flow-desc">
              <p>1. 添加任务：指定 <code>项目目录</code> + <code>Spec 文件</code>，填写提示词（可选，留空使用全局默认）</p>
              <p>2. 开启执行器：执行器按顺序逐个执行 <code>pending</code> 状态的任务</p>
              <p>3. 任务执行：启动 <code>qwen --acp</code> → 发送 <code>Spec路径 + 初始提示词</code> → 等待 AI 自主完成</p>
              <p>4. 完成确认：正常结束后发送 <code>确认提示词</code>，用 AI 的回复作为最终结果</p>
              <p>5. 异常处理：30 分钟无响应标记 <code>超时</code>；非正常退出标记 <code>失败</code></p>
            </div>
          </div>

          {/* 全局配置 + 执行器控制 */}
          <div class="card">
            <h2>全局配置</h2>
            <form action="/executor/config" method="post">
              <div class="form-group">
                <label>默认初始提示词</label>
                <textarea name="defaultInitialPrompt">{config.defaultInitialPrompt}</textarea>
              </div>
              <div class="form-group">
                <label>默认确认提示词</label>
                <textarea name="defaultConfirmPrompt">{config.defaultConfirmPrompt}</textarea>
              </div>
              <button type="submit" class="btn btn-primary">保存配置</button>
            </form>
          </div>

          <div class="card">
            <div class="status-bar">
              <span>执行器状态：</span>
              {isEnabled ? (
                isExecuting ? (
                  <span class="status-indicator status-on">
                    执行中 {currentTask ? `— ${currentTask.specPath}` : ''}
                  </span>
                ) : (
                  <span class="status-indicator status-on">已开启 (空闲)</span>
                )
              ) : (
                <span class="status-indicator status-off">已关闭</span>
              )}
            </div>
            {isEnabled ? (
              <form action="/executor/stop" method="post" style="display:inline;">
                <button type="submit" class="btn btn-warn" {isExecuting ? 'disabled' : ''}>关闭执行器</button>
              </form>
            ) : (
              <form action="/executor/start" method="post" style="display:inline;">
                <button type="submit" class="btn btn-success">开启执行器</button>
              </form>
            )}
          </div>

          {/* 添加任务 */}
          <div class="card">
            <h2>添加任务</h2>
            <form action="/executor/tasks" method="post">
              <div class="form-group">
                <label>项目目录</label>
                <select name="projectId" required>
                  <option value="">选择项目...</option>
                  {projectDirs.map((d) => <option value={d}>{d}</option>)}
                </select>
              </div>
              <div class="form-group">
                <label>Spec 文件</label>
                <select name="specPath" required>
                  <option value="">选择 Spec...</option>
                  {specFiles.map((s) => <option value={s}>{s}</option>)}
                </select>
              </div>
              <div class="form-group">
                <label>初始提示词（可选，留空使用全局默认）</label>
                <textarea name="initialPrompt" placeholder="留空使用全局默认"></textarea>
              </div>
              <div class="form-group">
                <label>确认提示词（可选，留空使用全局默认）</label>
                <textarea name="confirmPrompt" placeholder="留空使用全局默认"></textarea>
              </div>
              <button type="submit" class="btn btn-primary">添加任务</button>
            </form>
          </div>

          {/* 任务列表 */}
          <div class="card">
            <h2>任务列表</h2>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>项目</th>
                  <th>Spec</th>
                  <th>状态</th>
                  <th>开始</th>
                  <th>结束</th>
                  <th>结果</th>
                  <th>确认回复</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody id="tasks-table">
                {tasks.length === 0 ? (
                  <tr><td colspan={9}>暂无任务</td></tr>
                ) : (
                  tasks.map((task) => (
                    <tr>
                      <td><code>{task.id}</code></td>
                      <td class="cell-ellipsis" title={task.projectId}>{task.projectId}</td>
                      <td class="cell-ellipsis" title={task.specPath}>{task.specPath}</td>
                      <td><span class={`badge badge-${STATUS_CLASS[task.status]}`}>{STATUS_LABELS[task.status]}</span></td>
                      <td>{task.startedAt ? new Date(task.startedAt).toLocaleString('zh-CN') : '-'}</td>
                      <td>{task.endedAt ? new Date(task.endedAt).toLocaleString('zh-CN') : '-'}</td>
                      <td class="cell-result" title={task.result ?? ''}>{task.result ?? '-'}</td>
                      <td class="cell-result" title={task.confirmResponse ?? ''}>{task.confirmResponse ?? '-'}</td>
                      <td class="actions">
                        {task.status !== 'pending' && task.status !== 'running' ? (
                          <form action={`/executor/tasks/${task.id}/requeue`} method="post" style="display:inline;">
                            <button type="submit" class="btn btn-sm btn-muted">重新入队</button>
                          </form>
                        ) : null}
                        <form action={`/executor/tasks/${task.id}/delete`} method="post" style="display:inline;" onsubmit="return confirm('确定删除?')">
                          <button type="submit" class="btn btn-sm btn-danger">删除</button>
                        </form>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </body>
    </html>
  );
};
```

- [ ] **Step 2: Write executor page test**

```typescript
// tests/web/executor.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWebServer, WebServerConfig } from '../../src/web/server.js';
import { ExecutorManager } from '../../src/executor/manager.js';
import { ExecutorPage } from '../../src/web/views/executor.js';
import { jsx } from 'hono/jsx';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('../../src/executor/runner.js');

describe('Executor Web Pages', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `executor-web-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('GET /executor', () => {
    it('renders the executor page', async () => {
      const manager = new ExecutorManager(tempDir);
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
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run tests/web/executor.test.ts -v`

Expected: Some tests may fail because `/executor` routes don't exist yet in server.tsx. That's expected - we'll fix them in Task 7.

---

### Task 7: Wire up Web Server

**Files:**
- Modify: `src/web/server.tsx`

- [ ] **Step 1: Add executor routes to server.tsx**

First, read the current server.tsx to understand the exact structure, then add the executor imports and routes. The key additions:

1. Add `executorManager` to `WebServerConfig`
2. Import `ExecutorPage` and `ExecutorManager`
3. Add `/executor` GET route
4. Add all POST routes for executor
5. Add helper functions to scan project dirs and spec files

```typescript
// Add to src/web/server.tsx imports:
import { ExecutorPage } from './views/executor.js';
import { ExecutorManager } from '../executor/manager.js';
import { loadAcpProjectDirs } from '../acp-config/store.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Add to WebServerConfig:
export interface WebServerConfig {
  port: number;
  host?: string;
  cronManager?: CronManager;
  skillsManager?: SkillsManager;
  executorManager?: ExecutorManager;  // ADD THIS
}

// Add helper function:
function scanSpecFiles(): string[] {
  const specDir = path.join(process.cwd(), 'docs', 'superpowers', 'specs');
  try {
    const files = fs.readdirSync(specDir);
    return files.filter((f) => f.endsWith('.md')).map((f) => path.join('docs', 'superpowers', 'specs', f));
  } catch {
    return [];
  }
}

// Add executor routes (after existing routes, before static routes):
if (config.executorManager) {
  const execMgr = config.executorManager;

  // GET /executor - page
  app.get('/executor', async (c) => {
    const tasks = execMgr.getTasks();
    const config_data = execMgr.getStore().loadConfig();
    const projectDirs = await loadAcpProjectDirs();
    const specFiles = scanSpecFiles();
    const currentTask = tasks.find((t) => t.status === 'running') ?? null;
    return c.html(
      <ExecutorPage
        tasks={tasks}
        config={config_data}
        isEnabled={execMgr.isEnabled}
        isExecuting={execMgr.isExecuting}
        currentTask={currentTask}
        projectDirs={projectDirs}
        specFiles={specFiles}
      />,
    );
  });

  // POST /executor/tasks - create
  app.post('/executor/tasks', async (c) => {
    const form = await c.req.formData();
    const projectId = form.get('projectId') as string;
    const specPath = form.get('specPath') as string;
    const initialPrompt = (form.get('initialPrompt') as string) || null;
    const confirmPrompt = (form.get('confirmPrompt') as string) || null;
    execMgr.addTask(projectId, specPath);
    // Update prompts if provided
    const tasks = execMgr.getTasks();
    const newTask = tasks[tasks.length - 1];
    if (initialPrompt || confirmPrompt) {
      execMgr.updateTask(newTask.id, { initialPrompt, confirmPrompt });
    }
    return c.redirect('/executor');
  });

  // POST /executor/tasks/:id/delete
  app.post('/executor/tasks/:id/delete', async (c) => {
    try {
      execMgr.removeTask(c.req.param('id'));
    } catch {
      // ignore if not found
    }
    return c.redirect('/executor');
  });

  // POST /executor/tasks/:id/requeue
  app.post('/executor/tasks/:id/requeue', async (c) => {
    try {
      execMgr.requeueTask(c.req.param('id'));
    } catch {
      // ignore
    }
    return c.redirect('/executor');
  });

  // POST /executor/start
  app.post('/executor/start', async (c) => {
    await execMgr.start();
    return c.redirect('/executor');
  });

  // POST /executor/stop
  app.post('/executor/stop', async (c) => {
    execMgr.stop();
    return c.redirect('/executor');
  });

  // POST /executor/config
  app.post('/executor/config', async (c) => {
    const form = await c.req.formData();
    execMgr.updateConfig({
      defaultInitialPrompt: (form.get('defaultInitialPrompt') as string) || '',
      defaultConfirmPrompt: (form.get('defaultConfirmPrompt') as string) || '',
    });
    return c.redirect('/executor');
  });
}
```

- [ ] **Step 2: Run all tests to verify nothing is broken**

Run: `pnpm run test:run`
Expected: ALL PASS (or at least no new failures)

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/web/server.tsx src/web/views/executor.tsx tests/web/executor.test.ts
git commit -m "feat(executor): add web routes and management page"
```

---

### Task 8: Integration + entry point

**Files:**
- Modify: `src/index.ts` (if exists, or create if needed)

- [ ] **Step 1: Export executor from index**

```typescript
// Add to src/index.ts:
export { ExecutorManager } from './executor/manager.js';
export { LongTaskStore } from './executor/store.js';
export { ExecutorRunner, type TaskResult } from './executor/runner.js';
export type { LongTask, ExecutorConfig, TaskStatus } from './executor/types.js';
```

- [ ] **Step 2: Run full test suite**

Run: `pnpm run test:run && pnpm run typecheck && pnpm run build`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat(executor): add exports from main index"
```

---
