# Skills 功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Agent Skills 的文件管理、Web CRUD API、Web 管理页面，并集成到 Agent 和 Web 服务器中。

**Architecture:** 参考 Cron 模块的分层模式，创建 `src/skills/` 模块（types → schema → store → manager → index），Web 服务器注入 SkillsManager 注册 API，AgentRunner 使用 SkillsManager 创建 Toolkit。

**Tech Stack:** TypeScript, Zod, Node.js fs, AgentScope Toolkit, Hono

---

### Task 1: 创建 Skills 类型定义

**Files:**
- Create: `src/skills/types.ts`

- [ ] **Step 1: 编写类型定义**

```typescript
// src/skills/types.ts

/**
 * Skill 元数据（从 SKILL.md 的 YAML frontmatter 读取）
 */
export interface SkillMeta {
  /** Skill 唯一标识符（目录名） */
  id: string;
  /** Skill 名称（frontmatter 中的 name 字段） */
  name: string;
  /** Skill 描述（frontmatter 中的 description 字段） */
  description: string;
  /** SKILL.md 的完整内容 */
  content: string;
  /** 目录下的文件列表 */
  files: string[];
}

/**
 * 创建 Skill 的输入
 */
export interface CreateSkillInput {
  id: string;
  skillMd: string;
}

/**
 * 更新 Skill 的输入
 */
export interface UpdateSkillInput {
  skillMd: string;
}

/**
 * SkillsManager 配置
 */
export interface SkillsManagerConfig {
  skillsDir?: string;
}
```

- [ ] **Step 2: 提交**

```bash
git add src/skills/types.ts
git commit -m "feat(skills): add type definitions"
```

---

### Task 2: 创建 Skills Zod Schema

**Files:**
- Create: `src/skills/schema.ts`

- [ ] **Step 1: 编写 Schema**

```typescript
// src/skills/schema.ts

import { z } from 'zod';

export const SkillMetaSchema = z.object({
  id: z.string().min(1, 'ID cannot be empty'),
  name: z.string().default(''),
  description: z.string().default(''),
  content: z.string().default(''),
  files: z.array(z.string()).default([]),
});

export const CreateSkillInputSchema = z.object({
  id: z.string().min(1, 'ID cannot be empty').regex(/^[a-z0-9_-]+$/i, 'ID can only contain letters, numbers, hyphens and underscores'),
  skillMd: z.string().min(1, 'SKILL.md content cannot be empty'),
});

export const UpdateSkillInputSchema = z.object({
  skillMd: z.string().min(1, 'SKILL.md content cannot be empty'),
});

export type SkillMetaInput = z.input<typeof SkillMetaSchema>;
export type SkillMetaOutput = z.output<typeof SkillMetaSchema>;
export type CreateSkillInputType = z.input<typeof CreateSkillInputSchema>;
export type UpdateSkillInputType = z.input<typeof UpdateSkillInputSchema>;
```

- [ ] **Step 2: 提交**

```bash
git add src/skills/schema.ts
git commit -m "feat(skills): add Zod validation schemas"
```

---

### Task 3: 创建 SkillsStore 文件存储

**Files:**
- Create: `src/skills/store.ts`

- [ ] **Step 1: 编写 SkillsStore**

