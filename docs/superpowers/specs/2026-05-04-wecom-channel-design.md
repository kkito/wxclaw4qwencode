# 企业微信 Channel 集成设计

## 概述

在 OwnClaw 中新增企业微信作为并行消息通道，与现有个人微信通道共存。来自企业微信的消息通过企业微信回复，个人微信的消息通过个人微信回复。两个 Channel 各自拥有独立的 AgentScope Agent 实例，对话历史完全隔离。

## 架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 企业微信模式 | Bot 模式（WebSocket） | 配置简单，原生支持流式推送 |
| Agent 实例 | 每个 Channel 独立 Agent | 对话历史隔离，互不干扰 |
| AI 模型配置 | 共享环境变量 | 无需为不同 Channel 设置不同模型 |
| 实现方式 | 直接调用 @wecom/aibot-node-sdk | 插件层依赖 OpenClaw 框架，不适合直接调用 |
| 架构模式 | Channel 接口 + 并行运行时 | 清晰扩展路径，最小侵入现有代码 |
| ACP 支持 | 两个 Channel 共享 AcpSessionManager | ACP 是 per-user 的，不绑定特定 Channel |

## 整体架构

```
start-all.ts（主进程）
├── 子进程 [WeChat] → start.ts → AgentRunner(微信) → WeixinBridge（ilink 长轮询）
├── 子进程 [WeCom]  → start-wecom.ts → AgentRunner(企微) → WecomBridge（aibot SDK WebSocket）
└── 子进程 [Web]    → start-web.ts → Hono 服务器（设置页面 + API）
```

### 数据流

```
企业微信用户发消息
  │
  ▼
WSClient.on('message')  ← @wecom/aibot-node-sdk
  │
  ▼
WecomBridge.handleMessage()
  ├── 检查 ACP session（共享 AcpSessionManager）
  │   ├── 有活跃 session → 路由到 ACP
  │   └── exit 命令 → 结束 ACP session
  ├── 检查斜杠命令（共享 SlashCommandRegistry）
  │   └── /acp, /streaming 等 → 执行命令 handler
  ├── 普通消息 → AgentScope Agent.reply()
  └── 回复 → wsClient.replyStreamNonBlocking() 流式推送
```

## 配置系统

### 存储结构

配置存储在 `~/.ownclaw/config.json`：

```json
{
  "sendThrottleIntervalMs": 2000,
  "channel": {
    "weixin": { "enabled": true },
    "wecom": {
      "enabled": false,
      "botId": "",
      "secret": ""
    }
  }
}
```

### 配置加载

现有 `src/config.ts` 负责环境变量验证，`src/config-store.ts` 负责文件存储读取。新增 `channel` 字段的 Zod schema 验证。

## Channel 接口

```typescript
// src/channel/channel-bridge.ts
interface ChannelBridge {
  /** 启动 Channel（连接/监听） */
  start(): Promise<void>;
  /** 停止 Channel */
  stop(): Promise<void>;
  /** 发送文本回复 */
  sendReply(params: { to: string; text: string }): Promise<void>;
  /** 消息到达回调（由 AgentRunner 注册） */
  onMessage(callback: (msg: ChannelMessage) => Promise<void>): void;
}
```

## 消息类型统一

```typescript
// src/channel/types.ts
interface ChannelMessage {
  from: string;
  to: string;
  text: string;
  raw: unknown;
  channelType: 'weixin' | 'wecom';
}
```

## WecomBridge 实现

### 依赖

- `@wecom/aibot-node-sdk` — WebSocket 连接、消息收发、流式回复
- AgentScope Agent — AI 处理
- AcpSessionManager — ACP 模式管理（与微信共享）
- SlashCommandRegistry — 斜杠命令（与微信共享）

### 核心方法

| 方法 | 说明 |
|------|------|
| `connect()` | 创建 WSClient，建立 WebSocket 连接 |
| `handleMessage(wecomMsg)` | 消息路由：ACP → 斜杠命令 → Agent |
| `sendReply(userId, text)` | 通过 wsClient.reply() 发送 |
| `sendReplyStreaming(userId, text, finish, streamId)` | 通过 wsClient.replyStreamNonBlocking() 流式推送 |
| `extractText(wecomMsg)` | 从企业微信消息格式提取文本 |
| `convertToAgentScopeMsg(wecomMsg)` | 转换为 AgentScope Msg 格式 |

### 流式回复流程

```
1. 收到用户消息 → handleMessage()
2. 发送 thinking 占位（普通回复）
3. AgentScope Agent.reply({ stream: true }) 流式调用
4. 每次迭代输出 → sendReplyStreaming(content, finish=false)
5. 迭代结束 → sendReplyStreaming(finalContent, finish=true)
```

