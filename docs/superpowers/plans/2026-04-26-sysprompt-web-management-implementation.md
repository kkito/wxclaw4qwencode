# 系统提示词 Web 管理功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 OwnClaw 添加系统提示词的 Web 管理功能，支持在线编辑、持久化存储和通过重建 Agent 实例实现热更新。

**架构:** 新增 `src/prompt/` 模块（types/schema/store/manager），扩展 `AgentRunner` 和 `WeixinBridge` 支持运行时替换 Agent 实例，Web 服务器新增 `/api/prompt` API 和 `/prompt` 页面。

**Tech Stack:** TypeScript, Zod, Node.js fs, AgentScope Agent, Hono

---

## 文件变更清单

### 新建文件
- `src/prompt/types.ts` — 类型定义
- `src/prompt/schema.ts` — Zod 验证 schema
- `src/prompt/store.ts` — 文件存储（~/.ownclaw/sysprompt.md 读写）
- `src/prompt/manager.ts` — 高层管理（加载/保存）
- `src/prompt/index.ts` — 统一导出
- `src/web/views/prompt.tsx` — Web 编辑页面
- `tests/prompt/types.test.ts` — Schema 单元测试
- `tests/prompt/store.test.ts` — PromptStore 单元测试
- `tests/prompt/manager.test.ts` — PromptManager 单元测试
- `tests/prompt/api.test.ts` — Web API 测试

### 修改文件
- `src/bridge/weixin-bridge.ts` — 新增 `setAgent()` 方法
- `src/runner/agent-runner.ts` — 新增 `updateSysPrompt()` 方法
- `src/web/server.tsx` — 新增 `/api/prompt` 路由和 `/prompt` 页面路由，接收 `promptManager` 和 `agentRunner` 参数
- `src/web/index.ts` — 导出 PromptPage
- `src/web/views/index.tsx` — 首页添加系统提示词链接
- `src/web/views/skills.tsx` — 导航栏添加系统提示词链接
- `src/web/views/cron.tsx` — 导航栏添加系统提示词链接
- `src/start-web.ts` — 初始化 PromptManager 并传入 Web 服务器

---

### Task 1: Prompt 模块类型定义和 Schema

**Files:**
- Create: `src/prompt/types.ts`
- Create: `src/prompt/schema.ts`
- Create: `src/prompt/index.ts`
- Create: `tests/prompt/types.test.ts`

- [ ] **Step 1: Create types.ts**

```typescript
// src/prompt/types.ts

export interface PromptMeta {
  content: string;
  updatedAt?: Date;
}

export interface PromptManagerConfig {
  promptFile?: string;
  defaultPrompt?: string;
}
```

- [ ] **Step 2: Create schema.ts**

```typescript
// src/prompt/schema.ts

import { z } from 'zod';

export const PromptMetaSchema = z.object({
  content: z.string().min(1, '提示词不能为空'),
  updatedAt: z.date().optional(),
});

export const CreatePromptInputSchema = z.object({
  content: z.string().min(1, '提示词不能为空'),
});

export type CreatePromptInput = z.infer<typeof CreatePromptInputSchema>;
```

- [ ] **Step 3: Create index.ts**

```typescript
// src/prompt/index.ts

export * from './types.js';
export * from './schema.js';
export * from './store.js';
export * from './manager.js';
```

- [ ] **Step 4: Create tests/prompt/types.test.ts**

```typescript
// tests/prompt/types.test.ts

import { describe, it, expect } from 'vitest';
import { PromptMetaSchema, CreatePromptInputSchema } from '../../src/prompt/schema.js';

describe('Prompt schemas', () => {
  it('should validate valid PromptMeta', () => {
    const meta = {
      content: 'You are a helpful assistant.',
      updatedAt: new Date(),
    };
    const result = PromptMetaSchema.parse(meta);
    expect(result.content).toBe('You are a helpful assistant.');
  });

  it('should reject empty content', () => {
    expect(() => PromptMetaSchema.parse({ content: '' })).toThrow();
  });

  it('should validate CreatePromptInput', () => {
    const input = { content: 'Test prompt' };
    const result = CreatePromptInputSchema.parse(input);
    expect(result.content).toBe('Test prompt');
  });

  it('should reject empty CreatePromptInput', () => {
    expect(() => CreatePromptInputSchema.parse({ content: '' })).toThrow();
  });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm run test:run tests/prompt/types.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/prompt/types.ts src/prompt/schema.ts src/prompt/index.ts tests/prompt/types.test.ts
git commit -m "feat(prompt): add types and zod schemas for system prompt"
```