```typescript
// src/skills/store.ts

import fs from 'node:fs';
import path from 'node:path';
import { SkillMeta } from './types.js';

/**
 * 解析 SKILL.md 的 YAML frontmatter
 * 简易实现，不依赖 gray-matter（Toolkit 内部用了，但我们保持轻量）
 */
function parseFrontmatter(content: string): { name: string; description: string; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    return { name: '', description: '', body: content };
  }

  const frontmatter = match[1];
  const body = match[2];

  const nameMatch = frontmatter.match(/name:\s*(.+)/);
  const descMatch = frontmatter.match(/description:\s*(.+)/);

  return {
    name: nameMatch ? nameMatch[1].trim() : '',
    description: descMatch ? descMatch[1].trim() : '',
    body,
  };
}

export class SkillsStore {
  private skillsDir: string;

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
    // 确保目录存在
    fs.mkdirSync(this.skillsDir, { recursive: true });
  }

  /** 获取 Skill 目录的绝对路径 */
  private getSkillDir(id: string): string {
    return path.resolve(this.skillsDir, id);
  }

  /** 获取 SKILL.md 路径 */
  private getSkillMdPath(id: string): string {
    return path.join(this.getSkillDir(id), 'SKILL.md');
  }

  /** 列出所有 Skills（读取 frontmatter） */
  listSkills(): SkillMeta[] {
    if (!fs.existsSync(this.skillsDir)) {
      return [];
    }

    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
    const skills: SkillMeta[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const id = entry.name;
      const skillMdPath = this.getSkillMdPath(id);

      if (!fs.existsSync(skillMdPath)) continue;

      try {
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        const { name, description } = parseFrontmatter(content);
        const files = fs.readdirSync(this.getSkillDir(id)).filter(f => f !== 'SKILL.md');

        skills.push({
          id,
          name,
          description,
          content,
          files,
        });
      } catch {
        // 跳过无法读取的目录
        continue;
      }
    }

    return skills;
  }

  /** 获取指定 Skill 的元数据 */
  getSkill(id: string): SkillMeta | undefined {
    const skillMdPath = this.getSkillMdPath(id);
    if (!fs.existsSync(skillMdPath)) {
      return undefined;
    }

    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const { name, description } = parseFrontmatter(content);
    const files = fs.readdirSync(this.getSkillDir(id)).filter(f => f !== 'SKILL.md');

    return { id, name, description, content, files };
  }

  /** 列出 Skill 目录下的文件 */
  getSkillFiles(id: string): string[] {
    const dir = this.getSkillDir(id);
    if (!fs.existsSync(dir)) {
      throw new Error(`Skill '${id}' not found`);
    }
    return fs.readdirSync(dir).filter(f => f !== 'SKILL.md');
  }

  /** 读取 Skill 目录下指定文件的内容 */
  getSkillFile(id: string, filename: string): string {
    const filePath = path.join(this.getSkillDir(id), filename);
    const dir = this.getSkillDir(id);

    // 安全检查：防止路径遍历攻击
    if (!filePath.startsWith(dir)) {
      throw new Error('Invalid file path');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File '${filename}' not found in skill '${id}'`);
    }

    return fs.readFileSync(filePath, 'utf-8');
  }

  /** 创建新 Skill */
  createSkill(id: string, skillMd: string): SkillMeta {
    const dir = this.getSkillDir(id);

    if (fs.existsSync(dir)) {
      throw new Error(`Skill '${id}' already exists`);
    }

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.getSkillMdPath(id), skillMd, 'utf-8');

    return {
      id,
      ...parseFrontmatter(skillMd),
      content: skillMd,
      files: [],
    };
  }

  /** 更新 Skill 的 SKILL.md */
  updateSkill(id: string, skillMd: string): SkillMeta {
    const dir = this.getSkillDir(id);
    if (!fs.existsSync(dir)) {
      throw new Error(`Skill '${id}' not found`);
    }

    fs.writeFileSync(this.getSkillMdPath(id), skillMd, 'utf-8');

    const files = fs.readdirSync(dir).filter(f => f !== 'SKILL.md');
    return {
      id,
      ...parseFrontmatter(skillMd),
      content: skillMd,
      files,
    };
  }

  /** 删除整个 Skill 目录 */
  deleteSkill(id: string): void {
    const dir = this.getSkillDir(id);
    if (!fs.existsSync(dir)) {
      throw new Error(`Skill '${id}' not found`);
    }

    fs.rmSync(dir, { recursive: true, force: true });
  }

  /** 上传/覆盖 Skill 目录下的文件 */
  uploadFile(id: string, filename: string, content: string): void {
    const dir = this.getSkillDir(id);
    if (!fs.existsSync(dir)) {
      throw new Error(`Skill '${id}' not found`);
    }

    // 不允许覆盖 SKILL.md（使用 updateSkill）
    if (filename === 'SKILL.md') {
      throw new Error('Use updateSkill to update SKILL.md');
    }

    const filePath = path.join(dir, filename);
    // 安全检查
    if (!filePath.startsWith(dir)) {
      throw new Error('Invalid file path');
    }

    fs.writeFileSync(filePath, content, 'utf-8');
  }

  /** 删除 Skill 目录下的文件 */
  deleteFile(id: string, filename: string): void {
    const dir = this.getSkillDir(id);
    if (!fs.existsSync(dir)) {
      throw new Error(`Skill '${id}' not found`);
    }

    if (filename === 'SKILL.md') {
      throw new Error('Cannot delete SKILL.md, use deleteSkill instead');
    }

    const filePath = path.join(dir, filename);
    if (!filePath.startsWith(dir)) {
      throw new Error('Invalid file path');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File '${filename}' not found`);
    }

    fs.unlinkSync(filePath);
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/skills/store.ts
git commit -m "feat(skills): add SkillsStore for file-based persistence"
```

---

### Task 4: 创建 SkillsManager 管理器

**Files:**
- Create: `src/skills/manager.ts`

- [ ] **Step 1: 编写 SkillsManager**

```typescript
// src/skills/manager.ts

import { Toolkit } from '@agentscope-ai/agentscope';
import { SkillsStore } from './store.js';
import { SkillMeta, SkillsManagerConfig } from './types.js';

export class SkillsManager {
  private store: SkillsStore;
  private skillsDir: string;

  constructor(config: SkillsManagerConfig = {}) {
    this.skillsDir = config.skillsDir || getDefaultSkillsDir();
    this.store = new SkillsStore(this.skillsDir);
  }

  /** ===== CRUD ===== */

  listSkills(): SkillMeta[] {
    return this.store.listSkills();
  }

  getSkill(id: string): SkillMeta | undefined {
    return this.store.getSkill(id);
  }

  getSkillFiles(id: string): string[] {
    return this.store.getSkillFiles(id);
  }

  getSkillFile(id: string, filename: string): string {
    return this.store.getSkillFile(id, filename);
  }

  createSkill(id: string, skillMd: string): SkillMeta {
    return this.store.createSkill(id, skillMd);
  }

  updateSkill(id: string, skillMd: string): SkillMeta {
    return this.store.updateSkill(id, skillMd);
  }

  deleteSkill(id: string): void {
    this.store.deleteSkill(id);
  }

  uploadFile(id: string, filename: string, content: string): void {
    this.store.uploadFile(id, filename, content);
  }

  deleteFile(id: string, filename: string): void {
    this.store.deleteFile(id, filename);
  }

  /** ===== Toolkit 集成 ===== */

  /**
   * 创建配置了 skillDirs 的 Toolkit 实例
   * Toolkit 构造函数会自动：
   * 1. 扫描 skillDirs 下的子目录作为 Skills
   * 2. 读取每个子目录的 SKILL.md
   * 3. 生成 Skills 提示词注入到 Agent
   * 4. 注册内置 Skill 工具
   */
  createToolkit(): Toolkit {
    return new Toolkit({
      skillDirs: [this.skillsDir],
      builtInSkillTool: true,  // 启用内置 Skill 工具
    });
  }
}

function getDefaultSkillsDir(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
  return `${homeDir}/.ownclaw/skills`;
}
```

- [ ] **Step 2: 提交**

```bash
git add src/skills/manager.ts
git commit -m "feat(skills): add SkillsManager with CRUD and Toolkit integration"
```

---

### Task 5: 创建 Skills 模块统一导出

**Files:**
- Create: `src/skills/index.ts`

- [ ] **Step 1: 编写导出**

```typescript
// src/skills/index.ts

export { SkillsStore } from './store.js';
export { SkillsManager } from './manager.js';
export { SkillMetaSchema, CreateSkillInputSchema, UpdateSkillInputSchema } from './schema.js';
export type { SkillMeta, CreateSkillInput, UpdateSkillInput, SkillsManagerConfig } from './types.js';
```

- [ ] **Step 2: 提交**

```bash
git add src/skills/index.ts
git commit -m "feat(skills): add unified module exports"
```

---

### Task 6: 编写 Skills 模块单元测试

**Files:**
- Create: `tests/skills/store.test.ts`
- Create: `tests/skills/manager.test.ts`

- [ ] **Step 1: 编写 Store 测试**

```typescript
// tests/skills/store.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SkillsStore } from '../../src/skills/store.js';

describe('SkillsStore', () => {
  let store: SkillsStore;
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-test-'));
    store = new SkillsStore(testDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  const SKILL_MD = `---
name: Test Skill
description: A test skill
---

# Test Skill

This is a test skill.
`;

  it('should create and list skills', () => {
    const result = store.createSkill('test-skill', SKILL_MD);
    expect(result.id).toBe('test-skill');
    expect(result.name).toBe('Test Skill');

    const skills = store.listSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe('test-skill');
  });

  it('should get a skill by id', () => {
    store.createSkill('test-skill', SKILL_MD);
    const skill = store.getSkill('test-skill');
    expect(skill).toBeDefined();
    expect(skill!.name).toBe('Test Skill');
  });

  it('should return undefined for non-existent skill', () => {
    expect(store.getSkill('nonexistent')).toBeUndefined();
  });

  it('should update a skill', () => {
    store.createSkill('test-skill', SKILL_MD);
    const updatedMd = `---
name: Updated Skill
description: Updated description
---

Updated content.
`;
    const result = store.updateSkill('test-skill', updatedMd);
    expect(result.name).toBe('Updated Skill');
    expect(result.description).toBe('Updated description');
  });

  it('should delete a skill', () => {
    store.createSkill('test-skill', SKILL_MD);
    store.deleteSkill('test-skill');
    expect(store.listSkills()).toHaveLength(0);
  });

  it('should throw on duplicate create', () => {
    store.createSkill('test-skill', SKILL_MD);
    expect(() => store.createSkill('test-skill', SKILL_MD)).toThrow('already exists');
  });

  it('should throw on update non-existent', () => {
    expect(() => store.updateSkill('nonexistent', SKILL_MD)).toThrow('not found');
  });

  it('should upload and read a file', () => {
    store.createSkill('test-skill', SKILL_MD);
    store.uploadFile('test-skill', 'schema.sql', 'CREATE TABLE test (id INT);');
    const content = store.getSkillFile('test-skill', 'schema.sql');
    expect(content).toContain('CREATE TABLE');

    const files = store.getSkillFiles('test-skill');
    expect(files).toContain('schema.sql');
  });

  it('should not allow overwriting SKILL.md via uploadFile', () => {
    store.createSkill('test-skill', SKILL_MD);
    expect(() => store.uploadFile('test-skill', 'SKILL.md', 'hack')).toThrow('use updateSkill');
  });

  it('should prevent path traversal', () => {
    store.createSkill('test-skill', SKILL_MD);
    expect(() => store.getSkillFile('test-skill', '../../etc/passwd')).toThrow('Invalid file path');
  });
});
```

- [ ] **Step 2: 编写 Manager 测试**

```typescript
// tests/skills/manager.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SkillsManager } from '../../src/skills/manager.js';
import { Toolkit } from '@agentscope-ai/agentscope';

describe('SkillsManager', () => {
  let manager: SkillsManager;
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-mgr-'));
    manager = new SkillsManager({ skillsDir: testDir });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  const SKILL_MD = `---
name: Test Skill
description: A test skill
---

# Test Skill
`;

  it('should create and list skills', () => {
    manager.createSkill('test-skill', SKILL_MD);
    const skills = manager.listSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('Test Skill');
  });

  it('should delete a skill', () => {
    manager.createSkill('test-skill', SKILL_MD);
    manager.deleteSkill('test-skill');
    expect(manager.listSkills()).toHaveLength(0);
  });

  it('should create a Toolkit with skillDirs', () => {
    manager.createSkill('test-skill', SKILL_MD);
    const toolkit = manager.createToolkit();
    expect(toolkit).toBeInstanceOf(Toolkit);
    // skillDirs 应该包含测试目录
    expect(toolkit.skillDirs).toContain(testDir);
  });
});
```

- [ ] **Step 3: 运行测试**

```bash
pnpm run test:run tests/skills/
```

预期：所有测试通过

- [ ] **Step 4: 提交**

```bash
git add tests/skills/
git commit -m "test(skills): add unit tests for SkillsStore and SkillsManager"
```

---

### Task 7: 在 Web 服务器中注册 Skills API 路由

**Files:**
- Modify: `src/web/server.tsx`

- [ ] **Step 1: 修改 server.tsx，注入 SkillsManager 和路由**

读取当前 `src/web/server.tsx`，在 `WebServerConfig` 中添加 `skillsManager`，并注册所有 Skills API 路由：

```tsx
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import { IndexPage } from './views/index.js';
import { CronPage } from './views/cron.js';
import { SkillsPage } from './views/skills.js';
import { CronManager, CreateJobInput, UpdateJobInput } from '../cron/index.js';
import { SkillsManager, CreateSkillInput, UpdateSkillInput } from '../skills/index.js';

export interface WebServerConfig {
  port: number;
  host?: string;
  cronManager?: CronManager;
  skillsManager?: SkillsManager;  // 新增
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
    // ... 保持现有代码不变 ...
  }

  // ===== Skills API 路由 =====
  if (config.skillsManager) {
    const skills = config.skillsManager;

    // GET /api/skills - 列出所有 Skills
    app.get('/api/skills', (c) => {
      const skillList = skills.listSkills();
      return c.json({ skills: skillList });
    });

    // POST /api/skills - 创建 Skill
    app.post('/api/skills', async (c) => {
      try {
        const body = await c.req.json<CreateSkillInput>();
        if (!body.id || !body.skillMd) {
          return c.json({ error: 'id and skillMd are required' }, 400);
        }
        const skill = skills.createSkill(body.id, body.skillMd);
        return c.json({ skill }, 201);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Invalid request';
        return c.json({ error: message }, 400);
      }
    });

    // GET /api/skills/:id - 获取 Skill 详情
    app.get('/api/skills/:id', (c) => {
      const skill = skills.getSkill(c.req.param('id'));
      if (!skill) {
        return c.json({ error: 'Skill not found' }, 404);
      }
      return c.json({ skill });
    });

    // PUT /api/skills/:id - 更新 Skill
    app.put('/api/skills/:id', async (c) => {
      try {
        const body = await c.req.json<UpdateSkillInput>();
        if (!body.skillMd) {
          return c.json({ error: 'skillMd is required' }, 400);
        }
        const skill = skills.updateSkill(c.req.param('id'), body.skillMd);
        return c.json({ skill });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Invalid request';
        const isNotFound = error instanceof Error && error.message.includes('not found');
        return c.json({ error: message }, isNotFound ? 404 : 400);
      }
    });

    // DELETE /api/skills/:id - 删除 Skill
    app.delete('/api/skills/:id', (c) => {
      try {
        skills.deleteSkill(c.req.param('id'));
        return c.json({ success: true });
      } catch (error: unknown) {
        return c.json({ error: 'Skill not found' }, 404);
      }
    });

    // GET /api/skills/:id/files - 列出文件
    app.get('/api/skills/:id/files', (c) => {
      try {
        const files = skills.getSkillFiles(c.req.param('id'));
        return c.json({ files });
      } catch (error: unknown) {
        return c.json({ error: 'Skill not found' }, 404);
      }
    });

    // GET /api/skills/:id/files/:filename - 获取文件内容
    app.get('/api/skills/:id/files/:filename', (c) => {
      try {
        const content = skills.getSkillFile(c.req.param('id'), c.req.param('filename'));
        return c.json({ content });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Not found';
        return c.json({ error: message }, 404);
      }
    });

    // POST /api/skills/:id/files - 上传文件
    app.post('/api/skills/:id/files', async (c) => {
      try {
        const body = await c.req.json<{ filename: string; content: string }>();
        if (!body.filename || body.content === undefined) {
          return c.json({ error: 'filename and content are required' }, 400);
        }
        skills.uploadFile(c.req.param('id'), body.filename, body.content);
        return c.json({ success: true });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Invalid request';
        return c.json({ error: message }, 400);
      }
    });

    // DELETE /api/skills/:id/files/:filename - 删除文件
    app.delete('/api/skills/:id/files/:filename', (c) => {
      try {
        skills.deleteFile(c.req.param('id'), c.req.param('filename'));
        return c.json({ success: true });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Not found';
        return c.json({ error: message }, 404);
      }
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

  // Skills 页面路由
  app.get('/skills', (c) => {
    return c.html(<SkillsPage />);
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

- [ ] **Step 2: 提交**

```bash
git add src/web/server.tsx
git commit -m "feat(web): add Skills API routes and SkillsPage route"
```

---

### Task 8: 创建 Skills Web 管理页面

**Files:**
- Create: `src/web/views/skills.tsx`
- Modify: `src/web/index.ts`（导出 SkillsPage）

- [ ] **Step 1: 创建 Skills 页面视图**

```tsx
// src/web/views/skills.tsx

import type { FC } from 'hono/jsx';

export const SkillsPage: FC = () => {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>OwnClaw - Skills 管理</title>
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
                z-index: 100;
              }
              .modal.active { display: flex; }
              .modal-content {
                background: white;
                padding: 2rem;
                border-radius: var(--radius);
                max-width: 700px;
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
              .actions { display: flex; gap: 0.25rem; flex-wrap: wrap; }
              .desc-cell {
                max-width: 300px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
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
          </div>
          <div class="header">
            <h1>🎯 Skills 管理</h1>
            <button class="btn btn-primary" onclick="showCreateModal()">+ 新建 Skill</button>
          </div>

          <div class="card">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>名称</th>
                  <th>描述</th>
                  <th>文件数</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody id="skills-table">
                <tr><td colspan={5}>加载中...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Create/Edit Modal */}
        <div class="modal" id="skill-modal">
          <div class="modal-content">
            <div class="modal-header">
              <h2 id="modal-title">新建 Skill</h2>
              <button class="close-btn" onclick="closeModal()">&times;</button>
            </div>
            <form id="skill-form" onsubmit="handleSubmit(event)">
              <input type="hidden" id="skill-id" />
              <div class="form-group">
                <label for="skill-id-input">ID（唯一，仅创建时设置）</label>
                <input type="text" id="skill-id-input" placeholder="例如: data-analyst" />
              </div>
              <div class="form-group">
                <label for="skill-md">SKILL.md 内容（YAML frontmatter + 正文）</label>
                <textarea id="skill-md" required placeholder={'---\nname: My Skill\ndescription: Description\n---\n\n# My Skill\n\nInstructions...'} style={{ minHeight: '200px', fontFamily: 'monospace' }} />
              </div>
              <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                <button type="button" class="btn btn-muted" onclick="closeModal()">取消</button>
                <button type="submit" class="btn btn-primary">保存</button>
              </div>
            </form>
          </div>
        </div>

        {/* Files Modal */}
        <div class="modal" id="files-modal">
          <div class="modal-content">
            <div class="modal-header">
              <h2 id="files-modal-title">文件列表</h2>
              <button class="close-btn" onclick="closeFilesModal()">&times;</button>
            </div>
            <div id="files-list">加载中...</div>
            <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
              <button class="btn btn-sm btn-primary" onclick="showUploadForm()">+ 上传文件</button>
            </div>
          </div>
        </div>

        {/* File Content Modal */}
        <div class="modal" id="file-content-modal">
          <div class="modal-content">
            <div class="modal-header">
              <h2 id="file-content-title">文件内容</h2>
              <button class="close-btn" onclick="closeFileContentModal()">&times;</button>
            </div>
            <pre id="file-content" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '60vh', overflow: 'auto' }}></pre>
          </div>
        </div>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              let skills = [];
              let currentSkillId = null;

              async function loadSkills() {
                const res = await fetch('/api/skills');
                const data = await res.json();
                skills = data.skills || [];
                renderSkills();
              }

              function renderSkills() {
                const tbody = document.getElementById('skills-table');
                if (skills.length === 0) {
                  tbody.innerHTML = '<tr><td colspan="5">暂无 Skills，点击上方按钮创建</td></tr>';
                  return;
                }
                tbody.innerHTML = skills.map(skill => {
                  return '<tr>' +
                    '<td><code>' + escapeHtml(skill.id) + '</code></td>' +
                    '<td>' + escapeHtml(skill.name || skill.id) + '</td>' +
                    '<td class="desc-cell" title="' + escapeHtml(skill.description) + '">' + escapeHtml(skill.description || '-') + '</td>' +
                    '<td>' + (skill.files ? skill.files.length : 0) + '</td>' +
                    '<td class="actions">' +
                      '<button class="btn btn-sm btn-muted" onclick="showFiles(\\'' + skill.id + '\\')">📁 文件</button> ' +
                      '<button class="btn btn-sm btn-muted" onclick="showEditModal(\\'' + skill.id + '\\')">✏ 编辑</button> ' +
                      '<button class="btn btn-sm btn-danger" onclick="deleteSkill(\\'' + skill.id + '\\')">🗑 删除</button>' +
                    '</td>' +
                  '</tr>';
                }).join('');
              }

              function showCreateModal() {
                currentSkillId = null;
                document.getElementById('modal-title').textContent = '新建 Skill';
                document.getElementById('skill-id').value = '';
                document.getElementById('skill-id-input').value = '';
                document.getElementById('skill-id-input').disabled = false;
                document.getElementById('skill-md').value = '';
                document.getElementById('skill-modal').classList.add('active');
              }

              async function showEditModal(skillId) {
                currentSkillId = skillId;
                const res = await fetch('/api/skills/' + skillId);
                const data = await res.json();
                const skill = data.skill;
                if (!skill) return;

                document.getElementById('modal-title').textContent = '编辑 Skill';
                document.getElementById('skill-id').value = skill.id;
                document.getElementById('skill-id-input').value = skill.id;
                document.getElementById('skill-id-input').disabled = true;
                document.getElementById('skill-md').value = skill.content || '';
                document.getElementById('skill-modal').classList.add('active');
              }

              function closeModal() {
                document.getElementById('skill-modal').classList.remove('active');
              }

              async function handleSubmit(e) {
                e.preventDefault();
                const id = document.getElementById('skill-id').value;
                const skillMd = document.getElementById('skill-md').value;

                const url = id ? '/api/skills/' + id : '/api/skills';
                const method = id ? 'PUT' : 'POST';
                const body = id ? { skillMd } : { id: document.getElementById('skill-id-input').value, skillMd };

                const res = await fetch(url, {
                  method,
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                });

                if (res.ok) {
                  closeModal();
                  loadSkills();
                } else {
                  const err = await res.json();
                  alert('保存失败: ' + err.error);
                }
              }

              async function deleteSkill(skillId) {
                if (!confirm('确定删除此 Skill? 其目录下所有文件都将被删除。')) return;
                const res = await fetch('/api/skills/' + skillId, { method: 'DELETE' });
                if (res.ok) {
                  loadSkills();
                } else {
                  alert('删除失败: ' + (await res.json()).error);
                }
              }

              async function showFiles(skillId) {
                currentSkillId = skillId;
                document.getElementById('files-modal-title').textContent = '文件 - ' + skillId;
                document.getElementById('files-list').innerHTML = '加载中...';
                document.getElementById('files-modal').classList.add('active');

                const res = await fetch('/api/skills/' + skillId + '/files');
                const data = await res.json();

                if (!data.files || data.files.length === 0) {
                  document.getElementById('files-list').innerHTML = '<p>暂无附加文件</p>';
                  return;
                }

                document.getElementById('files-list').innerHTML = data.files.map(f =>
                  '<div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem;margin-bottom:0.5rem;background:hsl(var(--muted));border-radius:var(--radius);">' +
                    '<span>' + escapeHtml(f) + '</span>' +
                    '<div style="display:flex;gap:0.25rem;">' +
                      '<button class="btn btn-sm btn-muted" onclick="viewFile(\\'' + skillId + '\\', \\'' + f + '\\')">查看</button>' +
                      '<button class="btn btn-sm btn-danger" onclick="deleteFile(\\'' + skillId + '\\', \\'' + f + '\\')">删除</button>' +
                    '</div>' +
                  '</div>'
                ).join('');
              }

              function closeFilesModal() {
                document.getElementById('files-modal').classList.remove('active');
              }

              async function viewFile(skillId, filename) {
                const res = await fetch('/api/skills/' + skillId + '/files/' + filename);
                const data = await res.json();

                document.getElementById('file-content-title').textContent = filename;
                document.getElementById('file-content').textContent = data.content || '(空文件)';
                document.getElementById('file-content-modal').classList.add('active');
              }

              function closeFileContentModal() {
                document.getElementById('file-content-modal').classList.remove('active');
              }

              async function showUploadForm() {
                const filename = prompt('文件名（如 schema.sql）:');
                if (!filename) return;
                const content = prompt('文件内容:');
                if (content === null) return;

                const res = await fetch('/api/skills/' + currentSkillId + '/files', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ filename, content }),
                });

                if (res.ok) {
                  showFiles(currentSkillId);
                } else {
                  const err = await res.json();
                  alert('上传失败: ' + err.error);
                }
              }

              async function deleteFile(skillId, filename) {
                if (!confirm('确定删除文件 ' + filename + '?')) return;
                const res = await fetch('/api/skills/' + skillId + '/files/' + filename, { method: 'DELETE' });
                if (res.ok) {
                  showFiles(skillId);
                } else {
                  alert('删除失败: ' + (await res.json()).error);
                }
              }

              function escapeHtml(str) {
                const div = document.createElement('div');
                div.textContent = str || '';
                return div.innerHTML;
              }

              loadSkills();
            `,
          }}
        />
      </body>
    </html>
  );
};
```

