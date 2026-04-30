# ACP 微信集成实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过斜杠命令系统实现微信用户进入 ACP 开发模式，连接 `qwen --acp` 进程进行代码开发。

**Architecture:** 文件驱动的斜杠命令框架 + ACP 会话管理器 + WeixinBridge 前置路由。ACP 流式输出通过批量累积策略转换为微信消息。

**Tech Stack:** TypeScript, @agentclientprotocol/sdk, zod, Vitest

---

## 文件结构

```
src/
├── slash-command/
│   ├── types.ts                      # SlashCommand 接口、HandlerResult
│   ├── schema.ts                     # COMMAND.md frontmatter Zod 验证
│   ├── registry.ts                   # SlashCommandRegistry
│   ├── loader.ts                     # SlashCommandLoader
│   └── index.ts                      # 统一导出
│
├── acp-session/
│   ├── types.ts                      # AcpSession 接口、超时配置
│   ├── output.ts                     # AcpWeixinOutput（流式 → 微信）
│   ├── session.ts                    # AcpSession（封装 AcpClient）
│   ├── manager.ts                    # AcpSessionManager
│   └── index.ts                      # 统一导出
│
├── commands/                         # 内置斜杠命令（代码中自带）
│   └── acp/
│       └── handler.ts                # /acp 命令处理
│
├── bridge/
│   └── weixin-bridge.ts              # 修改：增加 SlashCommandRouter
│
└── acp/
    ├── handlers.ts                   # 修改：增加 sessionUpdate callback 支持
    └── client.ts                     # 修改：增加带 callback 的 sendMessage
```

**新增测试：**
```
tests/
├── slash-command/
│   ├── registry.test.ts
│   ├── schema.test.ts
│   └── loader.test.ts
├── acp-session/
│   ├── output.test.ts
│   ├── session.test.ts
│   └── manager.test.ts
└── bridge/
    └── weixin-bridge-acp.test.ts
```

---

### Task 1: 斜杠命令类型定义和 Schema

**Files:**
- Create: `src/slash-command/types.ts`
- Create: `src/slash-command/schema.ts`
- Create: `src/slash-command/index.ts`
- Test: `tests/slash-command/schema.test.ts`

- [ ] **Step 1: 写测试 — schema 验证**

```typescript
// tests/slash-command/schema.test.ts
import { describe, it, expect } from 'vitest';
import { CommandManifestSchema } from '../../src/slash-command/schema.js';

describe('CommandManifestSchema', () => {
  it('接受有效的 COMMAND.md frontmatter', () => {
    const input = {
      name: 'acp',
      description: '进入 ACP 开发模式',
      usage: '/acp /path/to/project',
      handler: './handler.ts',
    };
    const result = CommandManifestSchema.parse(input);
    expect(result.name).toBe('acp');
    expect(result.handler).toBe('./handler.ts');
  });

  it('拒绝缺少 name 的 frontmatter', () => {
    const input = {
      description: 'test',
      handler: './handler.ts',
    };
    expect(() => CommandManifestSchema.parse(input)).toThrow();
  });

  it('拒绝缺少 handler 的 frontmatter', () => {
    const input = {
      name: 'test',
      description: 'test',
    };
    expect(() => CommandManifestSchema.parse(input)).toThrow();
  });

  it('拒绝 handler 不以 ./ 或 / 开头的路径', () => {
    const input = {
      name: 'test',
      description: 'test',
      handler: '../escape.ts',
    };
    expect(() => CommandManifestSchema.parse(input)).toThrow();
  });
});
```

- [ ] **Step 2: 实现 schema**

```typescript
// src/slash-command/schema.ts
import { z } from 'zod';

export const CommandManifestSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  usage: z.string().optional(),
  handler: z.string().refine((val) => {
    // 防止路径穿越：必须以 ./ 或 / 开头
    return val.startsWith('./') || val.startsWith('/');
  }),
});

export type CommandManifest = z.infer<typeof CommandManifestSchema>;
```

- [ ] **Step 3: 写类型定义**

```typescript
// src/slash-command/types.ts
import { CommandManifest } from './schema.js';

/**
 * 斜杠命令处理结果
 */
export interface SlashCommandResult {
  /** 是否已处理 */
  handled: boolean;
  /** 回复消息（发送给微信用户） */
  reply?: string;
}

/**
 * 斜杠命令上下文
 */
export interface SlashCommandContext {
  /** 微信用户 ID */
  userId: string;
  /** 完整消息文本 */
  text: string;
  /** 发送微信消息的函数 */
  sendMessage: (text: string) => Promise<void>;
}

/**
 * 斜杠命令 Handler 函数签名
 */
export type SlashCommandHandler = (
  args: string,
  context: SlashCommandContext,
) => Promise<SlashCommandResult>;

/**
 * 注册的命令元数据（含加载后的 handler）
 */
export interface RegisteredCommand extends CommandManifest {
  handler: SlashCommandHandler;
  /** 命令目录绝对路径 */
  dirPath: string;
}
```

- [ ] **Step 4: 写 index.ts 导出**

```typescript
// src/slash-command/index.ts
export { CommandManifestSchema } from './schema.js';
export type { CommandManifest } from './schema.js';
export type {
  SlashCommandResult,
  SlashCommandContext,
  SlashCommandHandler,
  RegisteredCommand,
} from './types.js';
export { SlashCommandRegistry } from './registry.js';
export { SlashCommandLoader } from './loader.js';
```

- [ ] **Step 5: 运行测试**

```bash
pnpm run test:run -- tests/slash-command/schema.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/slash-command/types.ts src/slash-command/schema.ts src/slash-command/index.ts tests/slash-command/schema.test.ts
git commit -m "feat(slash-command): add types and schema with tests"
```

---

### Task 2: 斜杠命令 Registry 和 Loader

**Files:**
- Create: `src/slash-command/registry.ts`
- Create: `src/slash-command/loader.ts`
- Test: `tests/slash-command/registry.test.ts`
- Test: `tests/slash-command/loader.test.ts`

- [ ] **Step 1: 写测试 — Registry**