---

### Task 2: PromptStore 文件存储

**Files:**
- Create: `src/prompt/store.ts`
- Create: `tests/prompt/store.test.ts`

- [ ] **Step 1: Create store.ts**

```typescript
// src/prompt/store.ts

import fs from 'node:fs';
import path from 'node:path';
import { PromptMeta } from './types.js';

export class PromptStore {
  private promptFile: string;

  constructor(promptFile: string) {
    this.promptFile = promptFile;
  }

  /** 检查文件是否存在 */
  exists(): boolean {
    return fs.existsSync(this.promptFile);
  }

  /** 读取系统提示词 */
  load(): PromptMeta {
    if (!this.exists()) {
      return { content: '' };
    }

    const raw = fs.readFileSync(this.promptFile, 'utf-8');
    return this.parseMarkdown(raw);
  }

  /** 保存系统提示词 */
  save(content: string): PromptMeta {
    const updatedAt = new Date();
    const markdown = this.toMarkdown(content, updatedAt);

    // 确保目录存在
    const dir = path.dirname(this.promptFile);
    fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(this.promptFile, markdown, 'utf-8');

    return { content, updatedAt };
  }

  /** 解析 Markdown 文件，提取 frontmatter 和内容 */
  private parseMarkdown(raw: string): PromptMeta {
    const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    if (!match) {
      return { content: raw.trim() };
    }

    const frontmatter = match[1];
    const body = match[2];

    let updatedAt: Date | undefined;
    const updatedAtMatch = frontmatter.match(/updatedAt:\s*(.+)/);
    if (updatedAtMatch) {
      updatedAt = new Date(updatedAtMatch[1].trim());
    }

    return { content: body.trim(), updatedAt };
  }

  /** 将内容转换为 Markdown 格式 */
  private toMarkdown(content: string, updatedAt: Date): string {
    return `---
updatedAt: ${updatedAt.toISOString()}
---

${content}`;
  }
}
```

- [ ] **Step 2: Create tests/prompt/store.test.ts**