- [ ] **Step 2: 修改 src/web/index.ts 导出 SkillsPage**

```typescript
// src/web/index.ts

export { createWebServer, WebServerConfig } from './server.js';
export { IndexPage } from './views/index.js';
export { CronPage } from './views/cron.js';
export { SkillsPage } from './views/skills.js';  // 新增
```

- [ ] **Step 3: 提交**

```bash
git add src/web/views/skills.tsx src/web/index.ts
git commit -m "feat(web): add Skills management page with CRUD UI"
```

---

### Task 9: 在 start-web.ts 中集成 SkillsManager

**Files:**
- Modify: `src/start-web.ts`

- [ ] **Step 1: 修改 start-web.ts**

```typescript
#!/usr/bin/env node

import { parseArgs } from 'util';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createWebServer, WebServerConfig } from './web/index.js';
import { CronManager } from './cron/index.js';
import { SkillsManager } from './skills/index.js';  // 新增

function resolveWebConfig(): WebServerConfig {
  return {
    port: parseInt(process.env.OWNCLAW_WEB_PORT || '3525', 10),
    host: process.env.OWNCLAW_WEB_HOST || '0.0.0.0',
  };
}

function startWebMain(): void {
  const config = resolveWebConfig();

  // 初始化 CronManager
  const cronManager = new CronManager();
  cronManager.initialize();

  // 初始化 SkillsManager
  const skillsManager = new SkillsManager();

  const skillsCount = skillsManager.listSkills().length;
  console.log(`\n🚀 正在启动 OwnClaw Web 服务器...`);
  console.log(`🌐 地址: http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
  console.log(`📡 端口: ${config.port}`);
  console.log(`🕐 Cron 任务: ${cronManager.scheduledCount} 个已调度`);
  console.log(`🎯 Skills: ${skillsCount} 个已加载`);
  console.log(`📂 Skills 目录: ~/.ownclaw/skills/\n`);

  const { app, server } = createWebServer({ ...config, cronManager, skillsManager });  // 注入 skillsManager

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