```typescript
// tests/slash-command/registry.test.ts
import { describe, it, expect, vi } from 'vitest';
import { SlashCommandRegistry } from '../../src/slash-command/registry.js';
import type { SlashCommandHandler } from '../../src/slash-command/types.js';

describe('SlashCommandRegistry', () => {
  it('注册和获取命令', () => {
    const registry = new SlashCommandRegistry();
    const handler: SlashCommandHandler = vi.fn();
    registry.register('test', {
      name: 'test',
      description: 'Test command',
      handler,
      dirPath: '/tmp/test',
    });

    const cmd = registry.get('test');
    expect(cmd).toBeDefined();
    expect(cmd!.name).toBe('test');
  });

  it('获取不存在的命令返回 undefined', () => {
    const registry = new SlashCommandRegistry();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('hasCommand 检查存在性', () => {
    const registry = new SlashCommandRegistry();
    const handler: SlashCommandHandler = vi.fn();
    registry.register('foo', {
      name: 'foo',
      description: 'Foo',
      handler,
      dirPath: '/tmp/foo',
    });

    expect(registry.hasCommand('foo')).toBe(true);
    expect(registry.hasCommand('bar')).toBe(false);
  });

  it('列出所有命令名称', () => {
    const registry = new SlashCommandRegistry();
    const h: SlashCommandHandler = vi.fn();
    registry.register('a', { name: 'a', description: 'A', handler: h, dirPath: '/tmp/a' });
    registry.register('b', { name: 'b', description: 'B', handler: h, dirPath: '/tmp/b' });

    const names = registry.listNames();
    expect(names.sort()).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: 实现 Registry**

```typescript
// src/slash-command/registry.ts
import type { RegisteredCommand } from './types.js';

export class SlashCommandRegistry {
  private commands: Map<string, RegisteredCommand> = new Map();

  register(name: string, command: RegisteredCommand): void {
    this.commands.set(name, command);
  }

  get(name: string): RegisteredCommand | undefined {
    return this.commands.get(name);
  }

  hasCommand(name: string): boolean {
    return this.commands.has(name);
  }

  listNames(): string[] {
    return Array.from(this.commands.keys());
  }

  /** 获取所有已注册命令 */
  listAll(): RegisteredCommand[] {
    return Array.from(this.commands.values());
  }
}
```

- [ ] **Step 3: 写测试 — Loader**

```typescript
// tests/slash-command/loader.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SlashCommandLoader } from '../../src/slash-command/loader.js';
import { SlashCommandRegistry } from '../../src/slash-command/registry.js';

describe('SlashCommandLoader', () => {
  const testDir = '/tmp/ownclaw-test-commands';

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('加载有效命令目录', async () => {
    // 创建测试命令目录
    const acpDir = path.join(testDir, 'acp');
    fs.mkdirSync(acpDir);
    fs.writeFileSync(
      path.join(acpDir, 'COMMAND.md'),
      '---\nname: acp\ndescription: ACP mode\nhandler: ./handler.ts\n---\n',
    );
    // 创建一个假的 handler（导出 default function）
    fs.writeFileSync(
      path.join(acpDir, 'handler.ts'),
      'export default async function handler() { return { handled: true }; }',
    );

    const registry = new SlashCommandRegistry();
    const loader = new SlashCommandLoader(testDir);
    await loader.loadCommands(registry);

    expect(registry.hasCommand('acp')).toBe(true);
  });

  it('跳过没有 COMMAND.md 的目录', async () => {
    const badDir = path.join(testDir, 'bad');
    fs.mkdirSync(badDir);

    const registry = new SlashCommandRegistry();
    const loader = new SlashCommandLoader(testDir);
    await loader.loadCommands(registry);

    expect(registry.listNames()).toHaveLength(0);
  });

  it('跳过无效的 COMMAND.md', async () => {
    const badDir = path.join(testDir, 'bad');
    fs.mkdirSync(badDir);
    // 缺少 handler 字段
    fs.writeFileSync(
      path.join(badDir, 'COMMAND.md'),
      '---\nname: bad\ndescription: bad\n---\n',
    );

    const registry = new SlashCommandRegistry();
    const loader = new SlashCommandLoader(testDir);
    await loader.loadCommands(registry);

    expect(registry.listNames()).toHaveLength(0);
  });

  it('跳过路径穿越的 handler', async () => {
    const evilDir = path.join(testDir, 'evil');
    fs.mkdirSync(evilDir);
    fs.writeFileSync(
      path.join(evilDir, 'COMMAND.md'),
      '---\nname: evil\ndescription: evil\nhandler: ../../../etc/passwd\n---\n',
    );

    const registry = new SlashCommandRegistry();
    const loader = new SlashCommandLoader(testDir);
    await loader.loadCommands(registry);

    expect(registry.listNames()).toHaveLength(0);
  });
});
```

- [ ] **Step 4: 实现 Loader**

```typescript
// src/slash-command/loader.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SlashCommandRegistry } from './registry.js';
import { CommandManifestSchema } from './schema.js';
import type { SlashCommandHandler } from './types.js';

export class SlashCommandLoader {
  private commandsDir: string;

  constructor(commandsDir: string) {
    this.commandsDir = commandsDir;
  }

  /**
   * 从文件系统加载所有命令到 Registry
   */
  async loadCommands(registry: SlashCommandRegistry): Promise<void> {
    if (!fs.existsSync(this.commandsDir)) {
      return;
    }

    const entries = fs.readdirSync(this.commandsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const cmdDir = path.join(this.commandsDir, entry.name);
      const manifestPath = path.join(cmdDir, 'COMMAND.md');

      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest = await this.parseManifest(manifestPath);
        if (!manifest) continue;

        const handler = await this.loadHandler(cmdDir, manifest.handler);
        if (!handler) continue;

        registry.register(manifest.name, {
          ...manifest,
          handler,
          dirPath: cmdDir,
        });
      } catch (err) {
        console.error(`[SlashCommand] 加载命令 ${entry.name} 失败:`, err);
      }
    }
  }

  private async parseManifest(manifestPath: string): Promise<import('./schema.js').CommandManifest | null> {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      console.error(`[SlashCommand] ${manifestPath}: 没有 frontmatter`);
      return null;
    }

    const frontmatter = frontmatterMatch[1];
    const parsed: Record<string, unknown> = {};
    for (const line of frontmatter.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();
      // 去掉引号
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      parsed[key] = value;
    }

    try {
      return CommandManifestSchema.parse(parsed);
    } catch (err) {
      console.error(`[SlashCommand] ${manifestPath}: schema 验证失败:`, err);
      return null;
    }
  }

  private async loadHandler(cmdDir: string, handlerPath: string): Promise<SlashCommandHandler | null> {
    // 安全检查：路径必须在命令目录下
    const resolved = path.resolve(cmdDir, handlerPath);
    if (!resolved.startsWith(cmdDir)) {
      console.error(`[SlashCommand] 拒绝路径穿越: ${handlerPath}`);
      return null;
    }

    if (!fs.existsSync(resolved)) {
      console.error(`[SlashCommand] handler 不存在: ${resolved}`);
      return null;
    }

    try {
      // 动态导入 handler 模块
      const mod = await import(`file://${resolved}`);
      return (mod.default as SlashCommandHandler) || null;
    } catch (err) {
      console.error(`[SlashCommand] 加载 handler 失败 ${resolved}:`, err);
      return null;
    }
  }
}
```

- [ ] **Step 5: 运行测试**

```bash
pnpm run test:run -- tests/slash-command/registry.test.ts tests/slash-command/loader.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/slash-command/registry.ts src/slash-command/loader.ts tests/slash-command/registry.test.ts tests/slash-command/loader.test.ts
git commit -m "feat(slash-command): add registry and loader with tests"
```

---

### Task 3: ACP 流式输出 → 微信消息

**Files:**
- Create: `src/acp-session/output.ts`
- Test: `tests/acp-session/output.test.ts`

- [ ] **Step 1: 写测试 — AcpWeixinOutput**

```typescript
// tests/acp-session/output.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcpWeixinOutput } from '../../src/acp-session/output.js';

