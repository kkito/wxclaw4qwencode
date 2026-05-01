# ACP 目录选择器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `/acp` 命令支持无参数列出可配置目录、`/acp N` 选择对应项目进入 ACP 模式，并添加 Web 配置页面。

**Architecture:** 新增 `src/acp-config/` 模块（store/scanner/selector），精简 `handler.ts` 为命令路由，新增 Web API 和页面。无状态方案：每次扫描+字母排序，不依赖中间状态。

**Tech Stack:** TypeScript (ESM), fs/promises, Hono, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/acp-config/store.ts` | Create | 读写 config.json 的 acpProjectDirs 字段 |
| `src/acp-config/scanner.ts` | Create | 扫描根目录，返回排序后的一级子目录列表 |
| `src/acp-config/selector.ts` | Create | 给定序号，找到对应目录 |
| `src/acp-config/index.ts` | Create | 统一导出 |
| `src/commands/acp/handler.ts` | Modify | 重写为 scan/select/direct 三路 |
| `src/commands/acp/COMMAND.md` | Modify | 更新 usage 说明 |
| `src/web/server.tsx` | Modify | 新增 /api/acp/dirs 和 /settings/acp-dirs 路由 |
| `src/web/views/acp-dirs.tsx` | Create | ACP 目录配置页面 |
| `tests/acp-config/store.test.ts` | Create | store 测试 |
| `tests/acp-config/scanner.test.ts` | Create | scanner 测试 |
| `tests/acp-config/selector.test.ts` | Create | selector 测试 |
| `tests/commands/acp.test.ts` | Modify | 更新 handler 测试 |

---

### Task 1: ACP Config Store

**Files:**
- Create: `src/acp-config/store.ts`
- Create: `src/acp-config/index.ts`
- Test: `tests/acp-config/store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/acp-config/store.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { loadAcpProjectDirs, saveAcpProjectDirs } from '../../src/acp-config/store.js';

vi.mock('node:fs/promises');
vi.mock('../../src/config-store.js', () => ({
  resolveConfigDir: () => '/tmp/test-ownclaw',
  resolveConfigPath: () => '/tmp/test-ownclaw/config.json',
}));

