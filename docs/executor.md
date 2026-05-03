# Executor — 长任务执行器

## 概述

Executor 是基于 ACP 的异步任务队列系统，用于执行需要较长时间（最长 30 分钟）的 coding 任务。与 ACP 模式的实时交互不同，Executor 适合批量/异步场景：用户提交任务规格后，系统排队执行，无需用户在线等待。

## 架构

```
用户通过 Web 页面或 API 提交任务
  │
  ▼
ExecutorManager.addTask(projectId, specPath, prompt)
  │
  ▼
ExecutorRunner.run(task)
  ├── Stage 1 (initial)：发送 spec 文件路径 + initial prompt → 等待 end_turn
  └── Stage 2 (confirm)：发送 confirm prompt "任务是否完成？"
         ├── 是 → task completed
         └── 否 → 可能需要进一步处理
```

### 核心模块

| 模块 | 文件 | 职责 |
|------|------|------|
| ExecutorRunner | `src/executor/runner.ts` | 两阶段 ACP 对话执行 |
| ExecutorManager | `src/executor/manager.ts` | 队列调度 + start/stop |
| ExecutorStore | `src/executor/store.ts` | 文件存储 tasks.json + config.json |
| Types | `src/executor/types.ts` | LongTask, TaskStatus, ExecutorConfig 类型定义 |
| Schema | `src/executor/schema.ts` | Zod 验证 schema |

### 任务状态

```
pending → running → completed
              ↓
           failed (超时或错误)
```

## 使用方式

### Web 管理页面

访问 `/executor` 页面：

- 创建任务：选择项目、spec 文件、自定义 prompt
- 查看队列：显示 pending/running/completed 任务列表
- 启动/停止执行器：控制队列是否自动处理
- 删除/重新入队：管理已完成或失败的任务

### API

| API | 说明 |
|-----|------|
| `GET /api/executor/tasks` | 列出所有任务 |
| `POST /api/executor/tasks` | 创建任务 |
| `GET /api/executor/tasks/:id` | 获取单个任务 |
| `PUT /api/executor/tasks/:id` | 更新任务 |
| `DELETE /api/executor/tasks/:id` | 删除任务 |
| `POST /api/executor/tasks/:id/requeue` | 重新入队 |
| `POST /api/executor/start` | 启动执行器 |
| `POST /api/executor/stop` | 停止执行器 |

## 超时机制

- **30 分钟硬超时**：单次任务最长执行 30 分钟
- **活动重置超时**：每次收到 session update 重置超时计时器（表示任务仍在运行）

## 存储

| 路径 | 说明 |
|------|------|
| `~/.ownclaw/executor/tasks.json` | 任务列表 |
| `~/.ownclaw/executor/config.json` | 执行器配置（最大并发数等） |

## ACP 与 Executor 的关系

- **ACP 模式**：实时交互式 coding agent，用户在线对话
- **Executor**：基于 ACP 的异步批量执行，用户提交任务后无需在线等待
- 两者共享同一套 ACP 底层基础设施（`qwen` CLI subprocess）