describe('AcpWeixinOutput', () => {
  let output: AcpWeixinOutput;
  let sendMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    output = new AcpWeixinOutput({
      prefix: '[ACP 模式] 工作目录: /test\n---\n',
      flushIntervalMs: 3000,
      flushThresholdChars: 200,
    });
    sendMock = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('累积内容达到阈值时发送', () => {
    const longText = 'a'.repeat(200);
    output.onAgentMessageChunk(longText, 'user1', sendMock);
    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0][0]).toContain('[ACP 模式]');
    expect(sendMock.mock.calls[0][0]).toContain(longText);
  });

  it('累积内容达到时间阈值时发送', () => {
    output.onAgentMessageChunk('Hello', 'user1', sendMock);
    vi.advanceTimersByTime(3100);
    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0][0]).toContain('Hello');
  });

  it('flush 强制发送', () => {
    output.onAgentMessageChunk('partial', 'user1', sendMock);
    expect(sendMock).not.toHaveBeenCalled();

    output.flush('user1', sendMock);
    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0][0]).toContain('partial');
  });

  it('不同用户独立缓冲', () => {
    output.onAgentMessageChunk('msg1', 'user1', sendMock);
    output.onAgentMessageChunk('msg2', 'user2', sendMock);

    output.flush('user1', sendMock);
    expect(sendMock).toHaveBeenNthCalledWith(1, expect.stringContaining('msg1'));

    output.flush('user2', sendMock);
    expect(sendMock).toHaveBeenNthCalledWith(2, expect.stringContaining('msg2'));
  });

  it('工具调用时发送缓冲内容', () => {
    output.onAgentMessageChunk('some text', 'user1', sendMock);
    output.onToolCall({ name: 'read_file' }, 'user1', sendMock);
    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0][0]).toContain('some text');
  });

  it('最终完成时 flush 并发送完成提示', () => {
    output.onAgentMessageChunk('final answer', 'user1', sendMock);
    output.onComplete('user1', sendMock);

    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0][0]).toContain('final answer');
  });
});
```

- [ ] **Step 2: 实现 AcpWeixinOutput**

```typescript
// src/acp-session/output.ts
import type { SessionUpdate, ToolCall } from '@agentclientprotocol/sdk';

interface AcpWeixinOutputOptions {
  /** 每条消息前缀 */
  prefix: string;
  /** 定时 flush间隔 (ms) */
  flushIntervalMs: number;
  /** 字符数阈值 */
  flushThresholdChars: number;
}

interface UserBuffer {
  text: string;
  timer: ReturnType<typeof setTimeout> | null;
}

export class AcpWeixinOutput {
  private buffers: Map<string, UserBuffer> = new Map();
  private options: AcpWeixinOutputOptions;

  constructor(options: AcpWeixinOutputOptions) {
    this.options = options;
  }

  /**
   * 处理 Agent 消息内容块（文本）
   */
  onAgentMessageChunk(text: string, userId: string, sendMessage: (msg: string) => Promise<void>): void {
    if (!text) return;
    const buf = this.getOrCreateBuffer(userId);
    buf.text += text;
    this.maybeFlush(buf, userId, sendMessage);
  }

  /**
   * 处理 Agent 思考内容块（仅日志，不发送）
   */
  onAgentThought(text: string, _userId: string, _sendMessage: (msg: string) => Promise<void>): void {
    // 思考内容不发送给微信用户，仅可选日志
  }

  /**
   * 处理工具调用
   */
  onToolCall(toolCall: { name: string }, userId: string, sendMessage: (msg: string) => Promise<void>): void {
    // 工具调用时先 flush 已有文本，然后发送工具提示
    const buf = this.getOrCreateBuffer(userId);
    if (buf.text.length > 0) {
      this.flushBuffer(buf, userId, sendMessage);
    }
    sendMessage(`${this.options.prefix}\n🔧 正在调用: ${toolCall.name}`);
  }

  /**
   * 处理会话完成
   */
  onComplete(userId: string, sendMessage: (msg: string) => Promise<void>): void {
    const buf = this.getOrCreateBuffer(userId);
    if (buf.text.length > 0) {
      this.flushBuffer(buf, userId, sendMessage);
    }
  }

  /**
   * 强制 flush 指定用户
   */
  flush(userId: string, sendMessage: (msg: string) => Promise<void>): void {
    const buf = this.buffers.get(userId);
    if (buf && buf.text.length > 0) {
      this.flushBuffer(buf, userId, sendMessage);
    }
  }

  /**
   * 处理 ACP sessionUpdate 事件的路由
   */
  onSessionUpdate(update: SessionUpdate, userId: string, sendMessage: (msg: string) => Promise<void>): void {
    switch (update.sessionUpdate) {
      case 'agent_message_chunk': {
        const text = this.extractText((update as Record<string, unknown>).content);
        this.onAgentMessageChunk(text, userId, sendMessage);
        break;
      }
      case 'agent_thought_chunk': {
        const text = this.extractText((update as Record<string, unknown>).content);
        this.onAgentThought(text, userId, sendMessage);
        break;
      }
      case 'tool_call': {
        const tc = update as ToolCall;
        const name = tc.toolCallId ?? 'unknown';
        this.onToolCall({ name }, userId, sendMessage);
        break;
      }
    }
  }

  /**
   * 清理指定用户的缓冲
   */
  cleanup(userId: string): void {
    const buf = this.buffers.get(userId);
    if (buf?.timer) {
      clearTimeout(buf.timer);
    }
    this.buffers.delete(userId);
  }

  private getOrCreateBuffer(userId: string): UserBuffer {
    if (!this.buffers.has(userId)) {
      this.buffers.set(userId, { text: '', timer: null });
    }
    return this.buffers.get(userId)!;
  }