function startDetached(): void {
  const nodePath = process.execPath;
  const scriptPath = path.resolve(process.cwd(), 'dist/start-web.js');

  const child = spawn(nodePath, [scriptPath], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
    env: process.env,
  });

  child.unref();

  console.log(`\n✅ Web 后台进程已启动 (PID: ${child.pid})\n`);
  process.exit(0);
}

async function main() {
  const { values } = parseArgs({
    options: {
      detach: {
        type: 'boolean',
        default: false,
        short: 'd',
      },
    },
  });

  if (values.detach) {
    startDetached();
  } else {
    startWebMain();
  }
}

main().catch((error) => {
  console.error('Web 启动失败:', error);
  process.exit(1);
});
```

- [ ] **Step 2: 提交**

```bash
git add src/start-web.ts
git commit -m "feat(start-web): integrate SkillsManager into web server startup"
```

---

### Task 10: 在 AgentRunner 中集成 Skills Toolkit

**Files:**
- Modify: `src/runner/agent-runner.ts`

- [ ] **Step 1: 修改 agent-runner.ts**

需要读取 AgentScope 的 Toolkit 和内置工具，然后修改 AgentRunner：

```typescript
import { Agent } from '@agentscope-ai/agentscope/agent';
import { Toolkit } from '@agentscope-ai/agentscope';
import { CustomModel, CustomModelConfig } from '../model/custom-model.js';
import { WeixinBridge } from '../bridge/weixin-bridge.js';
import { loadConfig, Config } from '../config.js';
import { createLogger, getGlobalLogger, Logger } from '../logger.js';
import { SkillsManager } from '../skills/index.js';

