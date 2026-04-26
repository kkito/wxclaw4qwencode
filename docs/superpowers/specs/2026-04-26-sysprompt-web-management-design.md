# 系统提示词 Web 管理功能设计

**日期**: 2026-04-26  
**状态**: 待实现

## 概述

为 OwnClaw 添加系统提示词（sysPrompt）的 Web 管理功能，支持在线编辑、持久化存储和热更新（无需重启 Agent）。

## 架构

### 模块结构

```
src/prompt/
├── types.ts          # 类型定义（PromptMeta, PromptManagerConfig）
├── schema.ts         # Zod 验证 schema
├── store.ts          # 文件存储（~/.ownclaw/sysprompt.md 读写）
├── manager.ts        # 高层管理：加载、保存、热更新 Agent
└── index.ts          # 统一导出
```

### 存储

- **文件路径**: `~/.ownclaw/sysprompt.md`
- **格式**: Markdown，带 YAML frontmatter（包含 `updatedAt` 时间戳）
- **加载优先级**: 启动时优先读取文件，文件不存在时回退到环境变量 `AGENT_SYS_PROMPT`

### 热更新机制

通过**重建整个 Agent 实例**实现热更新：

1. 用户通过 Web API 提交新的系统提示词
2. `PromptManager.save()` 写入文件
3. `AgentRunner.updateSysPrompt(newSysPrompt)` 被调用：
   - 用新的 sysPrompt 创建新的 Agent 实例
   - 调用 `WeixinBridge.setAgent(newAgent)` 更新引用
4. 新消息立即使用新的系统提示词

## 详细设计

### 1. `src/prompt/types.ts`

```typescript
export interface PromptMeta {
  content: string;        // 提示词内容（不含 frontmatter）
  updatedAt?: Date;       // 最后修改时间
}

export interface PromptManagerConfig {
  promptFile?: string;    // 提示词文件路径，默认 ~/.ownclaw/sysprompt.md
  defaultPrompt?: string; // 默认提示词，回退值
}
```

### 2. `src/prompt/schema.ts`

```typescript
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

### 3. `src/prompt/store.ts`

```typescript
export class PromptStore {
  private promptFile: string;

  constructor(promptFile: string);

  /** 读取系统提示词 */
  load(): PromptMeta;

  /** 保存系统提示词 */
  save(content: string): PromptMeta;

  /** 检查文件是否存在 */
  exists(): boolean;
}
```

**frontmatter 格式**:
```markdown
---
updatedAt: 2026-04-26T10:30:00.000Z
---

你是一个友好的 AI 助手。
```

### 4. `src/prompt/manager.ts`

```typescript
export class PromptManager {
  private store: PromptStore;
  private defaultPrompt: string;

  constructor(config?: PromptManagerConfig);

  /** 加载当前提示词（优先文件，否则默认） */
  loadCurrent(): string;

  /** 保存并返回元数据 */
  save(content: string): PromptMeta;

  /** 获取当前提示词 */
  getCurrent(): string;
}
```

### 5. `AgentRunner` 改动

**新增方法**:
```typescript
class AgentRunner {
  // 新增：更新系统提示词并重建 Agent
  updateSysPrompt(newSysPrompt: string): void;
}
```

**实现逻辑**:
1. 用新的 sysPrompt 创建新 Agent 实例
2. 调用 `this.bridge.setAgent(newAgent)` 更新 WeixinBridge
3. 替换内部 `this.agent` 为新实例

### 6. `WeixinBridge` 改动

**新增方法**:
```typescript
class WeixinBridge {
  // 新增：更新持有的 Agent 实例
  setAgent(agent: Agent): void;
}
```

### 7. Web API

```
GET  /api/prompt          # 获取当前系统提示词
PUT  /api/prompt          # 更新系统提示词（触发热更新）
```

**请求/响应**:
- `GET /api/prompt` → `{ content: string, updatedAt: Date }`
- `PUT /api/prompt` → `{ content: string, updatedAt: Date }`
  - Body: `{ content: string }`

### 8. Web 页面：`/prompt`

- 独立页面，与 Cron / Skills 页面风格一致
- 大文本编辑器（textarea），显示当前提示词
- "保存"按钮 → 调用 PUT API
- 保存后显示成功提示
- 导航：首页添加链接到 `/prompt`

### 9. 集成点

**Web 服务器** (`src/web/server.tsx`):
- 接收 `PromptManager` 作为配置参数
- 注册 `/api/prompt` 路由（GET + PUT）
- PUT 路由内部调用 `agentRunner.updateSysPrompt()`

**启动流程** (`src/start.ts` 或 `src/start-web.ts`):
1. 创建 `PromptManager`
2. 加载初始提示词：`promptManager.loadCurrent()`
3. 创建 `AgentRunner`（使用加载的提示词）
4. 将 `PromptManager` 和 `AgentRunner` 都传入 Web 服务器

## 测试

### 单元测试 (`tests/prompt/`)

- **PromptStore**: 文件读写、frontmatter 解析、不存在时的回退
- **PromptManager**: 加载/保存逻辑、默认值回退
- **AgentRunner**: `updateSysPrompt()` 方法是否正确重建 Agent 并更新 Bridge
- **WeixinBridge**: `setAgent()` 方法是否正确替换引用

### Web API 测试

- `GET /api/prompt` 返回当前提示词
- `PUT /api/prompt` 成功更新并返回新内容
- `PUT /api/prompt` 空内容时返回 400 错误
- 更新后新消息使用新提示词（集成测试）

## 错误处理

- 文件不存在：使用默认提示词，不报错
- 文件解析失败：使用默认提示词，记录警告
- 保存失败：返回 500 错误
- 更新 Agent 失败：返回 500 错误，原 Agent 保持不变

## 安全考虑

- `GET /api/prompt` 返回当前提示词内容（用于编辑页面预填充），这是设计意图
- 文件路径安全：`PromptStore` 使用固定路径，不接收用户输入的路径参数

## 后续扩展

- 支持多个提示词模板
- 提示词版本历史
- 提示词预览（测试模式）
