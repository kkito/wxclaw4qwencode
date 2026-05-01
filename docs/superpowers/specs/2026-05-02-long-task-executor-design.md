# 长程任务执行器设计

## 概述

基于 ACP 协议的长程任务执行器。用户通过 Web 后台配置任务（指定项目目录 + spec 文件 + 提示词），执行器自动串行执行任务：启动 `qwen --acp` 子进程，发送提示词让 AI 自主完成任务，记录执行结果。

## 核心流程

```
开启执行器
    │
    ▼
获取第一个 pending 任务
    │
    ▼
┌─────────────────────────────────────────┐
│ ExecutorRunner.run(task)                │
│  1. 拼接提示词: specPath + initialPrompt│
│  2. 创建 AcpClient(cwd=projectId)       │
│  3. 发送提示词，30 分钟超时              │
│  4. stopReason === 'end_turn'           │
│     → 发送 confirmPrompt                │
│     → 记录返回内容，标记 success        │
│  5. 非正常结束 → 标记 failed/timeout    │
│  6. 记录 startedAt / endedAt / result   │
└─────────────────────────────────────────┘
    │
    ▼
更新任务状态，继续下一个
    │
    ▼
无 pending 任务 → 空闲等待
```

## 数据模型

```typescript
interface LongTask {
  id: string;              // UUID
  projectId: string;       // 项目目录绝对路径
  specPath: string;        // spec 文件相对路径（如 docs/superpowers/specs/xxx-design.md）
  initialPrompt: string | null; // null 时使用全局默认
  confirmPrompt: string | null; // null 时使用全局默认
  status: TaskStatus;
  startedAt: string | null;
  endedAt: string | null;
  result: string | null;           // 第一次 prompt 的最终响应摘要
  confirmResponse: string | null;  // 第二次 confirmPrompt 的完整返回
  createdAt: string;
}

type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'timeout';

interface ExecutorConfig {
  defaultInitialPrompt: string;
  defaultConfirmPrompt: string;
}
```

## 文件存储

```
~/.ownclaw/executor/
├── tasks.json       # 任务列表（数组）
└── config.json      # 全局配置（默认提示词）
```

无日志目录，所有状态信息维护在 `tasks.json` 的单条数据中。

## 文件结构

```
src/
├── executor/                          # 新增
│   ├── types.ts                       # 类型定义
│   ├── schema.ts                      # Zod 验证
│   ├── store.ts                       # 文件存储（任务 + 全局配置）
│   ├── runner.ts                      # 单任务执行器（ACP 交互）
│   ├── manager.ts                     # 高层管理器（串行调度 + 状态控制）
│   └── index.ts                       # 统一导出
│
└── web/
    ├── server.tsx                     # 修改：注册 /executor 路由
    └── views/
        └── executor.tsx               # 管理页面
```

## 核心模块

### LongTaskStore

```typescript
class LongTaskStore {
  loadTasks(): LongTask[];
  saveTasks(tasks: LongTask[]): void;
  addTask(task: LongTask): void;
  updateTask(id: string, updates: Partial<LongTask>): void;
  removeTask(id: string): void;
  getPendingTasks(): LongTask[];
  loadConfig(): ExecutorConfig;
  saveConfig(config: ExecutorConfig): void;
  resolvePrompts(task: LongTask): { initial: string; confirm: string };
}
```

`resolvePrompts` 方法：task 的提示词为 null 时回退到 `config.json` 中的全局默认值。

### ExecutorRunner

```typescript
class ExecutorRunner {
  async run(task: LongTask, config: ExecutorConfig): Promise<TaskResult>;
}

interface TaskResult {
  status: 'success' | 'failed' | 'timeout';
  startedAt: string;
  endedAt: string;
  result?: string;
  confirmResponse?: string;
}
```

执行流程：

1. 通过 `resolvePrompts` 获取实际提示词
2. 拼接初始消息：`${task.specPath}\n\n${initialPrompt}`（spec 只发路径，不发内容）
3. 创建 `AcpClient(cwd=task.projectId)`
4. 记录 `startedAt`
5. 设置 30 分钟超时计时器
6. `AcpClient.sendMessage(initialMessage)`
7. 等待 `PromptResponse`：
   - `stopReason === 'end_turn'` → 正常结束 → 发送 `confirmPrompt` → 再次等待 → 记录 `confirmResponse` → 标记 `success`
   - `stopReason === 'max_tokens' | 'max_turn_requests'` → 标记 `failed`
   - `stopReason === 'cancelled'` → 标记 `failed`
   - 进程异常/超时 → 标记 `timeout`
8. 记录 `endedAt`
9. `AcpClient.close()`
10. 返回 `TaskResult`

### ExecutorManager

```typescript
class ExecutorManager {
  isEnabled: boolean;
  isExecuting: boolean;  // 正在执行中，不允许关闭或修改任务

  start(): void;         // 开启执行器，串行执行 pending 任务
  stop(): void;          // 关闭执行器，若正在执行则等待当前任务完成
  addTask(task: LongTask): void;
  removeTask(id: string): void;
  getTasks(): LongTask[];
  updateTask(id: string, updates: Partial<LongTask>): void;
  requeueTask(id: string): void;  // 将任务状态改为 pending
  updateConfig(config: ExecutorConfig): void;
}
```

**约束**：
- `isExecuting === true` 时禁止 `stop()`、禁止删除/修改正在执行的任务
- 任务串行执行，每次取第一个 pending 任务

## Web 路由

全部通过 Hono 表单 + 重定向，无 JSON API。

| 路由 | 方法 | 说明 |
|------|------|------|
| `GET /executor` | 页面 | 管理页面 |
| `POST /executor/tasks` | 表单 | 创建任务 |
| `POST /executor/tasks/:id/delete` | 表单 | 删除任务 |
| `POST /executor/tasks/:id/requeue` | 表单 | 重新入队 |
| `POST /executor/start` | 表单 | 启动执行器 |
| `POST /executor/stop` | 表单 | 停止执行器 |
| `POST /executor/config` | 表单 | 更新全局默认提示词 |
| `POST /executor/tasks/:id/prompts` | 表单 | 覆盖单个任务的提示词 |

## Web 页面结构

`GET /executor` 页面：

1. **全局配置区**：编辑 `defaultInitialPrompt` / `defaultConfirmPrompt`
2. **执行器控制区**：开启/关闭按钮 + 当前状态（空闲/执行中 + 当前任务描述）
3. **添加任务区**：表单 — 选择项目（扫描 ACP 目录）、选择 spec 文件（扫描 `docs/superpowers/specs/`）、可选覆盖提示词
4. **任务列表区**：表格 — ID、项目、Spec、状态、开始时间、结束时间、结果、confirmResponse、操作（删除/重新入队）
5. **流程说明区**：文字描述执行流程

## 测试

| 测试文件 | 类型 | 覆盖内容 |
|----------|------|----------|
| `tests/executor/store.test.ts` | 单元 | 任务读写、增删改、查询 pending、全局配置、提示词回退 |
| `tests/executor/schema.test.ts` | 单元 | Zod 验证 LongTask / ExecutorConfig |
| `tests/executor/runner.test.ts` | 单元 | mock AcpClient，正常/异常/超时/确认路径 |
| `tests/executor/manager.test.ts` | 单元 | 串行调度、状态流转、执行中不允许修改 |
| `tests/web/executor.test.ts` | Web 路由 | 页面渲染 + 各表单提交 + 重定向 |

## 环境变量

无新增。复用已有的 `qwen` CLI 和 `AcpClient`。