export interface AgentRunnerConfig {
  model: CustomModelConfig;
  sysPrompt: string;
  weixin: {
    sendMessage: (to: string, text: string) => Promise<void>;
  };
  logger?: Logger;
  skillsManager?: SkillsManager;  // 新增
}

export class AgentRunner {
  private agent: Agent;
  private bridge: WeixinBridge;
  private logger: Logger;

  constructor(config: AgentRunnerConfig) {
    this.logger = config.logger || getGlobalLogger();

    // 创建模型客户端
    const model = new CustomModel(config.model);

    // 创建 Toolkit
    let toolkit: Toolkit;
    if (config.skillsManager) {
      // 通过 SkillsManager 创建 Toolkit（自动配置 skillDirs）
      toolkit = config.skillsManager.createToolkit();
    } else {
      // 没有 SkillsManager 时创建空 Toolkit
      toolkit = new Toolkit({ builtInSkillTool: false });
    }

    // 创建 Agent（传入 toolkit）
    this.agent = new Agent({
      name: 'weixin-assistant',
      sysPrompt: config.sysPrompt,
      model,
      toolkit,
      maxIters: 10,
    });

    // 创建桥接器
    this.bridge = new WeixinBridge({
      agent: this.agent,
      sendMessage: config.weixin.sendMessage,
      logger: this.logger,
    });
  }