```typescript
// tests/prompt/store.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PromptStore } from '../../src/prompt/store.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('PromptStore', () => {
  let store: PromptStore;
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `ownclaw-prompt-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    testFile = path.join(testDir, 'sysprompt.md');
    store = new PromptStore(testFile);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('exists', () => {
    it('should return false when file does not exist', () => {
      expect(store.exists()).toBe(false);
    });

    it('should return true when file exists', () => {
      fs.writeFileSync(testFile, 'test content');
      expect(store.exists()).toBe(true);
    });
  });

  describe('load', () => {
    it('should return empty content when file does not exist', () => {
      const meta = store.load();
      expect(meta.content).toBe('');
      expect(meta.updatedAt).toBeUndefined();
    });

    it('should load content from markdown file with frontmatter', () => {
      const content = `---
updatedAt: 2026-04-26T10:30:00.000Z
---

你是一个友好的 AI 助手。`;
      fs.writeFileSync(testFile, content);

      const meta = store.load();
      expect(meta.content).toBe('你是一个友好的 AI 助手。');
      expect(meta.updatedAt).toEqual(new Date('2026-04-26T10:30:00.000Z'));
    });

    it('should load content from plain markdown file without frontmatter', () => {
      fs.writeFileSync(testFile, 'You are a helpful assistant.');

      const meta = store.load();
      expect(meta.content).toBe('You are a helpful assistant.');
      expect(meta.updatedAt).toBeUndefined();
    });
  });

  describe('save', () => {
    it('should save content to markdown file with frontmatter', () => {
      const meta = store.save('You are a helpful assistant.');

      expect(meta.content).toBe('You are a helpful assistant.');
      expect(meta.updatedAt).toBeDefined();

      const fileContent = fs.readFileSync(testFile, 'utf-8');
      expect(fileContent).toContain('---');
      expect(fileContent).toContain('updatedAt:');
      expect(fileContent).toContain('You are a helpful assistant.');
    });

    it('should overwrite existing file', () => {
      store.save('Old prompt');
      const meta = store.save('New prompt');
      expect(meta.content).toBe('New prompt');

      const loaded = store.load();
      expect(loaded.content).toBe('New prompt');
    });
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm run test:run tests/prompt/store.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/prompt/store.ts tests/prompt/store.test.ts
git commit -m "feat(prompt): add PromptStore for file-based persist"
```

---

### Task 3: PromptManager 高层管理

**Files:**
- Create: `src/prompt/manager.ts`
- Create: `tests/prompt/manager.test.ts`

- [ ] **Step 1: Create manager.ts**

```typescript
// src/prompt/manager.ts

import { PromptMeta, PromptManagerConfig } from './types.js';
import { PromptStore } from './store.js';

const DEFAULT_PROMPT = '你是一个友好的 AI 助手。';

export class PromptManager {
  private store: PromptStore;
  private defaultPrompt: string;
  private currentContent: string = '';

  constructor(config: PromptManagerConfig = {}) {
    this.defaultPrompt = config.defaultPrompt || DEFAULT_PROMPT;
    this.store = new PromptStore(config.promptFile || getDefaultPromptFile());
  }

  /** 加载当前提示词（优先文件，否则默认） */
  loadCurrent(): string {
    if (this.store.exists()) {
      const meta = this.store.load();
      this.currentContent = meta.content || this.defaultPrompt;
    } else {
      this.currentContent = this.defaultPrompt;
    }
    return this.currentContent;
  }

  /** 保存并返回元数据 */
  save(content: string): PromptMeta {
    const meta = this.store.save(content);
    this.currentContent = content;
    return meta;
  }

  /** 获取当前提示词 */
  getCurrent(): string {
    return this.currentContent;
  }
}

function getDefaultPromptFile(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
  return `${homeDir}/.ownclaw/sysprompt.md`;
}
```

- [ ] **Step 2: Create tests/prompt/manager.test.ts**

```typescript
// tests/prompt/manager.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PromptManager } from '../../src/prompt/manager.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('PromptManager', () => {
  let manager: PromptManager;
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `ownclaw-prompt-mgr-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    testFile = path.join(testDir, 'sysprompt.md');
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('loadCurrent', () => {
    it('should return default prompt when file does not exist', () => {
      manager = new PromptManager({
        promptFile: testFile,
        defaultPrompt: 'Default prompt',
      });

      const content = manager.loadCurrent();
      expect(content).toBe('Default prompt');
    });

    it('should return file content when file exists', () => {
      fs.writeFileSync(testFile, `---
updatedAt: 2026-04-26T10:30:00.000Z
---

Custom prompt from file`);

      manager = new PromptManager({
        promptFile: testFile,
        defaultPrompt: 'Default prompt',
      });

      const content = manager.loadCurrent();
      expect(content).toBe('Custom prompt from file');
    });
  });

  describe('save', () => {
    it('should save content and return metadata', () => {
      manager = new PromptManager({
        promptFile: testFile,
        defaultPrompt: 'Default prompt',
      });

      const meta = manager.save('New prompt');
      expect(meta.content).toBe('New prompt');
      expect(meta.updatedAt).toBeDefined();
    });
  });

  describe('getCurrent', () => {
    it('should return the last-loaded content', () => {
      manager = new PromptManager({
        promptFile: testFile,
        defaultPrompt: 'Default prompt',
      });

      manager.loadCurrent();
      expect(manager.getCurrent()).toBe('Default prompt');

      manager.save('Updated prompt');
      manager.loadCurrent();
      expect(manager.getCurrent()).toBe('Updated prompt');
    });
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm run test:run tests/prompt/manager.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/prompt/manager.ts tests/prompt/manager.test.ts
git commit -m "feat(prompt): add PromptManager for high-level management"
```

---

### Task 4: WeixinBridge 新增 setAgent 方法

**Files:**
- Modify: `src/bridge/weixin-bridge.ts`
- Modify: `tests/bridge/weixin-bridge.test.ts`

- [ ] **Step 1: Add setAgent method to WeixinBridge**

In `src/bridge/weixin-bridge.ts`, after the constructor, add:

```typescript
  /** 更新持有的 Agent 实例 */
  setAgent(agent: Agent): void {
    this.agent = agent;
  }
```

- [ ] **Step 2: Add test for setAgent in weixin-bridge.test.ts**

Add to `tests/bridge/weixin-bridge.test.ts`, before the last `});`:

```typescript
  describe('setAgent', () => {
    it('should replace the agent instance', () => {
      const newMockAgent: any = {
        reply: vi.fn().mockResolvedValue(
          createMsg({
            name: 'assistant',
            role: 'assistant',
            content: [{ type: 'text' as const, text: 'New agent reply', id: '2' }],
          })
        ),
      };

      bridge.setAgent(newMockAgent);

      const weixinMsg = {
        from_user_id: 'user456',
        item_list: [{ type: 1, content: 'Test' }],
      };

      // Clear previous calls
      mockSendMessage.mockClear();

      // Now handle a message with the new agent
      return bridge.handleMessage(weixinMsg).then(() => {
        expect(newMockAgent.reply).toHaveBeenCalled();
        expect(mockSendMessage).toHaveBeenCalledWith('user456', 'New agent reply');
      });
    });
  });
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm run test:run tests/bridge/weixin-bridge.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/bridge/weixin-bridge.ts tests/bridge/weixin-bridge.test.ts
git commit -m "feat(bridge): add setAgent method for runtime agent replacement"
```

---

### Task 5: AgentRunner 新增 updateSysPrompt 方法

**Files:**
- Modify: `src/runner/agent-runner.ts`
- Modify: `tests/runner/agent-runner.test.ts`

- [ ] **Step 1: Modify AgentRunner to store model config and add updateSysPrompt**

In `src/runner/agent-runner.ts`, modify the class:

```typescript
export class AgentRunner {
  private agent: Agent;
  private bridge: WeixinBridge;
  private logger: Logger;
  private modelConfig: CustomModelConfig;  // Add this

  constructor(config: AgentRunnerConfig) {
    this.logger = config.logger || getGlobalLogger();
    this.modelConfig = config.model;  // Add this line

    // 创建模型客户端
    const model = new CustomModel(config.model);

    // ... rest of constructor unchanged
```

After `getBridge()`, add:

```typescript
  /** 更新系统提示词并重建 Agent */
  updateSysPrompt(newSysPrompt: string): void {
    // Create new model
    const model = new CustomModel(this.modelConfig);

    // Create new Toolkit (same config as original)
    const toolkit = new Toolkit({ builtInSkillTool: false });

    // Create new Agent with new sysPrompt
    const newAgent = new Agent({
      name: 'weixin-assistant',
      sysPrompt: newSysPrompt,
      model,
      toolkit,
      maxIters: 10,
    });

    // Update Bridge's agent reference
    this.bridge.setAgent(newAgent);

    // Update internal agent reference
    (this as any).agent = newAgent;
  }
```

- [ ] **Step 2: Add test for updateSysPrompt**

Add to `tests/runner/agent-runner.test.ts`:

```typescript
describe('AgentRunner.updateSysPrompt', () => {
  let runner: AgentRunner;
  let mockSendMessage: ReturnType<typeof vi.fn>;
  let mockLogger: Logger;

  beforeEach(() => {
    mockSendMessage = vi.fn().mockResolvedValue(undefined);
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    runner = new AgentRunner({
      model: {
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'test-key',
        modelName: 'gpt-4o',
      },
      sysPrompt: 'Original prompt',
      weixin: {
        sendMessage: mockSendMessage,
      },
      logger: mockLogger,
    });
  });

  it('should update sysPrompt and rebuild agent', () => {
    const bridge = runner.getBridge();
    const originalAgent = (bridge as any).agent;

    runner.updateSysPrompt('New prompt');

    const newAgent = (bridge as any).agent;
    expect(newAgent).not.toBe(originalAgent);
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm run test:run tests/runner/agent-runner.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/runner/agent-runner.ts tests/runner/agent-runner.test.ts
git commit -m "feat(runner): add updateSysPrompt for hot-reloading agent"
```

---

### Task 6: Web API 路由

**Files:**
- Modify: `src/web/server.tsx`
- Create: `tests/prompt/api.test.ts`

- [ ] **Step 1: Modify WebServerConfig and add routes in server.tsx**

In `src/web/server.tsx`, add import at top:

```typescript
import { PromptManager } from '../prompt/index.js';
```

Modify `WebServerConfig`:

```typescript
export interface WebServerConfig {
  port: number;
  host?: string;
  cronManager?: CronManager;
  skillsManager?: SkillsManager;
  promptManager?: PromptManager;
  agentRunner?: { updateSysPrompt: (content: string) => void };
}
```

Add Prompt API routes after the Skills API section (before the page routes):

```typescript
  // ===== Prompt API 路由 =====
  if (config.promptManager) {
    const promptManager = config.promptManager;

    // GET /api/prompt - 获取当前系统提示词
    app.get('/api/prompt', (c) => {
      const content = promptManager.getCurrent();
      return c.json({ content });
    });

    // PUT /api/prompt - 更新系统提示词
    app.put('/api/prompt', async (c) => {
      try {
        const body = await c.req.json<{ content: string }>();
        if (!body.content || body.content.trim().length === 0) {
          return c.json({ error: '提示词不能为空' }, 400);
        }

        const meta = promptManager.save(body.content);

        // 触发 Agent 热更新
        if (config.agentRunner) {
          config.agentRunner.updateSysPrompt(body.content);
        }

        return c.json({ content: meta.content, updatedAt: meta.updatedAt });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Invalid request';
        return c.json({ error: message }, 400);
      }
    });
  }
```

- [ ] **Step 2: Create tests/prompt/api.test.ts**

```typescript
// tests/prompt/api.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createWebServer, WebServerConfig } from '../../src/web/server.js';
import { PromptManager } from '../../src/prompt/manager.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Prompt API', () => {
  let promptManager: PromptManager;
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `ownclaw-api-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    testFile = path.join(testDir, 'sysprompt.md');

    promptManager = new PromptManager({
      promptFile: testFile,
      defaultPrompt: 'Default prompt',
    });
    promptManager.loadCurrent();
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('GET /api/prompt', () => {
    it('should return current prompt content', async () => {
      const config: WebServerConfig = {
        port: 0,
        promptManager,
      };
      const { app, server } = createWebServer(config);

      const res = await app.request('/api/prompt');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.content).toBe('Default prompt');

      server.close();
    });
  });

  describe('PUT /api/prompt', () => {
    it('should update prompt content', async () => {
      const config: WebServerConfig = {
        port: 0,
        promptManager,
      };
      const { app, server } = createWebServer(config);

      const res = await app.request('/api/prompt', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'New system prompt' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.content).toBe('New system prompt');

      // Verify file was saved
      const loaded = promptManager.loadCurrent();
      expect(loaded).toBe('New system prompt');

      server.close();
    });

    it('should return 400 for empty content', async () => {
      const config: WebServerConfig = {
        port: 0,
        promptManager,
      };
      const { app, server } = createWebServer(config);

      const res = await app.request('/api/prompt', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '' }),
      });

      expect(res.status).toBe(400);

      server.close();
    });

    it('should call agentRunner.updateSysPrompt when provided', async () => {
      const mockUpdateSysPrompt = vi.fn();
      const config: WebServerConfig = {
        port: 0,
        promptManager,
        agentRunner: { updateSysPrompt: mockUpdateSysPrompt },
      };
      const { app, server } = createWebServer(config);

      await app.request('/api/prompt', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hot reload test' }),
      });

      expect(mockUpdateSysPrompt).toHaveBeenCalledWith('Hot reload test');

      server.close();
    });
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm run test:run tests/prompt/api.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/web/server.tsx tests/prompt/api.test.ts
git commit -m "feat(web): add /api/prompt GET/PUT routes"
```

---

### Task 7: Web 页面 — /prompt

**Files:**
- Create: `src/web/views/prompt.tsx`
- Modify: `src/web/server.tsx`
- Modify: `src/web/views/index.tsx`
- Modify: `src/web/views/skills.tsx`
- Modify: `src/web/views/cron.tsx`

- [ ] **Step 1: Create src/web/views/prompt.tsx**

```typescript
// src/web/views/prompt.tsx

