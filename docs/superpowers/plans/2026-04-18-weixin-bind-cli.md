# 微信绑定 CLI 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现微信绑定/解绑的 CLI 工具，支持 `bind`、`unbind`、`status` 三个子命令

**Architecture:** 使用 `@tencent-weixin/openclaw-weixin` 包的登录 API，通过子命令处理不同操作，账户数据存储在 `~/.ownclaw` 目录

**Tech Stack:** TypeScript, @tencent-weixin/openclaw-weixin, zod

---

## 文件结构

```
src/
├── cli.ts                 # CLI 入口，主命令解析
├── cli/
│   ├── index.ts           # 导出所有 cli 命令
│   ├── bind.ts            # bind 子命令实现
│   ├── unbind.ts          # unbind 子命令实现
│   └── status.ts          # status 子命令实现
├── config.ts              # 已有：配置加载
└── ...
```

---

## 实现步骤

### Task 1: CLI 入口和基础结构

**Files:**
- Create: `src/cli/index.ts`
- Create: `src/cli.ts` (入口文件)

- [ ] **Step 1: 创建 `src/cli/index.ts`**

```typescript
export { bindCommand } from './bind.js';
export { unbindCommand } from './unbind.js';
export { statusCommand } from './status.js';
```

- [ ] **Step 2: 创建 `src/cli.ts` 入口**

```typescript
#!/usr/bin/env node

import { parseArgs } from 'util';
import { bindCommand } from './cli/bind.js';
import { unbindCommand } from './cli/unbind.js';
import { statusCommand } from './cli/status.js';

const { positionals, values } = parseArgs({
  options: {
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
});

const subcommand = positionals[0];

switch (subcommand) {
  case 'bind':
    await bindCommand();
    break;
  case 'unbind':
    await unbindCommand();
    break;
  case 'status':
    await statusCommand();
    break;
  default:
    console.log(`
用法: node dist/cli.js <子命令>

子命令:
  bind    绑定微信
  unbind  解绑微信
  status  查看绑定状态

选项:
  -h, --help  显示帮助
`);
    process.exit(subcommand ? 1 : 0);
}
```

- [ ] **Step 3: 更新 `package.json` 添加 cli 入口**

在 `package.json` 中添加:
```json
"bin": {
  "ownclaw": "dist/cli.js"
}
```

- [ ] **Step 4: 提交**

```bash
git add src/cli/ src/cli.ts package.json
git commit -m "feat: 添加 CLI 入口和基础结构"
```

---

### Task 2: 配置状态目录

**Files:**
- Create: `src/cli/config.ts`

- [ ] **Step 1: 创建 `src/cli/config.ts`**

```typescript
import path from 'node:path';
import os from 'node:os';

/**
 * 解析状态目录
 * 优先级: OWNCLAW_STATE_DIR 环境变量 > ~/.ownclaw
 */
export function resolveStateDir(): string {
  const envPath = process.env.OWNCLAW_STATE_DIR?.trim();
  if (envPath) return path.resolve(envPath);
  return path.join(os.homedir(), '.ownclaw');
}
```

- [ ] **Step 2: 提交**

```bash
git add src/cli/config.ts
git commit -m "feat: 添加 CLI 配置模块"
```

---

### Task 3: bind 子命令

**Files:**
- Create: `src/cli/bind.ts`

- [ ] **Step 1: 创建 `src/cli/bind.ts`**