  getBridge(): WeixinBridge {
    return this.bridge;
  }

  async start(): Promise<void> {
    this.logger.info('AgentRunner started');
  }

  async stop(): Promise<void> {
    this.logger.info('AgentRunner stopped');
  }
}

export interface AgentRunnerOptions {
  config?: Config;
  weixin: {
    sendMessage: (to: string, text: string) => Promise<void>;
  };
  logger?: Logger;
  skillsManager?: SkillsManager;  // 新增
}

export async function createAgentRunner(options: AgentRunnerOptions): Promise<AgentRunner> {
  const config = options.config || loadConfig();

  const logger = options.logger || createLogger({ level: config.log.level, prefix: '[AgentRunner] ' });

  const runner = new AgentRunner({
    model: {
      baseUrl: config.agentscope.model.baseUrl,
      apiKey: config.agentscope.model.apiKey,
      modelName: config.agentscope.model.modelName,
    },
    sysPrompt: config.agentscope.sysPrompt,
    weixin: options.weixin,
    logger,
    skillsManager: options.skillsManager,  // 传入
  });

  await runner.start();
  return runner;
}
```

- [ ] **Step 2: 提交**

```bash
git add src/runner/agent-runner.ts
git commit -m "feat(runner): integrate Skills Toolkit into AgentRunner"
```

---

### Task 11: 在 start.ts 中集成 SkillsManager

**Files:**
- Modify: `src/start.ts`

- [ ] **Step 1: 修改 start.ts**

在 `startMain()` 中找到创建 AgentRunner 的部分，传入 skillsManager：

在文件顶部添加导入：

```typescript
import { SkillsManager } from './skills/index.js';
```

在创建 AgentRunner 之前创建 SkillsManager：

```typescript
  // 创建 SkillsManager
  const skillsManager = new SkillsManager();
  const skillsCount = skillsManager.listSkills().length;
  if (skillsCount > 0) {
    logger.info(`🎯 Skills: ${skillsCount} 个已加载`);
  }

  // 创建 AgentRunner（传入 skillsManager）
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
      skillsManager,  // 新增
    });