import type { FC } from 'hono/jsx';

export const PromptPage: FC = () => {
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>OwnClaw - 系统提示词</title>
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
              }
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background: hsl(var(--background));
                color: hsl(var(--foreground));
                line-height: 1.6;
              }
              .container { max-width: 900px; margin: 0 auto; padding: 2rem; }
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
              .form-group textarea {
                width: 100%;
                padding: 0.5rem;
                border: 1px solid hsl(var(--border));
                border-radius: var(--radius);
                font-family: inherit;
                min-height: 300px;
                resize: vertical;
              }
              .nav-links {
                display: flex;
                gap: 1rem;
                margin-bottom: 1rem;
              }
              .nav-links a {
                color: #667eea;
                text-decoration: none;
              }
              .nav-links a:hover { text-decoration: underline; }
              .status {
                margin-top: 1rem;
                padding: 0.75rem;
                border-radius: var(--radius);
                display: none;
              }
              .status.success {
                display: block;
                background: hsl(var(--success) / 0.1);
                color: hsl(var(--success));
              }
              .status.error {
                display: block;
                background: hsl(0 84% 60% / 0.1);
                color: hsl(0 84% 60%);
              }
            `,
          }}
        />
      </head>
      <body>
        <div class="container">
          <div class="nav-links">
            <a href="/">🏠 首页</a>
            <a href="/cron">🕐 Cron</a>
            <a href="/skills">🎯 Skills</a>
            <a href="/prompt">💬 系统提示词</a>
          </div>
          <div class="header">
            <h1>💬 系统提示词</h1>
          </div>

          <div class="card">
            <div class="form-group">
              <label for="prompt-content">系统提示词内容</label>
              <textarea id="prompt-content" placeholder="输入系统提示词..."></textarea>
            </div>
            <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
              <button class="btn btn-primary" id="save-btn" onclick="savePrompt()">💾 保存</button>
            </div>
            <div id="status" class="status"></div>
          </div>
        </div>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              async function loadPrompt() {
                try {
                  const res = await fetch('/api/prompt');
                  const data = await res.json();
                  document.getElementById('prompt-content').value = data.content || '';
                } catch (err) {
                  showStatus('加载失败: ' + err.message, 'error');
                }
              }

              async function savePrompt() {
                const content = document.getElementById('prompt-content').value;
                const btn = document.getElementById('save-btn');
                btn.disabled = true;
                btn.textContent = '保存中...';

                try {
                  const res = await fetch('/api/prompt', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content }),
                  });

                  const data = await res.json();

                  if (!res.ok) {
                    showStatus('保存失败: ' + data.error, 'error');
                  } else {
                    showStatus('✅ 保存成功，系统提示词已更新', 'success');
                  }
                } catch (err) {
                  showStatus('保存失败: ' + err.message, 'error');
                } finally {
                  btn.disabled = false;
                  btn.textContent = '💾 保存';
                }
              }

              function showStatus(message, type) {
                const status = document.getElementById('status');
                status.textContent = message;
                status.className = 'status ' + type;
                setTimeout(() => { status.className = 'status'; }, 3000);
              }

              loadPrompt();
            `,
          }}
        />
      </body>
    </html>
  );
};
```

- [ ] **Step 2: Add route in server.tsx**

In `src/web/server.tsx`, add import at top:

```typescript
import { PromptPage } from './views/prompt.js';
```

After the Skills page route, add:

```typescript
  // Prompt 页面路由
  app.get('/prompt', (c) => {
    return c.html(<PromptPage />);
  });