### ACP 支持

`WecomBridge.handleMessage()` 复用与 `WeixinBridge` 相同的路由逻辑：

1. 检查 `AcpSessionManager.hasActiveSession(userId)`
2. 如果是 ACP 消息 → `AcpSessionManager.sendMessage()`
3. exit 命令 → `AcpSessionManager.endSession()`
4. 斜杠命令 → `SlashCommandRegistry`
5. 普通消息 → AgentScope Agent

两个 Bridge 共享同一个 `AcpSessionManager` 实例，通过 userId 区分用户（企业微信 userId 格式与个人微信不同，不会冲突）。

### 错误处理

| 场景 | 处理方式 |
|------|----------|
| WebSocket 断开 | WSClient 自带自动重连 |
| Bot ID / Secret 错误 | 启动时验证，失败则不启动 Channel |
| ACP session 超时 | 共享的 AcpSessionManager 定时检查 |
| AgentScope Agent 崩溃 | 各自独立，互不影响 |

## Web 设置页面

### 页面布局

在现有 `/settings` 页面新增「企业微信通道」区块：

```
设置
├── 发送限流（现有）
├── ACP 模式（现有）
└── 企业微信通道（新增）
    ├── [开关] 启用企业微信
    ├── Bot ID: [___________]
    ├── Secret:  [___________] (password input)
    ├── [保存]
    └── 状态：未连接 / 已连接 / 连接中
```

### 数据流

```
GET /settings → 读取 config.json → channel.wecom 配置填入表单
POST /settings → 验证表单 → 写入 config.json
```

### API 路由

- `GET /api/settings/channel` — 获取 channel 配置
- `PUT /api/settings/channel` — 更新 channel 配置

## 子进程启动

### start-wecom.ts

新建企业微信子进程入口：

```
start-wecom.ts
  ├── 读取环境变量 → AGENT_MODEL_BASE_URL / AGENT_MODEL_API_KEY / AGENT_MODEL_NAME / AGENT_SYS_PROMPT
  ├── 读取 config.json → channel.wecom.botId / secret
  ├── 创建 WSClient(botId, secret) → 连接企业微信 WebSocket
  ├── 创建 CustomModel(环境变量) → 共享同一 AI 模型配置
  ├── 创建 AgentRunner(企微) → 独立 Agent 实例（独立对话历史）
  ├── 创建 WecomBridge
  └── 启动消息监听
```

> 注：两个 Channel 共享相同的模型环境变量（AGENT_MODEL_*），但各自有独立的 Agent 实例和对话历史。企业微信的凭证（botId/secret）仅从 config.json 读取，不通过环境变量传递。

### start-all.ts 变更

在现有的微信 + Web 子进程基础上，新增：

```typescript
if (config.channel?.wecom?.enabled) {
  spawn process: start-wecom.ts
}
```

## 文件变更清单

| 文件 | 变更 | 说明 |
|------|------|------|
| `src/config.ts` | 修改 | 新增 `channel.wecom` Zod schema |
| `src/config-store.ts` | 修改 | 支持 `channel` 嵌套结构读写 |
| `src/channel/channel-bridge.ts` | **新建** | ChannelBridge 接口定义 |
| `src/channel/types.ts` | **新建** | ChannelMessage 等通用类型 |
| `src/channel/wecom-bridge.ts` | **新建** | 企业微信 Bridge 实现 |
| `src/start-wecom.ts` | **新建** | 企业微信子进程入口 |
| `src/start-all.ts` | 修改 | 新增启动 wecom 子进程 |
| `src/web/views/settings.tsx` | 修改 | 新增企业微信配置区域 |
| `src/web/server.tsx` | 修改 | 新增 channel 配置 API 路由 |

## 依赖变更

| 包 | 操作 | 版本 | 用途 |
|---|------|------|------|
| `@wecom/aibot-node-sdk` | 新增 | ^1.0.6 | 企业微信 WebSocket SDK |

## 测试策略

| 测试内容 | 类型 |
|----------|------|
| WecomBridge.extractText() | 单元测试 — 企业微信消息格式转文本 |
| WecomBridge 消息路由 | 单元测试 — ACP → 斜杠命令 → Agent 优先级 |
| 配置验证 schema | 单元测试 — channel.wecom 字段验证 |
| 设置页面 API | 集成测试 — CRUD 操作 |

## 扩展性

未来新增 Channel（如 Telegram、Discord）只需：

1. 实现 `ChannelBridge` 接口
2. 新建 `start-<channel>.ts` 子进程入口
3. 在 `config-store.ts` 中添加配置字段
4. 在设置页面中添加配置区块