```

- [ ] **Step 2: 提交**

```bash
git add src/start.ts
git commit -m "feat(start): integrate SkillsManager into agent runner"
```

---

### Task 12: 构建、类型检查和测试

- [ ] **Step 1: 类型检查**

```bash
pnpm run typecheck
```

确保没有类型错误。

- [ ] **Step 2: 构建**

```bash
pnpm run build
```

确保编译通过。

- [ ] **Step 3: 运行所有测试**

```bash
pnpm run test:run
```

- [ ] **Step 4: 提交**

```bash
git add .
git commit -m "chore: fix type errors and ensure build passes"
```

---

### Task 13: 创建示例 Skill

- [ ] **Step 1: 创建示例 Skill 目录和内容**

```bash
mkdir -p ~/.ownclaw/skills/data-analyst
```

创建 `~/.ownclaw/skills/data-analyst/SKILL.md`：

```markdown
---
name: data-analyst
description: 数据库查询和数据分析技能。支持读取 schema.sql 了解表结构，编写 SQL 查询。
---

# 数据分析技能

## 使用方法

1. 使用 Skill 工具读取 `data-analyst` 获取本指南
2. 使用文件读取工具读取 schema.sql 了解表结构
3. 根据用户问题编写 SQL 查询

## 示例

用户问: "昨天的注册用户有多少？"