```

- [ ] **Step 3: Add navigation link to index.tsx**

In `src/web/views/index.tsx`, add a card in the content section:

```html
            <div class="card">
              <h2>系统提示词</h2>
              <p>
                <a href="/prompt" style="color: #667eea;">编辑系统提示词</a> — 在线修改 AI 助手的系统提示词，保存后立即生效。
              </p>
            </div>
```

- [ ] **Step 4: Add navigation to skills.tsx**

In `src/web/views/skills.tsx`, add nav-links at top of body (before `<div class="header">`):

```html
          <div class="nav-links">
            <a href="/">🏠 首页</a>
            <a href="/cron">🕐 Cron</a>
            <a href="/skills">🎯 Skills</a>
            <a href="/prompt">💬 系统提示词</a>
          </div>
```

Add the CSS style to the style block (find the existing styles and add):

```css
.nav-links {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}
.nav-links a {
  color: #667eea;
  text-decoration: none;
}
.nav-links a:hover { text-decoration: underline; }
```

- [ ] **Step 5: Add navigation to cron.tsx**

In `src/web/views/cron.tsx`, add nav-links at top of body (before `<div class="header">`):

```html
          <div class="nav-links">
            <a href="/">🏠 首页</a>
            <a href="/cron">🕐 Cron</a>
            <a href="/skills">🎯 Skills</a>
            <a href="/prompt">💬 系统提示词</a>
          </div>