describe('acp-config store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array when config file does not exist', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
    const dirs = await loadAcpProjectDirs();
    expect(dirs).toEqual([]);
  });

  it('returns empty array when JSON parse fails', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('not json');
    const dirs = await loadAcpProjectDirs();
    expect(dirs).toEqual([]);
  });

  it('returns acpProjectDirs from valid config', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({ acpProjectDirs: ['/a', '/b'] }),
    );
    const dirs = await loadAcpProjectDirs();
    expect(dirs).toEqual(['/a', '/b']);
  });

  it('saves acpProjectDirs to config.json', async () => {
    const mkdirSpy = vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    const writeSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await saveAcpProjectDirs(['/x', '/y']);

    expect(mkdirSpy).toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(
      '/tmp/test-ownclaw/config.json',
      JSON.stringify({ acpProjectDirs: ['/x', '/y'] }, null, 2),
      'utf-8',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test:run tests/acp-config/store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/acp-config/store.ts
import * as fs from 'node:fs/promises';
import { resolveConfigDir, resolveConfigPath } from '../config-store.js';

export interface AcpConfig {
  acpProjectDirs?: string[];
}

export async function loadAcpProjectDirs(): Promise<string[]> {
  try {
    const raw = await fs.readFile(resolveConfigPath(), 'utf-8');
    const parsed = JSON.parse(raw) as AcpConfig;
    return parsed.acpProjectDirs ?? [];
  } catch {
    return [];
  }
}

export async function saveAcpProjectDirs(dirs: string[]): Promise<void> {
  const dir = resolveConfigDir();
  await fs.mkdir(dir, { recursive: true });
  const config: AcpConfig = { acpProjectDirs: dirs };
  await fs.writeFile(resolveConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}
```

```typescript
// src/acp-config/index.ts
export { loadAcpProjectDirs, saveAcpProjectDirs } from './store.js';
export { scanProjectDirs, type ScannedDir } from './scanner.js';
export { selectProjectByIndex } from './selector.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test:run tests/acp-config/store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/acp-config/store.ts src/acp-config/index.ts tests/acp-config/store.test.ts
git commit -m "feat: add acp-config store module with tests"
```

---

### Task 2: ACP Scanner

**Files:**
- Create: `src/acp-config/scanner.ts`
- Test: `tests/acp-config/scanner.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/acp-config/scanner.test.ts
import { describe, it, expect, vi } from 'vitest';
import { scanProjectDirs, type ScannedDir } from '../../src/acp-config/scanner.js';

describe('scanProjectDirs', () => {
  it('returns empty array for no root dirs', async () => {
    const result = await scanProjectDirs([]);
    expect(result).toEqual([]);
  });

  it('scans and sorts single root with subdirs', async () => {
    const mockFs = {
      readdir: vi.fn().mockResolvedValue(['zebra', 'alpha', 'middle']),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    };

    const result = await scanProjectDirs(['/root'], mockFs);

    expect(result.map((d) => d.name)).toEqual(['alpha', 'middle', 'zebra']);
    expect(result.map((d) => d.index)).toEqual([1, 2, 3]);
    expect(result[0].root).toBe('/root');
    expect(result[0].path).toBe('/root/alpha');
  });

  it('filters out non-directories', async () => {
    const mockFs = {
      readdir: vi.fn().mockResolvedValue(['project-a', 'readme.txt']),
      stat: vi.fn().mockImplementation(async (p: string) => ({
        isDirectory: () => !p.endsWith('.txt'),
      })),
    };

    const result = await scanProjectDirs(['/root'], mockFs);
    expect(result.map((d) => d.name)).toEqual(['project-a']);
  });

  it('handles multiple root dirs', async () => {
    const mockFs = {
      readdir: vi.fn().mockImplementation(async (p: string) => {
        if (p === '/root1') return ['bbb', 'aaa'];
        if (p === '/root2') return ['ccc'];
        return [];
      }),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    };

    const result = await scanProjectDirs(['/root1', '/root2'], mockFs);

    expect(result.map((d) => d.name)).toEqual(['aaa', 'bbb', 'ccc']);
    expect(result[0].root).toBe('/root1');
    expect(result[2].root).toBe('/root2');
  });

  it('skips root dirs that do not exist', async () => {
    const mockFs = {
      readdir: vi.fn().mockRejectedValue(new Error('ENOENT')),
      stat: vi.fn(),
    };

    const result = await scanProjectDirs(['/nonexistent'], mockFs);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test:run tests/acp-config/scanner.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/acp-config/scanner.ts
import * as fs from 'node:fs/promises';

export interface ScannedDir {
  index: number;
  name: string;
  path: string;
  root: string;
}

interface FsDeps {
  readdir: typeof fs.readdir;
  stat: typeof fs.stat;
}

const defaultFs: FsDeps = {
  readdir: fs.readdir.bind(fs),
  stat: fs.stat.bind(fs),
};

export async function scanProjectDirs(
  rootDirs: string[],
  fsDeps?: FsDeps,
): Promise<ScannedDir[]> {
  const { readdir, stat } = fsDeps ?? defaultFs;
  const results: ScannedDir[] = [];

  for (const root of rootDirs) {
    try {
      const entries = await readdir(root);
      for (const entry of entries) {
        const fullPath = `${root}/${entry}`;
        const st = await stat(fullPath);
        if (st.isDirectory()) {
          results.push({
            index: 0, // placeholder, will be set after sort
            name: entry,
            path: fullPath,
            root,
          });
        }
      }
    } catch {
      // skip nonexistent root dirs
    }
  }

  results.sort((a, b) => a.path.localeCompare(b.path));
  results.forEach((d, i) => {
    d.index = i + 1;
  });

  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test:run tests/acp-config/scanner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/acp-config/scanner.ts tests/acp-config/scanner.test.ts
git commit -m "feat: add scanner module with tests"
```

---

### Task 3: ACP Selector

**Files:**
- Create: `src/acp-config/selector.ts`
- Test: `tests/acp-config/selector.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/acp-config/selector.test.ts
import { describe, it, expect, vi } from 'vitest';
import { selectProjectByIndex } from '../../src/acp-config/selector.js';

describe('selectProjectByIndex', () => {
  it('returns null for empty root dirs', async () => {
    const result = await selectProjectByIndex([], 1);
    expect(result).toBeNull();
  });

  it('returns correct path for valid index', async () => {
    const mockFs = {
      readdir: vi.fn().mockResolvedValue(['alpha', 'beta']),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    };

    const result = await selectProjectByIndex(['/root'], 2, mockFs);

    expect(result).toEqual({ path: '/root/beta' });
  });

  it('returns null for index out of range', async () => {
    const mockFs = {
      readdir: vi.fn().mockResolvedValue(['only-one']),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    };

    const result = await selectProjectByIndex(['/root'], 5, mockFs);
    expect(result).toBeNull();
  });

  it('returns null for index 0', async () => {
    const mockFs = {
      readdir: vi.fn().mockResolvedValue(['project']),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    };

    const result = await selectProjectByIndex(['/root'], 0, mockFs);
    expect(result).toBeNull();
  });

  it('returns null for negative index', async () => {
    const mockFs = {
      readdir: vi.fn().mockResolvedValue(['project']),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    };

    const result = await selectProjectByIndex(['/root'], -1, mockFs);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test:run tests/acp-config/selector.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/acp-config/selector.ts
import * as fs from 'node:fs/promises';
import { scanProjectDirs } from './scanner.js';

interface FsDeps {
  readdir: typeof fs.readdir;
  stat: typeof fs.stat;
}

export async function selectProjectByIndex(
  rootDirs: string[],
  index: number,
  fsDeps?: FsDeps,
): Promise<{ path: string } | null> {
  if (index < 1) return null;

  const scanned = await scanProjectDirs(rootDirs, fsDeps);
  const found = scanned.find((d) => d.index === index);
  return found ? { path: found.path } : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test:run tests/acp-config/selector.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/acp-config/selector.ts tests/acp-config/selector.test.ts
git commit -m "feat: add selector module with tests"
```

---

### Task 4: Rewrite ACP Handler

**Files:**
- Modify: `src/commands/acp/handler.ts`
- Modify: `src/commands/acp/COMMAND.md`
- Modify: `tests/commands/acp.test.ts`

- [ ] **Step 1: Write new tests (add to existing test file)**

```typescript
// Add to tests/commands/acp.test.ts

// New imports at top:
import * as storeModule from '../../src/acp-config/store.js';
import * as selectorModule from '../../src/acp-config/selector.js';

describe('/acp scan mode', () => {
  it('prompts to configure dirs when no config exists', async () => {
    vi.spyOn(storeModule, 'loadAcpProjectDirs').mockResolvedValue([]);
    const handler = createAcpHandler(mockManager, mockFs);

    await handler('', {
      userId: 'user1',
      text: '/acp',
      sendMessage: sendMock,
    });

    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('未配置'));
    expect(mockManager.createSession).not.toHaveBeenCalled();
  });

  it('lists directories when config exists', async () => {
    vi.spyOn(storeModule, 'loadAcpProjectDirs').mockResolvedValue(['/root']);
    vi.spyOn(globalThis, 'scanProjectDirs').mockResolvedValue?.([
      { index: 1, name: 'alpha', path: '/root/alpha', root: '/root' },
      { index: 2, name: 'beta', path: '/root/beta', root: '/root' },
    ]);
    const handler = createAcpHandler(mockManager, mockFs);

    await handler('', {
      userId: 'user1',
      text: '/acp',
      sendMessage: sendMock,
    });

    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('alpha'));
    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('beta'));
  });
});

describe('/acp select mode', () => {
  it('creates session for valid index', async () => {
    vi.spyOn(storeModule, 'loadAcpProjectDirs').mockResolvedValue(['/root']);
    vi.spyOn(selectorModule, 'selectProjectByIndex').mockResolvedValue({
      path: '/root/selected',
    });
    const handler = createAcpHandler(mockManager, mockFs);

    await handler('3', {
      userId: 'user1',
      text: '/acp 3',
      sendMessage: sendMock,
    });

    expect(mockManager.createSession).toHaveBeenCalledWith(
      'user1',
      '/root/selected',
      expect.any(Function),
    );
  });

  it('shows error for invalid index', async () => {
    vi.spyOn(storeModule, 'loadAcpProjectDirs').mockResolvedValue(['/root']);
    vi.spyOn(selectorModule, 'selectProjectByIndex').mockResolvedValue(null);
    const handler = createAcpHandler(mockManager, mockFs);

    await handler('99', {
      userId: 'user1',
      text: '/acp 99',
      sendMessage: sendMock,
    });

    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('序号无效'));
    expect(mockManager.createSession).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test:run tests/commands/acp.test.ts`
Expected: FAIL — new tests fail because handler doesn't support scan/select modes yet

- [ ] **Step 3: Rewrite handler**

```typescript
// src/commands/acp/handler.ts
import * as fs from 'node:fs';
import type { SlashCommandHandler, SlashCommandContext } from '../../slash-command/types.js';
import { loadAcpProjectDirs } from '../../acp-config/store.js';
import { scanProjectDirs } from '../../acp-config/scanner.js';
import { selectProjectByIndex } from '../../acp-config/selector.js';

interface FsDeps {
  existsSync: typeof fs.existsSync;
  statSync: typeof fs.statSync;
}

const defaultFs: FsDeps = {
  existsSync: fs.existsSync.bind(fs),
  statSync: fs.statSync.bind(fs),
};

/** Global sessionManager reference (set by start.ts on init) */
let _globalManager: import('../../acp-session/manager.js').AcpSessionManager | null = null;

export function getGlobalSessionManager() {
  return _globalManager;
}

export function setGlobalSessionManager(mgr: import('../../acp-session/manager.js').AcpSessionManager) {
  _globalManager = mgr;
}

/**
 * Create /acp command handler
 */
export default function createAcpHandler(
  sessionManager?: import('../../acp-session/manager.js').AcpSessionManager,
  fsDeps?: FsDeps,
): SlashCommandHandler {
  const { existsSync, statSync } = fsDeps ?? defaultFs;

  return async (args: string, context: SlashCommandContext) => {
    const trimmed = args.trim();

    // Already in ACP mode
    if (sessionManager?.hasActiveSession(context.userId)) {
      await context.sendMessage('⚠️ 您已经在 ACP 模式中，请先发送 exit 退出');
      return { handled: true };
    }

    // === Scan mode: /acp (no args) ===
    if (trimmed === '') {
      await handleScan(context);
      return { handled: true };
    }

    // === Select mode: /acp N ===
    if (/^\d+$/.test(trimmed)) {
      await handleSelect(Number(trimmed), context);
      return { handled: true };
    }

    // === Direct path mode (existing behavior) ===
    await handleDirectPath(trimmed, context, existsSync, statSync, sessionManager);
    return { handled: true };
  };
}

async function handleScan(context: SlashCommandContext): Promise<void> {
  const dirs = await loadAcpProjectDirs();
  if (dirs.length === 0) {
    await context.sendMessage('⚠️ 未配置 ACP 项目目录，请前往后台配置页面添加');
    return;
  }

  const scanned = await scanProjectDirs(dirs);
  if (scanned.length === 0) {
    await context.sendMessage('⚠️ 配置的目录下没有子项目');
    return;
  }

  const lines = scanned.map((d) => `${d.index}. ${d.name} (${d.root})`);
  await context.sendMessage('可选项目：\n' + lines.join('\n') + '\n\n发送 /acp <序号> 进入对应项目');
}

async function handleSelect(
  index: number,
  context: SlashCommandContext,
): Promise<void> {
  const dirs = await loadAcpProjectDirs();
  if (dirs.length === 0) {
    await context.sendMessage('⚠️ 未配置 ACP 项目目录');
    return;
  }

  const selected = await selectProjectByIndex(dirs, index);
  if (!selected) {
    await context.sendMessage(`❌ 序号 ${index} 无效或目录不存在`);
    return;
  }

  const mgr = sessionManager || getGlobalSessionManager();
  if (!mgr) {
    await context.sendMessage('❌ ACP 功能未初始化');
    return;
  }

  await mgr.createSession(context.userId, selected.path, context.sendMessage);
}

async function handleDirectPath(
  path: string,
  context: SlashCommandContext,
  existsSync: typeof fs.existsSync,
  statSync: typeof fs.statSync,
  sessionManager?: import('../../acp-session/manager.js').AcpSessionManager,
): Promise<void> {
  if (!existsSync(path)) {
    await context.sendMessage(`❌ 路径不存在: ${path}`);
    return;
  }

  if (!statSync(path).isDirectory()) {
    await context.sendMessage(`❌ 不是目录: ${path}`);
    return;
  }

  const mgr = sessionManager || getGlobalSessionManager();
  if (!mgr) {
    await context.sendMessage('❌ ACP 功能未初始化');
    return;
  }

  await mgr.createSession(context.userId, path, context.sendMessage);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test:run tests/commands/acp.test.ts`
Expected: PASS

- [ ] **Step 5: Update COMMAND.md**

```markdown
---
name: acp
description: 进入 ACP (Agent Client Protocol) 模式
usage: /acp [路径|序号]
handler: ./handler.js
---

# ACP Command

进入 ACP 模式，允许与 Agent 进行交互式编程。

用法：

- `/acp` — 列出可配置项目，发送 `/acp <序号>` 选择
- `/acp 3` — 进入第 3 个项目
- `/acp /path/to/project` — 直接进入指定路径
```

- [ ] **Step 6: Commit**

```bash
git add src/commands/acp/handler.ts src/commands/acp/COMMAND.md tests/commands/acp.test.ts
git commit -m "refactor: rewrite /acp handler with scan/select/direct modes"
```

---

### Task 5: Web API + Settings Page

**Files:**
- Create: `src/web/views/acp-dirs.tsx`
- Modify: `src/web/server.tsx`

- [ ] **Step 1: Create the ACP dirs settings page**

```typescript
// src/web/views/acp-dirs.tsx
import type { FC } from 'hono/jsx';
import { Hono } from 'hono';
import { loadAcpProjectDirs, saveAcpProjectDirs } from '../../acp-config/store.js';

interface AcpDirsPageProps {
  dirs: string[];
  success?: boolean;
}

const AcpDirsPage: FC<AcpDirsPageProps> = (props) => {
  const dirList = props.dirs.join('\n');
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>OwnClaw - ACP 目录配置</title>
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
              .container { max-width: 600px; margin: 0 auto; padding: 2rem; }
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
              .header a {
                color: hsl(var(--muted-foreground));
                text-decoration: none;
                font-size: 0.875rem;
              }
              .header a:hover { text-decoration: underline; }
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
                font-family: monospace;
                font-size: 0.875rem;
                min-height: 120px;
                resize: vertical;
              }
              .form-group .hint {
                margin-top: 0.25rem;
                font-size: 0.75rem;
                color: hsl(var(--muted-foreground));
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
              .alert-success {
                background: hsl(var(--success) / 0.1);
                color: hsl(var(--success));
                padding: 0.75rem 1rem;
                border-radius: var(--radius);
                margin-bottom: 1rem;
                font-size: 0.875rem;
              }
            `,
          }}
        />
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>ACP 目录配置</h1>
            <a href="/settings">返回设置</a>
          </div>

          {props.success ? (
            <div class="alert-success">保存成功！</div>
          ) : null}

          <div class="card">
            <h2 style={{ 'font-size': '1.25rem', 'margin-bottom': '1rem' }}>根目录列表</h2>
            <form method="post" action="/settings/acp-dirs">
              <div class="form-group">
                <label for="dirs">根目录（每行一个）</label>
                <textarea
                  id="dirs"
                  name="dirs"
                  placeholder={"例如：\n/home/kkito/proj\n/home/kkito/work"}
                >{dirList}</textarea>
                <p class="hint">每个根目录下的一级子目录将出现在 /acp 列表中。</p>
              </div>
              <button type="submit" class="btn btn-primary">保存</button>
            </form>
          </div>
        </div>
      </body>
    </html>
  );
};

export function createAcpDirsRouter() {
  const app = new Hono();

  app.get('/', async (c) => {
    const dirs = await loadAcpProjectDirs();
    const saved = c.req.query('saved') === '1';
    return c.html(<AcpDirsPage dirs={dirs} success={saved} />);
  });

  app.post('/', async (c) => {
    const body = await c.req.parseBody();
    const raw = body['dirs'];
    const dirs =
      typeof raw === 'string'
        ? raw
            .split('\n')
            .map((d) => d.trim())
            .filter((d) => d.length > 0)
        : [];

    await saveAcpProjectDirs(dirs);
    return c.redirect('/settings/acp-dirs?saved=1', 302);
  });

  return app;
}
```

- [ ] **Step 2: Wire up API and page routes in server.tsx**

Add imports at the top:
```typescript
import { createAcpDirsRouter } from './views/acp-dirs.js';
import { loadAcpProjectDirs, saveAcpProjectDirs } from '../acp-config/store.js';
```

Add after the Settings route block (before the static file routes):

```typescript
  // ===== ACP Dirs API 路由 =====
  app.get('/api/acp/dirs', async (c) => {
    const dirs = await loadAcpProjectDirs();
    return c.json({ dirs });
  });

  app.put('/api/acp/dirs', async (c) => {
    try {
      const body = await c.req.json<{ dirs: string[] }>();
      if (!Array.isArray(body.dirs)) {
        return c.json({ error: 'dirs must be an array' }, 400);
      }
      await saveAcpProjectDirs(body.dirs);
      return c.json({ dirs: body.dirs });
    } catch (error: unknown) {
      return c.json({ error: 'Invalid request' }, 400);
    }
  });

  // ===== ACP Dirs Settings Page =====
  app.route('/settings/acp-dirs', createAcpDirsRouter());
```

- [ ] **Step 3: Run build and tests to verify**

Run: `pnpm run build && pnpm run test:run`
Expected: BUILD passes, all tests pass

- [ ] **Step 4: Commit**

```bash
git add src/web/views/acp-dirs.tsx src/web/server.tsx
git commit -m "feat: add ACP dirs API and settings page"
```

---

### Task 6: Integration Test + Final Check

**Files:**
- Create: `tests/acp-config/integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// tests/acp-config/integration.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as storeModule from '../../src/acp-config/store.js';
import * as scannerModule from '../../src/acp-config/scanner.js';
import * as selectorModule from '../../src/acp-config/selector.js';
import createAcpHandler from '../../src/commands/acp/handler.js';

/**
 * Integration test: /acp scan → list → /acp 2 → create session
 */
describe('/acp scan-then-select integration', () => {
  let sendMock: ReturnType<typeof vi.fn>;
  let mockManager: any;
  let mockFs: any;

  beforeEach(() => {
    sendMock = vi.fn().mockResolvedValue(undefined);
    mockManager = {
      hasActiveSession: vi.fn().mockReturnValue(false),
      createSession: vi.fn().mockResolvedValue(undefined),
    };
    mockFs = {
      existsSync: vi.fn().mockReturnValue(true),
      statSync: vi.fn().mockReturnValue({ isDirectory: () => true }),
    };
    vi.clearAllMocks();
  });

  it('full flow: scan lists dirs, select creates session', async () => {
    vi.spyOn(storeModule, 'loadAcpProjectDirs').mockResolvedValue(['/root']);
    vi.spyOn(scannerModule, 'scanProjectDirs').mockResolvedValue([
      { index: 1, name: 'alpha', path: '/root/alpha', root: '/root' },
      { index: 2, name: 'beta', path: '/root/beta', root: '/root' },
    ]);
    vi.spyOn(selectorModule, 'selectProjectByIndex').mockResolvedValue({
      path: '/root/beta',
    });

    const handler = createAcpHandler(mockManager, mockFs);

    // Step 1: /acp → lists dirs
    await handler('', {
      userId: 'u1',
      text: '/acp',
      sendMessage: sendMock,
    });

    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('alpha'));
    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('beta'));
    expect(mockManager.createSession).not.toHaveBeenCalled();

    // Step 2: /acp 2 → creates session
    sendMock.mockClear();
    await handler('2', {
      userId: 'u1',
      text: '/acp 2',
      sendMessage: sendMock,
    });

    expect(mockManager.createSession).toHaveBeenCalledWith(
      'u1',
      '/root/beta',
      expect.any(Function),
    );
  });
});
```

- [ ] **Step 2: Run full test suite**

Run: `pnpm run test:run`
Expected: ALL tests pass

- [ ] **Step 3: Type check**

Run: `pnpm run typecheck`
Expected: No type errors

- [ ] **Step 4: Build**

Run: `pnpm run build`
Expected: Build succeeds, output in dist/

- [ ] **Step 5: Commit**

```bash
git add tests/acp-config/integration.test.ts
git commit -m "test: add acp-config integration test"
```

---

## Self-Review

1. **Spec coverage:**
   - ✅ `/acp` lists directories sorted alphabetically
   - ✅ `/acp N` selects project by index
   - ✅ `/acp /path` direct path unchanged
   - ✅ Unconfigured prompt message
   - ✅ Invalid index prompt message
   - ✅ Web API GET/PUT `/api/acp/dirs`
   - ✅ Web page `/settings/acp-dirs`
   - ✅ TDD approach with tests
   - ✅ Small files, cohesive logic

2. **Placeholder scan:** No TBD/TODO/fill-in sections. All code blocks contain real content.

3. **Type consistency:** 
   - `ScannedDir` interface used consistently across scanner, selector, handler
   - `FsDeps` pattern follows existing handler.ts style
   - All function signatures match spec