你应该:
1. 读取 schema.sql 确认表名和字段
2. 编写类似 `SELECT COUNT(*) FROM users WHERE created_at >= 'yesterday'` 的查询
```

- [ ] **Step 2: 创建示例 schema.sql**

```bash
cat > ~/.ownclaw/skills/data-analyst/schema.sql << 'EOF'
-- 示例数据库结构
CREATE TABLE users (
    id INT PRIMARY KEY,
    name VARCHAR(100),
    created_at TIMESTAMP,
    status VARCHAR(20)
);

CREATE TABLE orders (
    id INT PRIMARY KEY,
    user_id INT,
    amount DECIMAL(10,2),
    created_at TIMESTAMP
);
EOF
```

---

### Task 14: 更新 TODO.md

- [ ] **Step 1: 标记 Skill 功能已完成**

修改 `docs/TODO.md`：

```markdown
## 任务列表

### 1. ✅ 增加 Skill 功能（已完成）

- 实现 SkillsManager 模块（types/schema/store/manager）
- Web API CRUD（/api/skills/*）
- Web 管理页面（/skills）
- Agent 集成（Toolkit + skillDirs）
- 启动脚本集成（start.ts + start-web.ts）
```

- [ ] **Step 2: 提交**

```bash
git add docs/TODO.md
git commit -m "docs: mark skill feature as completed"
```