```

Add the CSS style to the style block:

```css
.nav-links {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}
.nav-links a {
  color: #667eea;
  text-decoration: none;
}
.nav-links a:hover { text-decoration: underline; }
```

- [ ] **Step 6: Commit**

```bash
git add src/web/views/prompt.tsx src/web/server.tsx src/web/views/index.tsx src/web/views/skills.tsx src/web/views/cron.tsx
git commit -m "feat(web): add /prompt page and navigation links"
```

---

### Task 8: Web 服务器集成 PromptManager

**Files:**
- Modify: `src/web/index.ts`
- Modify: `src/start-web.ts`

- [ ] **Step 1: Modify src/web/index.ts**

Read current content first, then add export:

```typescript
// src/web/index.ts

export * from './server.js';
export * from './views/index.js';
export * from './views/cron.js';
export * from './views/skills.js';
export * from './views/prompt.js';
```

- [ ] **Step 2: Modify src/start-web.ts**

Add import at top:

```typescript
import { PromptManager } from './prompt/index.js';
```

In `startWebMain()`, after skillsManager initialization and before console.log:

```typescript
  // 初始化 PromptManager
  const promptManager = new PromptManager();
  const currentPrompt = promptManager.loadCurrent();
```

Update console log:

```typescript
  console.log(`\n🚀 正在启动 OwnClaw Web 服务器...`);
  console.log(`🌐 地址: http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
  console.log(`📡 端口: ${config.port}`);
  console.log(`🕐 Cron 任务: ${cronManager.scheduledCount} 个已调度`);
  console.log(`🎯 Skills: ${skillsCount} 个已加载`);
  console.log(`📂 Skills 目录: ~/.ownclaw/skills/`);
  console.log(`💬 系统提示词: 已加载 (${currentPrompt.length} 字符)\n`);
```

Pass to createWebServer:

```typescript
  const { app, server } = createWebServer({
    ...config,
    cronManager,
    skillsManager,
    promptManager,
  });
```

- [ ] **Step 3: Commit**

```bash
git add src/web/index.ts src/start-web.ts
git commit -m "feat(start): integrate PromptManager into web startup"
```

---

### Task 9: 完整测试与类型检查

- [ ] **Step 1: Run typecheck**

Run: `pnpm run typecheck`
Expected: No errors

If there are errors, fix them before proceeding.

- [ ] **Step 2: Run all tests**

Run: `pnpm run test:run`
Expected: All tests pass

If any test fails, investigate and fix before proceeding.

- [ ] **Step 3: Build**

Run: `pnpm run build`
Expected: Successful build

- [ ] **Step 4: Final commit if needed**

```bash
git status
# Verify all changes are committed
```