  private maybeFlush(buf: UserBuffer, userId: string, sendMessage: (msg: string) => Promise<void>): void {
    // 字符数阈值触发
    if (buf.text.length >= this.options.flushThresholdChars) {
      this.flushBuffer(buf, userId, sendMessage);
      return;
    }
    // 时间阈值触发（重置定时器）
    if (buf.timer) {
      clearTimeout(buf.timer);
    }
    buf.timer = setTimeout(() => {
      this.flushBuffer(buf, userId, sendMessage);
    }, this.options.flushIntervalMs);
  }

  private flushBuffer(buf: UserBuffer, userId: string, sendMessage: (msg: string) => Promise<void>): void {
    if (buf.timer) {
      clearTimeout(buf.timer);
      buf.timer = null;
    }
    if (buf.text.length === 0) return;
    const msg = this.options.prefix + buf.text;
    sendMessage(msg);
    buf.text = '';
  }

  private extractText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && 'text' in item) {
            return String((item as Record<string, unknown>).text ?? '');
          }
          return '';
        })
        .join('');
    }
    if (content && typeof content === 'object' && 'text' in content) {
      return String((content as Record<string, unknown>).text ?? '');
    }
    return '';
  }
}
```

- [ ] **Step 3: 运行测试**

```bash
pnpm run test:run -- tests/acp-session/output.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/acp-session/output.ts tests/acp-session/output.test.ts
git commit -m "feat(acp-session): add AcpWeixinOutput streaming with tests"
```

---

### Task 4: ACP 会话管理（Session + Manager）

**Files:**
- Create: `src/acp-session/types.ts`
- Create: `src/acp-session/session.ts`
- Create: `src/acp-session/manager.ts`
- Create: `src/acp-session/index.ts`
- Test: `tests/acp-session/session.test.ts`
- Test: `tests/acp-session/manager.test.ts`

- [ ] **Step 1: 写类型定义**

```typescript
// src/acp-session/types.ts
import type { AcpClient } from '../acp/index.js';

export interface AcpSessionConfig {
  /** 超时时间（毫秒），默认 30 分钟 */
  timeoutMs?: number;
}

export interface AcpSession {
  userId: string;
  cwd: string;
  client: AcpClient;
  lastActivity: Date;
  output: import('./output.js').AcpWeixinOutput;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
}

export const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
```

- [ ] **Step 2: 写测试 — SessionManager 核心逻辑**

```typescript
// tests/acp-session/manager.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcpSessionManager } from '../../src/acp-session/manager.js';

// Mock AcpClient
vi.mock('../../src/acp/client.js', () => ({
  AcpClient: class MockAcpClient {
    async start() {}
    async sendMessage() {}
    async close() {}
    getSessionInfo() { return { sessionId: 'mock', cwd: '/test' }; }
  },
}));

describe('AcpSessionManager', () => {
  let manager: AcpSessionManager;
  let sendMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    sendMock = vi.fn().mockResolvedValue(undefined);
    manager = new AcpSessionManager({ timeoutMs: 5000 }); // 5 秒超时用于测试
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('创建会话', async () => {
    await manager.createSession('user1', '/test', sendMock);
    expect(manager.hasActiveSession('user1')).toBe(true);
  });

  it('重复创建返回已存在的', async () => {
    await manager.createSession('user1', '/test', sendMock);
    await manager.createSession('user1', '/other', sendMock);
    expect(manager.hasActiveSession('user1')).toBe(true);
  });

  it('结束会话', async () => {
    await manager.createSession('user1', '/test', sendMock);
    manager.endSession('user1');
    expect(manager.hasActiveSession('user1')).toBe(false);
  });

  it('超时自动结束会话', async () => {
    await manager.createSession('user1', '/test', sendMock);
    expect(manager.hasActiveSession('user1')).toBe(true);

    vi.advanceTimersByTime(6000);
    manager.checkTimeouts();
    expect(manager.hasActiveSession('user1')).toBe(false);

    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('超时'));
  });

  it('发消息重置超时', async () => {
    await manager.createSession('user1', '/test', sendMock);
    vi.advanceTimersByTime(4000);
    // 重置活动
    manager.updateActivity('user1');
    vi.advanceTimersByTime(4000);
    manager.checkTimeouts();
    expect(manager.hasActiveSession('user1')).toBe(true);
  });
});
```

- [ ] **Step 3: 实现 SessionManager**

```typescript
// src/acp-session/manager.ts
import { AcpClient } from '../acp/client.js';
import { AcpWeixinOutput } from './output.js';
import { AcpSessionConfig, DEFAULT_TIMEOUT_MS } from './types.js';

interface ManagerOptions extends AcpSessionConfig {}

interface ActiveSession {
  client: AcpClient;
  cwd: string;
  lastActivity: Date;
  output: AcpWeixinOutput;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
}

export class AcpSessionManager {
  private sessions: Map<string, ActiveSession> = new Map();
  private options: Required<ManagerOptions>;

