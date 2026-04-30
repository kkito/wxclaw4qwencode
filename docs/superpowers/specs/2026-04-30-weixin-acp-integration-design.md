# 微信 ACP 集成设计

## 概述

在现有微信 → AgentScope 流程基础上，增加 ACP（Agent Client Protocol）模式。用户通过斜杠命令进入 ACP 模式，与 `qwen --acp` 进程交互进行代码开发等任务，完成后退出回到 AgentScope 流程。

## 核心流程

```
微信消息
  │
  ▼
SlashCommandRouter（前置拦截）
  │
  ├── /acp /path/to/project → AcpSessionManager → qwen --acp 子进程
  │                              │
  │                              ▼
  │                         ACP 流式响应 → 微信回复（带 [ACP 模式] 前缀）
  │                              │
  │                              ▼
  │                         exit/quit 或 30 分钟超时 → 清理进程，返回 AgentScope
  │
  └── 其他消息 → WeixinBridge → AgentScope Agent → 微信回复（原有流程不变）
```

## 斜杠命令通用架构

### 存储位置

`~/.ownclaw/commands/` 目录，每个子目录一个命令：

```
~/.ownclaw/commands/
├── acp/
│   ├── COMMAND.md       # 命令元数据（名称、描述、handler 路径等）
│   └── handler.ts       # 命令处理逻辑
└── ...                  # 未来扩展
```

### COMMAND.md 格式

```markdown
---
name: acp
description: 进入 ACP 开发模式
usage: /acp /path/to/project
handler: ./handler.ts
---

# /acp 命令

进入 ACP 模式，与 qwen --acp 进程交互进行代码开发。

## 用法

- `/acp /path/to/project` — 在指定目录启动 ACP 模式
- `/acp` — 提示用户输入项目路径

## 交互

进入 ACP 模式后，所有消息转发给 qwen --acp 进程。
发送 `exit` 或 `quit` 退出 ACP 模式。
```

### 加载机制

- `SlashCommandRegistry` — 命令注册表，维护命令名 → handler 的映射
- `SlashCommandLoader` — 从 `~/.ownclaw/commands/` 扫描并加载命令
- 启动时自动加载，支持热重载

### 拦截位置

在 `WeixinBridge.handleMessage()` 的最前面插入 `SlashCommandRouter`：

```typescript
// WeixinBridge.handleMessage()
async handleMessage(weixinMsg: WeixinMessage): Promise<void> {
  const text = this.extractText(weixinMsg);

  // 1. 先尝试斜杠命令
  const slashHandled = await this.slashRouter.route(text, weixinMsg);
  if (slashHandled) return;

  // 2. 继续原有 AI 流程
  // ...
}
```

**注意**：`openclaw-weixin` 内置的 `/echo`、`/toggle-debug` 等命令仍然在 `node_modules` 层独立处理，与本方案互不干扰。

## ACP 会话管理

### AcpSession

封装单个微信用户的 ACP 会话状态：

```typescript
interface AcpSession {
  userId: string;              // 微信用户 ID
  cwd: string;                 // 工作目录
  client: AcpClient;           // ACP 客户端（封装 src/acp/client.ts）
  lastActivity: Date;          // 最后活跃时间
  timeoutTimer: Timer;         // 超时定时器
}
```

### AcpSessionManager

- `createSession(userId, cwd)` — 创建 ACP 会话，启动 qwen --acp 子进程
- `getSession(userId)` — 获取活跃会话
- `sendMessage(userId, message)` — 转发消息到 ACP
- `endSession(userId)` — 结束会话，关闭进程，清理资源
- `checkTimeout()` — 定时检查超时会话并清理

### 超时机制

- 默认超时时间：**30 分钟**
- 每次收到用户消息重置计时器
- 超时后自动关闭 ACP 进程并向用户发送提示

## 流式输出处理

ACP 通过 `sessionUpdate` 事件流式输出内容。需要将流式内容聚合为微信消息：

### 策略：批量累积发送

- 累积 ACP 输出内容，每 **3 秒** 或内容达到 **200 字符** 时发送一条微信消息
- 每条微信消息前加状态提示：`[ACP 模式] 工作目录: /path/to/project\n---\n`
- 最终结果发送时追加一条完成提示

### AcpWeixinOutput

负责将 ACP 的 `sessionUpdate` 事件转换为微信消息：

```typescript
class AcpWeixinOutput {
  private buffer: string = '';
  private lastSend: Date;

  onSessionUpdate(update: SessionUpdate, userId: string, sendMessage: SendFn): void;
  flush(userId: string, sendMessage: SendFn): void;  // 强制发送
}
```

## 文件结构

```
src/
├── slash-command/                    # 斜杠命令通用框架（新建）
│   ├── types.ts                      # 类型定义
│   ├── schema.ts                     # COMMAND.md 验证
│   ├── registry.ts                   # 命令注册表
│   ├── loader.ts                     # 从文件系统加载
│   └── index.ts                      # 统一导出
│
├── acp-session/                      # ACP 会话管理（新建）
│   ├── types.ts                      # 类型定义
│   ├── session.ts                    # AcpSession 类
│   ├── manager.ts                    # AcpSessionManager 类
│   ├── output.ts                     # AcpWeixinOutput 流式输出
│   └── index.ts                      # 统一导出
│
├── bridge/
│   └── weixin-bridge.ts              # 修改：增加 SlashCommandRouter 前置拦截
│
└── acp/                              # 现有 ACP 模块（复用）
    ├── client.ts                     # AcpClient
    ├── connection.ts                 # AcpConnection
    ├── handlers.ts                   # 权限处理等
    └── types.ts                      # 类型定义
```

## 测试

### 斜杠命令模块

- `SlashCommandRegistry` — 注册/查询/移除命令
- `SlashCommandLoader` — 加载有效命令目录、跳过无效目录、路径安全检查
- COMMAND.md schema 验证

### ACP 会话模块

- `AcpSessionManager` — 创建/获取/结束会话
- 超时检查和自动清理
- `AcpWeixinOutput` — 累积发送逻辑、超时刷出、前缀拼接
- 多用户隔离（不同 userId 独立会话）

### WeixinBridge 集成

- 斜杠命令优先于 AgentScope 执行
- `/acp /path` 正确进入 ACP 模式
- 非斜杠命令消息仍然走 AgentScope 流程

## 环境变量

无新增环境变量。ACP 使用已有的 `qwen` CLI（通过 PATH 查找）。

## 后续扩展

- Web 管理页面展示活跃的 ACP 会话
- 更多斜杠命令（如 `/skill`、`/status` 等）只需在 `~/.ownclaw/commands/` 下添加目录
- ACP 会话持久化（跨重启恢复）