```typescript
import {
  startWeixinLoginWithQr,
} from '@tencent-weixin/openclaw-weixin/src/auth/login-qr.js';
import {
  saveWeixinAccount,
  registerWeixinAccountId,
  DEFAULT_BASE_URL,
} from '@tencent-weixin/openclaw-weixin/src/auth/accounts.js';
import { resolveStateDir } from './config.js';
import fs from 'node:fs';
import path from 'node:path';

export async function bindCommand(): Promise<void> {
  console.log('=== 微信绑定 ===\n');
  console.log('正在获取二维码...\n');

  // 设置状态目录
  const stateDir = resolveStateDir();
  console.log(`状态目录: ${stateDir}\n`);

  try {
    // 1. 获取二维码
    const startResult = await startWeixinLoginWithQr({
      apiBaseUrl: DEFAULT_BASE_URL,
      verbose: true,
    });

    if (!startResult.qrcodeUrl) {
      console.error('获取二维码失败');
      process.exit(1);
    }

    // 2. 显示二维码给用户
    console.log('请使用微信扫描下方二维码登录:');
    console.log(startResult.qrcodeUrl);
    console.log('\n或者复制链接到浏览器打开:\n');

    // 如果是 URL 直接显示
    if (startResult.qrcodeUrl.startsWith('http')) {
      console.log(startResult.qrcodeUrl);
    } else {
      // 如果是 base64 图片，显示提示
      console.log('[二维码图片，请查看上方]');
    }

    console.log('\n等待扫码中... (按 Ctrl+C 取消)\n');

    // 3. 轮询等待用户确认
    // 注意: startWeixinLoginWithQr 返回后需要调用 waitForWeixinLogin 
    // 或者使用轮询方式检查状态
    
    // 这里我们使用简单的轮询方式等待
    // 实际应该复用 startWeixinLoginWithQr 内部的轮询逻辑
    
    let attempts = 0;
    const maxAttempts = 60; // 最多等待 5 分钟 (60 * 5s)
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
      
      // 这里需要再次调用 startWeixinLoginWithQr 获取最新状态
      // 或者使用内部的 sessionKey 继续轮询
      
      // 简化处理: 提示用户确认后手动结束
      if (attempts % 6 === 0) {
        console.log(`仍在等待确认... (${attempts * 5 / 60} 分钟)`);
      }
    }

    console.log('\n绑定超时，请重试');

  } catch (error) {
    console.error('绑定失败:', error);
    process.exit(1);
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/cli/bind.ts
git commit -m "feat: 实现 bind 子命令"
```

---

### Task 4: status 子命令

**Files:**
- Create: `src/cli/status.ts`

- [ ] **Step 1: 创建 `src/cli/status.ts`**

```typescript
import { resolveStateDir } from './config.js';
import fs from 'node:fs';
import path from 'node:path';

interface AccountIndex {
  version?: number;
  accounts?: string[];
}

export async function statusCommand(): Promise<void> {
  console.log('=== 微信绑定状态 ===\n');

  const stateDir = resolveStateDir();
  const indexPath = path.join(stateDir, 'openclaw-weixin', 'accounts.json');

  if (!fs.existsSync(indexPath)) {
    console.log('尚未绑定微信账号');
    return;
  }

  try {
    const raw = fs.readFileSync(indexPath, 'utf-8');
    const data = JSON.parse(raw);
    const accountIds = Array.isArray(data) ? data : data.accounts || [];

    if (accountIds.length === 0) {
      console.log('尚未绑定微信账号');
      return;
    }

    console.log(`已绑定账号数: ${accountIds.length}\n`);

    // 读取每个账号的详细信息
    for (const accountId of accountIds) {
      const accountPath = path.join(stateDir, 'openclaw-weixin', 'accounts', `${accountId}.json`);
      let info = accountId;
      
      if (fs.existsSync(accountPath)) {
        const accountData = JSON.parse(fs.readFileSync(accountPath, 'utf-8'));
        if (accountData.savedAt) {
          const date = new Date(accountData.savedAt).toLocaleString('zh-CN');
          info += ` - 绑定时间: ${date}`;
        }
        if (accountData.userId) {
          info += ` - 用户: ${accountData.userId}`;
        }
      }
      
      console.log(`- ${info}`);
    }

  } catch (error) {
    console.error('读取状态失败:', error);
    process.exit(1);
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/cli/status.ts
git commit -m "feat: 实现 status 子命令"
```

---

### Task 5: unbind 子命令

**Files:**
- Create: `src/cli/unbind.ts`

- [ ] **Step 1: 创建 `src/cli/unbind.ts`**