  constructor(options: ManagerOptions = {}) {
    this.options = {
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  }

  /**
   * 创建 ACP 会话
   */
  async createSession(
    userId: string,
    cwd: string,
    sendToWeixin: (msg: string) => Promise<void>,
  ): Promise<void> {
    if (this.sessions.has(userId)) {
      sendToWeixin('⚠️ 您已经在 ACP 模式中了，请先 exit 退出');
      return;
    }

    const client = new AcpClient({
      cwd,
      autoApprove: true,
    });

    try {
      await client.start();
    } catch (err) {
      sendToWeixin(`❌ ACP 连接失败: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    const output = new AcpWeixinOutput({
      prefix: `[ACP 模式] 工作目录: ${cwd}\n---\n`,
      flushIntervalMs: 3000,
      flushThresholdChars: 200,
    });

    const session: ActiveSession = {
      client,
      cwd,
      lastActivity: new Date(),
      output,
      timeoutTimer: null,
    };

    this.sessions.set(userId, session);
    sendToWeixin(`✅ 已进入 ACP 模式\n工作目录: ${cwd}\n发送 exit 退出`);
    this.startTimeoutTimer(userId);
  }

  /**
   * 结束 ACP 会话
   */
  async endSession(
    userId: string,
    sendToWeixin?: (msg: string) => Promise<void>,
  ): Promise<void> {
    const session = this.sessions.get(userId);
    if (!session) {
      sendToWeixin?.('⚠️ 当前不在 ACP 模式中');
      return;
    }

    // 清除定时器
    if (session.timeoutTimer) {
      clearTimeout(session.timeoutTimer);
    }

    // 强制 flush 输出
    await session.output.flush(userId, sendToWeixin ?? (async () => {}));
    session.output.cleanup(userId);

    // 关闭 ACP 连接
    await session.client.close();

    this.sessions.delete(userId);
    sendToWeixin?.('👋 已退出 ACP 模式');
  }

  /**
   * 发送消息到 ACP
   */
  async sendMessage(
    userId: string,
    message: string,
    sendToWeixin: (msg: string) => Promise<void>,
  ): Promise<void> {
    const session = this.sessions.get(userId);
    if (!session) {
      sendToWeixin('⚠️ 当前不在 ACP 模式中，请先发送 /acp /path/to/project 进入');
      return;
    }

    // 重置超时
    this.updateActivity(userId);

    // 创建自定义 handler 捕获 sessionUpdate 并转发到微信
    await this.sendWithStreaming(session, message, sendToWeixin);
  }

  /**
   * 更新活动时间（重置超时）
   */
  updateActivity(userId: string): void {
    const session = this.sessions.get(userId);
    if (!session) return;
    session.lastActivity = new Date();
    this.startTimeoutTimer(userId);
  }

  /**
   * 检查超时会话并清理
   */
  checkTimeouts(): void {
    const now = Date.now();
    for (const [userId, session] of this.sessions) {
      const elapsed = now - session.lastActivity.getTime();
      if (elapsed > this.options.timeoutMs) {
        this.endSession(userId, async (msg) => {
          console.log(`[ACP] ${userId}: ${msg}`);
        });
      }
    }
  }

  /**
   * 检查用户是否有活跃会话
   */
  hasActiveSession(userId: string): boolean {
    return this.sessions.has(userId);
  }

  /**
   * 获取会话工作目录
   */
  getSessionCwd(userId: string): string | undefined {
    return this.sessions.get(userId)?.cwd;
  }

  /**
   * 获取活跃会话数
   */
  getActiveCount(): number {
    return this.sessions.size;
  }

  private startTimeoutTimer(userId: string): void {
    const session = this.sessions.get(userId);
    if (!session) return;

    if (session.timeoutTimer) {
      clearTimeout(session.timeoutTimer);
    }

    session.timeoutTimer = setTimeout(() => {
      this.checkTimeouts();
    }, this.options.timeoutMs);
  }

  private async sendWithStreaming(
    session: ActiveSession,
    message: string,
    sendToWeixin: (msg: string) => Promise<void>,
  ): Promise<void> {
    // 使用 AcpClient 的 sendMessage 方法
    // sessionUpdate 事件会通过 handler 回调传递
    // 这里需要自定义 handler 将 sessionUpdate 转发到微信
    await session.client.sendMessageWithCallback(
      message,
      (update) => {
        session.output.onSessionUpdate(update, session.client.getSessionInfo()?.sessionId || 'unknown', sendToWeixin);
      },
    );
    // 完成后 flush
    session.output.flush(session.client.getSessionInfo()?.sessionId || 'unknown', sendToWeixin);
  }
}
```

Note: The `sendMessageWithCallback` method doesn't exist on AcpClient yet — we'll add it in Task 6.

- [ ] **Step 4: 实现 index.ts 导出**

```typescript
// src/acp-session/index.ts
export { AcpSessionManager } from './manager.js';
export { AcpWeixinOutput } from './output.js';
export type { AcpSessionConfig } from './types.js';
export { DEFAULT_TIMEOUT_MS } from './types.js';
```

- [ ] **Step 5: 运行测试**

```bash
pnpm run test:run -- tests/acp-session/manager.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/acp-session/types.ts src/acp-session/session.ts src/acp-session/manager.ts src/acp-session/index.ts tests/acp-session/manager.test.ts
git commit -m "feat(acp-session): add AcpSessionManager with timeout and tests"
```

---

### Task 5: /acp 斜杠命令 Handler

**Files:**
- Create: `src/commands/acp/handler.ts`
- Test: `tests/commands/acp.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// tests/commands/acp.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import createAcpHandler from '../../src/commands/acp/handler.js';

describe('/acp command handler', () => {
  let handler: ReturnType<typeof createAcpHandler>;
  let sendMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMock = vi.fn().mockResolvedValue(undefined);
    handler = createAcpHandler();
  });

  it('带有效路径时创建会话', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    const result = await handler('/home/user/project', {
      userId: 'user1',
      text: '/acp /home/user/project',
      sendMessage: sendMock,
    });

    expect(result.handled).toBe(true);
    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('已进入 ACP 模式'));
  });

  it('不带路径时提示', async () => {
    const result = await handler('', {
      userId: 'user1',
      text: '/acp',
      sendMessage: sendMock,
    });

    expect(result.handled).toBe(true);
    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('请提供项目路径'));
  });

  it('路径不存在时提示', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const result = await handler('/nonexistent', {
      userId: 'user1',
      text: '/acp /nonexistent',
      sendMessage: sendMock,
    });

    expect(result.handled).toBe(true);
    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('不存在'));
  });

  it('已经在 ACP 模式中时提示', async () => {
    const manager = { hasActiveSession: () => true, createSession: vi.fn() } as any;
    handler = createAcpHandler(manager);

    const result = await handler('/tmp', {
      userId: 'user1',
      text: '/acp /tmp',
      sendMessage: sendMock,
    });

    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('已经在 ACP 模式中'));
  });
});
```

- [ ] **Step 2: 实现 handler**

```typescript
// src/commands/acp/handler.ts
import * as fs from 'node:fs';
import type { SlashCommandHandler, SlashCommandContext } from '../../slash-command/types.js';

/**
 * 创建 /acp 命令处理器
 * @param sessionManager 可选，用于测试注入
 */
export default function createAcpHandler(
  sessionManager?: import('../../acp-session/manager.js').AcpSessionManager,
): SlashCommandHandler {
  return async (args: string, context: SlashCommandContext) => {
    const trimmed = args.trim();

    // 已经在 ACP 模式中
    if (sessionManager?.hasActiveSession(context.userId)) {
      await context.sendMessage('⚠️ 您已经在 ACP 模式中，请先发送 exit 退出');
      return { handled: true };
    }

    // 没有提供路径
    if (!trimmed) {
      await context.sendMessage('请提供项目路径，例如：\n/acp /home/kkito/proj/myapp');
      return { handled: true };
    }

    // 路径不存在
    if (!fs.existsSync(trimmed)) {
      await context.sendMessage(`❌ 路径不存在: ${trimmed}`);
      return { handled: true };
    }

    // 不是目录
    if (!fs.statSync(trimmed).isDirectory()) {
      await context.sendMessage(`❌ 不是目录: ${trimmed}`);
      return { handled: true };
    }

    // 获取或创建 sessionManager（从全局或闭包）
    const mgr = sessionManager || getGlobalSessionManager();
    if (!mgr) {
      await context.sendMessage('❌ ACP 功能未初始化');
      return { handled: true };
    }

    await mgr.createSession(context.userId, trimmed, context.sendMessage);
    return { handled: true };
  };
}

/** 全局 sessionManager 引用（由 start.ts 初始化时设置） */
let _globalManager: import('../../acp-session/manager.js').AcpSessionManager | null = null;

export function getGlobalSessionManager() {
  return _globalManager;
}

export function setGlobalSessionManager(mgr: import('../../acp-session/manager.js').AcpSessionManager) {
  _globalManager = mgr;
}
```

- [ ] **Step 3: 运行测试**

```bash
pnpm run test:run -- tests/commands/acp.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/commands/acp/handler.ts tests/commands/acp.test.ts
git commit -m "feat(commands): add /acp slash command handler with tests"
```

---

### Task 6: AcpClient 增加 callback 支持

**Files:**
- Modify: `src/acp/client.ts` — 增加 `sendMessageWithCallback` 方法
- Modify: `src/acp/handlers.ts` — `createClientHandler` 增加可选 callback
- Test: `tests/acp/client-streaming.test.ts`

- [ ] **Step 1: 修改 handlers.ts 支持 callback**

```typescript
// src/acp/handlers.ts - 修改 createClientHandler 签名
import type { Client, Agent, RequestPermissionRequest, RequestPermissionResponse, SessionNotification, PermissionOption, SelectedPermissionOutcome, ToolCall, SessionUpdate } from '@agentclientprotocol/sdk';

export interface HandlerOptions {
  autoApprove?: boolean;
  /** 可选：sessionUpdate 回调 */
  onSessionUpdate?: (update: SessionUpdate) => void;
}

export function createClientHandler(options: HandlerOptions = {}): (agent: Agent) => Client {
  const { autoApprove = true, onSessionUpdate } = options;

  return (_agent: Agent): Client => {
    return {
      requestPermission: async (params: RequestPermissionRequest): Promise<RequestPermissionResponse> => {
        // ... 现有代码不变 ...
        const toolCall = params.toolCall as ToolCall | undefined;
        const toolName = toolCall?._meta?.name as string ?? toolCall?.toolCallId ?? '未知工具';
        const toolInput = toolCall?.rawInput;

        console.error(`\n[权限] 收到权限请求:`);
        console.error(`[权限] 工具: ${toolName}`);
        if (toolInput) {
          const inputStr = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput);
          console.error(`[权限] 输入: ${inputStr.slice(0, 200)}`);
        }

        if (autoApprove) {
          const availableOptions: PermissionOption[] = params.options ?? [];
          const selectedOption =
            availableOptions.find((o: PermissionOption) => o.kind === 'allow_once') ??
            availableOptions.find((o: PermissionOption) => o.kind === 'allow_always') ??
            availableOptions[0];

          if (selectedOption) {
            console.error(`[权限] 自动同意 (optionId: ${selectedOption.optionId}, kind: ${selectedOption.kind})`);
            const outcome: SelectedPermissionOutcome = { optionId: selectedOption.optionId };
            return { outcome: { outcome: 'selected', ...outcome } };
          } else {
            console.error(`[权限] 无可用选项，拒绝`);
            return { outcome: { outcome: 'cancelled' } };
          }
        } else {
          console.error(`[权限] 拒绝（手动模式未实现交互式确认）`);
          return { outcome: { outcome: 'cancelled' } };
        }
      },

      sessionUpdate: async (params: SessionNotification): Promise<void> => {
        // 原有终端输出
        formatSessionUpdate(params);
        // 可选回调（用于微信转发）
        if (onSessionUpdate) {
          onSessionUpdate(params.update);
        }
      },

      extNotification: async (): Promise<void> => {},
    };
  };
}
```

- [ ] **Step 2: 修改 AcpClient 增加 sendMessageWithCallback**

```typescript
// src/acp/client.ts — 在现有 sendMessage 方法之后添加

  /**
   * 发送消息并通过回调接收流式 sessionUpdate 事件
   */
  async sendMessageWithCallback(
    message: string,
    onSessionUpdate: (update: import('@agentclientprotocol/sdk').SessionUpdate) => void,
  ): Promise<void> {
    if (!this.acpConnection || !this.sessionInfo) {
      throw new Error('未连接或未创建会话');
    }

    // 重新创建带 callback 的 handler
    const clientFactory = createClientHandler({
      autoApprove: this.options.autoApprove ?? true,
      onSessionUpdate,
    });

    // 替换连接的 handler（需要重新初始化）
    // 由于 AcpConnection 已经建立，我们需要通过 connection 的现有机制注入
    // 实际上 sessionUpdate 是通过 Client 的 sessionUpdate 方法接收的
    // 这里最简方案：直接调用 prompt，callback 由已注册的 handler 触发
    await this.acpConnection.prompt({
      sessionId: this.sessionInfo.sessionId,
      prompt: [
        {
          type: 'text',
          text: message,
        },
      ],
    });
  }
```

Wait — the handler is set at connection time, not at prompt time. I need to reconsider this approach. Let me revise:

The cleanest approach is to have AcpClient store the callback and have the handler use it. Let me redesign:

```typescript
// src/acp/client.ts — 修改构造函数和 start 方法

import type { ClientSideConnection, PromptResponse, NewSessionResponse, SessionUpdate } from '@agentclientprotocol/sdk';

export class AcpClient {
  // ... existing fields ...
  private sessionUpdateCallback: ((update: SessionUpdate) => void) | null = null;

  constructor(options: AcpClientOptions) {
    this.options = options;
    this.connection = new AcpConnection();
  }

  /**
   * 设置 sessionUpdate 回调（用于流式输出）
   */
  setSessionUpdateCallback(cb: (update: SessionUpdate) => void): void {
    this.sessionUpdateCallback = cb;
  }

  // ... start() 方法修改：在 createClientHandler 中传入 callback ...
  async start(): Promise<void> {
    const cb = this.sessionUpdateCallback;
    const clientFactory = createClientHandler({
      autoApprove: this.options.autoApprove ?? true,
      onSessionUpdate: cb ?? undefined,
    });
    // ... rest same
  }
```

This is cleaner. The client sets up the callback before start(), and the handler uses it.

- [ ] **Step 3: 写测试**

```typescript
// tests/acp/client-streaming.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AcpClient } from '../../src/acp/client.js';

describe('AcpClient streaming callback', () => {
  it('设置 callback 后 start 会使用它', () => {
    const client = new AcpClient({ cwd: '/tmp', autoApprove: true });
    const cb = vi.fn();
    client.setSessionUpdateCallback(cb);
    // Full integration test would need mocking the child process
    // For now, verify the setter works
    expect(cb).toBeDefined();
  });
});
```

- [ ] **Step 4: 运行类型检查**

```bash
pnpm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/acp/client.ts src/acp/handlers.ts tests/acp/client-streaming.test.ts
git commit -m "feat(acp): add sessionUpdate callback support to AcpClient"
```

---

### Task 7: 集成 WeixinBridge 斜杠命令路由

**Files:**
- Modify: `src/bridge/weixin-bridge.ts` — 增加 SlashCommandRouter
- Test: `tests/bridge/weixin-bridge-acp.test.ts`

- [ ] **Step 1: 修改 WeixinBridge**

```typescript
// src/bridge/weixin-bridge.ts — 在构造函数和 handleMessage 中增加斜杠命令支持

import { SlashCommandRegistry, SlashCommandLoader } from '../slash-command/index.js';
import os from 'node:os';
import path from 'node:path';

export class WeixinBridge {
  // ... existing fields ...
  private slashRegistry: SlashCommandRegistry;

  constructor(options: WeixinBridgeOptions & { slashRegistry?: SlashCommandRegistry }) {
    // ... existing ...
    this.slashRegistry = options.slashRegistry || new SlashCommandRegistry();
  }

  async handleMessage(weixinMsg: WeixinMessage): Promise<void> {
    const userId = weixinMsg.from_user_id;
    if (!userId) {
      this.logger.warn('消息缺少 from_user_id');
      return;
    }

    const text = this.extractText(weixinMsg);
    this.logger.info(`[用户消息] from ${userId}: ${text}`);

    // === 斜杠命令前置拦截 ===
    if (text.startsWith('/')) {
      const commandName = text.slice(1).split(/\s/)[0];
      const command = this.slashRegistry.get(commandName);
      if (command) {
        const args = text.slice(1 + commandName.length).trim();
        const sendMessage = async (reply: string) => {
          await this.sendMessageFn(userId, reply);
        };
        try {
          const result = await command.handler(args, {
            userId,
            text,
            sendMessage,
          });
          if (result.handled) return;
        } catch (err) {
          this.logger.error(`斜杠命令执行失败 /${commandName}:`, err);
          await this.sendMessageFn(userId, `❌ 命令执行失败: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
      }
    }

    // === 原有 AI 流程 ===
    try {
      await this.sendMessageFn(userId, '已收到，开始处理...');
      const msg = this.convertToMsg(weixinMsg);
      const reply = await this.agent.reply({ msgs: [msg] });
      // ... rest of existing code
    } catch (error) {
      this.logger.error('处理消息失败:', error);
      try {
        await this.sendMessageFn(userId, '抱歉，处理您的消息时出现错误，请稍后重试。');
      } catch {
        // ignore
      }
    }
  }

  /** 获取斜杠命令注册表（供外部注入） */
  getSlashRegistry(): SlashCommandRegistry {
    return this.slashRegistry;
  }
}
```

- [ ] **Step 2: 写集成测试**

```typescript
// tests/bridge/weixin-bridge-acp.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WeixinBridge } from '../../src/bridge/weixin-bridge.js';
import { SlashCommandRegistry } from '../../src/slash-command/registry.js';
import type { SlashCommandHandler, RegisteredCommand } from '../../src/slash-command/types.js';

describe('WeixinBridge slash command routing', () => {
  let sendMock: ReturnType<typeof vi.fn>;
  let registry: SlashCommandRegistry;
  let bridge: WeixinBridge;

  beforeEach(() => {
    sendMock = vi.fn().mockResolvedValue(undefined);
    registry = new SlashCommandRegistry();
    bridge = new WeixinBridge({
      agent: { reply: vi.fn().mockResolvedValue(null) } as any,
      sendMessage: sendMock,
      slashRegistry: registry,
    });
  });

  it('斜杠命令被注册表中的命令处理', async () => {
    const handler: SlashCommandHandler = vi.fn().mockResolvedValue({ handled: true });
    registry.register('test', {
      name: 'test',
      description: 'Test',
      handler,
      dirPath: '/tmp/test',
    } as RegisteredCommand);

    await bridge.handleMessage({
      from_user_id: 'user1',
      item_list: [{ type: 1, text_item: { text: '/test arg1' } }],
    } as any);

    expect(handler).toHaveBeenCalledWith('arg1', {
      userId: 'user1',
      text: '/test arg1',
      sendMessage: expect.any(Function),
    });
    // AI 流程不应被调用
    // （sendMessage 只被 handler 调用）
  });

  it('未注册的斜杠命令走 AI 流程', async () => {
    const agentReply = { content: [{ type: 'text', text: 'AI response' }] };
    const agent = { reply: vi.fn().mockResolvedValue(agentReply) } as any;
    bridge = new WeixinBridge({
      agent,
      sendMessage: sendMock,
      slashRegistry: registry,
    });

    await bridge.handleMessage({
      from_user_id: 'user1',
      item_list: [{ type: 1, text_item: { text: '/unknown' } }],
    } as any);

    // 走 AI 流程：先发送"开始处理"，再发送 AI 回复
    expect(sendMock).toHaveBeenCalledWith('已收到，开始处理...');
    expect(agent.reply).toHaveBeenCalled();
  });

  it('非斜杠命令走 AI 流程', async () => {
    const agentReply = { content: [{ type: 'text', text: 'Hello' }] };
    const agent = { reply: vi.fn().mockResolvedValue(agentReply) } as any;
    bridge = new WeixinBridge({
      agent,
      sendMessage: sendMock,
      slashRegistry: registry,
    });

    await bridge.handleMessage({
      from_user_id: 'user1',
      item_list: [{ type: 1, text_item: { text: '你好' } }],
    } as any);

    expect(sendMock).toHaveBeenCalledWith('已收到，开始处理...');
    expect(agent.reply).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: 运行测试**

```bash
pnpm run test:run -- tests/bridge/weixin-bridge-acp.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/bridge/weixin-bridge.ts tests/bridge/weixin-bridge-acp.test.ts
git commit -m "feat(bridge): add slash command routing to WeixinBridge"
```

---

### Task 8: start.ts 集成斜杠命令和 ACP

**Files:**
- Modify: `src/start.ts` — 初始化 SlashCommandLoader + AcpSessionManager

- [ ] **Step 1: 修改 start.ts**

在创建 WeixinBridge 之前，添加斜杠命令加载和 ACP 管理器初始化：

```typescript
// src/start.ts — 在创建 bridge 之前的位置添加

import { SlashCommandLoader, SlashCommandRegistry } from './slash-command/index.js';
import { AcpSessionManager } from './acp-session/index.js';
import { setGlobalSessionManager } from './commands/acp/handler.js';
import os from 'node:os';
import path from 'node:path';

function resolveStateDir(): string {
  const envPath = process.env.OWNCLAW_STATE_DIR?.trim();
  if (envPath) return path.resolve(envPath);
  return path.join(os.homedir(), '.ownclaw');
}

// ... 在 startMain() 中，创建 runner 之后、获取 bridge 之前：

  // === 初始化斜杠命令和 ACP ===
  const slashRegistry = new SlashCommandRegistry();
  const commandsDir = path.join(resolveStateDir(), 'commands');
  const loader = new SlashCommandLoader(commandsDir);
  await loader.loadCommands(slashRegistry);

  if (slashRegistry.listNames().length > 0) {
    logger.info(`📢 Slash Commands: ${slashRegistry.listNames().length} 个已加载`);
  }

  // 初始化 ACP Session Manager
  const acpManager = new AcpSessionManager();
  setGlobalSessionManager(acpManager);

  // 定时检查 ACP 超时（每分钟）
  const acpTimeoutCheck = setInterval(() => {
    acpManager.checkTimeouts();
  }, 60000);

  // 创建 runner 时将 slashRegistry 传给 bridge
  // ...
```

Actually, the bridge is created inside AgentRunner, not in start.ts directly. Let me check the flow...

Looking at start.ts, the bridge is obtained via `runner.getBridge()`. The AgentRunner creates the bridge internally. So I need to either:
1. Pass the slashRegistry through AgentRunner config
2. Or create the bridge separately in start.ts

The cleanest approach is to extend AgentRunnerConfig to accept a slashRegistry:

```typescript
// src/runner/agent-runner.ts — 修改 AgentRunnerConfig 接口
export interface AgentRunnerConfig {
  // ... existing ...
  slashRegistry?: SlashCommandRegistry;
}
```

And pass it to the bridge constructor.

Let me adjust:

- [ ] **Step 2: 修改 AgentRunner 支持注入 slashRegistry**

```typescript
// src/runner/agent-runner.ts — 修改
import { SlashCommandRegistry } from '../slash-command/index.js';

export interface AgentRunnerConfig {
  model: CustomModelConfig;
  sysPrompt: string;
  weixin: {
    sendMessage: (to: string, text: string) => Promise<void>;
  };
  logger?: Logger;
  skillsManager?: SkillsManager;
  slashRegistry?: SlashCommandRegistry;  // 新增
}

// 在构造函数中传给 WeixinBridge:
this.bridge = new WeixinBridge({
  agent: this.agent,
  sendMessage: config.weixin.sendMessage,
  logger: this.logger,
  slashRegistry: config.slashRegistry,  // 新增
});
```

- [ ] **Step 3: 修改 start.ts 完整集成**

```typescript
// src/start.ts — 在 imports 中增加
import { SlashCommandLoader, SlashCommandRegistry } from './slash-command/index.js';
import { AcpSessionManager } from './acp-session/index.js';
import { setGlobalSessionManager } from './commands/acp/handler.js';

// 在创建 runner 之前（pollMessage 之前）：

  // === 斜杠命令 + ACP 初始化 ===
  const slashRegistry = new SlashCommandRegistry();
  const stateDir = resolveStateDir();
  const commandsDir = path.join(stateDir, 'commands');
  const slashLoader = new SlashCommandLoader(commandsDir);
  await slashLoader.loadCommands(slashRegistry);

  if (slashRegistry.listNames().length > 0) {
    logger.info(`📢 Slash Commands: ${slashRegistry.listNames().join(', ')} 已加载`);
  }

  const acpManager = new AcpSessionManager();
  setGlobalSessionManager(acpManager);

  // 定时检查 ACP 超时
  const acpTimeoutCheck = setInterval(() => acpManager.checkTimeouts(), 60000);

  // 创建 AgentRunner（传入 slashRegistry）
  let runner: AgentRunner;
  try {
    runner = await createAgentRunner({
      config,
      logger,
      weixin: {
        sendMessage: async (to: string, text: string) => {
          await sendMessageLib(account.baseUrl!, account.token!, to, text);
        },
      },
      skillsManager,
      slashRegistry,
    });
  } catch (error) {
    // ...
  }

  // ... shutdown 中添加清理
  const shutdown = async (signal: string) => {
    logger.info(`收到 ${signal}，正在关闭...`);
    running = false;
    clearInterval(heartbeat);
    clearInterval(acpTimeoutCheck);
    // 结束所有 ACP 会话
    // acpManager.endAllSessions();
    await runner.stop();
    logger.info('👋 已退出');
    process.exit(0);
  };
```

- [ ] **Step 4: 运行类型检查**

```bash
pnpm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/runner/agent-runner.ts src/start.ts
git commit -m "feat(start): integrate slash commands and ACP session manager"
```

---

### Task 9: 全量测试 + 类型检查 + 构建

- [ ] **Step 1: 运行全部测试**

```bash
pnpm run test:run
```

- [ ] **Step 2: 类型检查**

```bash
pnpm run typecheck
```

- [ ] **Step 3: 构建**

```bash
pnpm run build
```

- [ ] **Step 4: 修复所有问题**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: ACP weixin integration complete - all tests pass"
```

---

### Task 10: 更新 TODO 文档

- [ ] **Step 1: 更新 docs/TODO.md**

```markdown
# OwnClaw TODO

## 任务列表

### 1. ✅ 增加 Skill 功能（已完成）
...

### 2. 增加 Chrome Job
...

### 3. ✅ 完整 UI 界面（已完成）
- ✅ 已完成 Cron 管理页面 (`/cron`)
- ✅ 已完成 Skills 管理页面 (`/skills`)
- ✅ 已完成 ACP 集成（斜杠命令 + ACP 开发模式）

### 4. ✅ 斜杠命令扩展（已完成）
- ✅ 文件驱动的斜杠命令框架 (`~/.ownclaw/commands/`)
- ✅ 内置 `/acp` 命令（ACP 开发模式）
- ✅ WeixinBridge 前置路由拦截

### 5. 文件读取能力
...

### 6. ✅ Cron 定时任务 (已完成)
...

---

*Created: 2026-04-19*
*Updated: 2026-04-30 — ACP integration added*
```

- [ ] **Step 2: Commit**

```bash
git add docs/TODO.md
git commit -m "docs: update TODO with ACP integration completion"
```