```typescript
import { resolveStateDir } from './config.js';
import fs from 'node:fs';
import path from 'node:path';
import { clearWeixinAccount, unregisterWeixinAccountId } from '@tencent-weixin/openclaw-weixin/src/auth/accounts.js';
import { readFileSync } from 'node:fs';

export async function unbindCommand(): Promise<void> {
  console.log('=== 微信解绑 ===\n');

  const stateDir = resolveStateDir();
  const weixinDir = path.join(stateDir, 'openclaw-weixin');
  const indexPath = path.join(weixinDir, 'accounts.json');

  if (!fs.existsSync(indexPath)) {
    console.log('尚未绑定微信账号，无需解绑');
    return;
  }

  try {
    const raw = fs.readFileSync(indexPath, 'utf-8');
    const data = JSON.parse(raw);
    const accountIds = Array.isArray(data) ? data : data.accounts || [];

    if (accountIds.length === 0) {
      console.log('尚未绑定微信账号，无需解绑');
      return;
    }

    // 显示账号列表
    console.log('已绑定的账号:\n');
    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i];
      const accountPath = path.join(weixinDir, 'accounts', `${accountId}.json`);
      let info = `${i + 1}. ${accountId}`;
      
      if (fs.existsSync(accountPath)) {
        const accountData = JSON.parse(fs.readFileSync(accountPath, 'utf-8'));
        if (accountData.userId) {
          info += ` (${accountData.userId})`;
        }
      }
      console.log(info);
    }

    // 简单处理：解绑第一个账号（后续可以添加交互选择）
    if (accountIds.length === 1) {
      const accountId = accountIds[0];
      console.log(`\n解绑账号: ${accountId}`);
      
      clearWeixinAccount(accountId);
      unregisterWeixinAccountId(accountId);
      
      console.log('解绑成功');
    } else {
      console.log('\n多个账号，请手动选择解绑（待实现）');
    }

  } catch (error) {
    console.error('解绑失败:', error);
    process.exit(1);
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/cli/unbind.ts
git commit -m "feat: 实现 unbind 子命令"
```

---

### Task 6: 完善 bind 子命令的登录等待逻辑

需要正确实现等待用户扫码确认的逻辑。

- [ ] **Step 1: 查看 waitForWeixinLogin 函数**

```typescript
// 在 @tencent-weixin/openclaw-weixin/src/auth/login-qr.ts 中
import { waitForWeixinLogin } from '@tencent-weixin/openclaw-weixin/src/auth/login-qr.js';
```

- [ ] **Step 2: 更新 bind.ts 使用 waitForWeixinLogin**

```typescript
import {
  startWeixinLoginWithQr,
  waitForWeixinLogin,
} from '@tencent-weixin/openclaw-weixin/src/auth/login-qr.js';

// ... 在 bindCommand 中 ...

// 1. 获取二维码
const startResult = await startWeixinLoginWithQr({
  apiBaseUrl: DEFAULT_BASE_URL,
});

// 2. 显示二维码
console.log('请使用微信扫描二维码登录:');
console.log(startResult.qrcodeUrl);

// 3. 等待登录完成
const waitResult = await waitForWeixinLogin({
  sessionKey: startResult.sessionKey,
  verbose: true,
});

if (waitResult.connected && waitResult.botToken && waitResult.accountId) {
  // 保存账户
  const stateDir = resolveStateDir();
  // ... 保存到 ~/.ownclaw/openclaw-weixin/accounts/ ...
  
  console.log('\n绑定成功！');
  console.log(`账号: ${waitResult.accountId}`);
}
```

- [ ] **Step 3: 提交**

```bash
git add src/cli/bind.ts
git commit -m "fix: 完善 bind 命令的登录等待逻辑"
```

---

### Task 7: 构建和测试

- [ ] **Step 1: 构建项目**

```bash
pnpm run build
```

- [ ] **Step 2: 测试 status 命令**

```bash
node dist/cli.js status
```

- [ ] **Step 3: 测试 bind 命令**

```bash
node dist/cli.js bind
```

- [ ] **Step 4: 提交**

```bash
git add .
git commit -m "test: CLI 构建和基础测试"
```

---

### Task 8: 添加 TypeScript 类型检查

- [ ] **Step 1: 运行类型检查**

```bash
pnpm run typecheck
```

- [ ] **Step 2: 修复类型错误（如有）**

- [ ] **Step 3: 提交**

```bash
git add .
git commit -m "fix: 修复类型错误"
```

---

## 验收标准

1. `node dist/cli.js status` 能正确显示绑定状态（无账号时提示"尚未绑定"）
2. `node dist/cli.js bind` 能显示二维码并等待用户扫码
3. 扫码成功后账户信息保存到 `~/.ownclaw`
4. `node dist/cli.js unbind` 能解绑账号
5. TypeScript 编译无错误