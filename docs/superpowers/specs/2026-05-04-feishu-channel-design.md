# 飞书 Channel 集成设计

## 概述

在 OwnClaw 中新增飞书作为并行消息通道，与现有个人微信、企业微信通道共存。来自飞书的消息通过飞书回复，各 Channel 拥有独立的 Agent 实例，对话历史完全隔离。

## 架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 飞书模式 | 企业自建应用（WebSocket） | 配置简单，无需公网回调，SDK 自带断线重连 |
| Agent 实例 | 每个 Channel 独立 Agent | 对话历史隔离，互不干扰 |
| 共享组件 | AcpSessionManager + SlashCommandRegistry | 通过 `open_id` 区分用户，避免重复初始化 |
| AI 模型配置 | 共享环境变量 | 无需为不同 Channel 设置不同模型 |
| 实现方式 | 独立 Bridge + SDK 调用 | 与现有 WeixinBridge、WecomBridge 架构一致 |
| 流式输出 | 飞书流式卡片（Stream Card） | 利用飞书卡片 JSON 动态更新，支持丰富展示 |
| 凭证存储 | config.json + Web 设置页面 | 与企微一致，支持动态配置 |
| 消息类型 | 仅支持文本 | 非文本消息返回提示，与微信实现一致 |
| 实现顺序 | 先企微后飞书 | 复用已验证的架构模式 |

## 整体架构

```
start-all.ts（主进程）
├── 子进程 [WeChat]  → start.ts → AgentRunner(微信) → WeixinBridge（ilink 长轮询）
├── 子进程 [WeCom]   → start-wecom.ts → AgentRunner(企微) → WecomBridge（aibot SDK WebSocket）
├── 子进程 [Feishu]  → start-feishu.ts → FeishuBridge（LarkWSClient WebSocket）
└── 子进程 [Web]     → start-web.ts → Hono 服务器（设置页面 + API）
```

### 数据流

```
飞书用户发消息（单聊或群聊 @bot）
  │
  ▼
LarkWSClient.on('im.message.receive_v1')  ← @larksuiteoapi/node-sdk
  │
  ▼
FeishuBridge.handleMessage()
  ├── 提取文本（仅支持文本消息，其他类型返回提示）
  ├── 检查 ACP session（共享 AcpSessionManager，通过 open_id 区分）
  │   ├── 有活跃 session → 路由到 ACP
  │   └── exit 命令 → 结束 ACP session
  ├── 检查斜杠命令（共享 SlashCommandRegistry）
  │   └── /acp, /streaming 等 → 执行命令 handler
  ├── 普通消息 → 独立 Agent 实例（独立对话历史）
  └── 回复 → Lark API 发送流式卡片 / 更新消息
```

### 组件共享关系

| 组件 | 共享/独立 | 说明 |
|------|-----------|------|
| `AcpSessionManager` | **共享** | 通过 `open_id` 区分用户，不跨 Channel 冲突 |
| `SlashCommandRegistry` | **共享** | 命令定义统一，handler 不绑定特定 Channel |
| `CustomModel` | **共享** | 同一 AI 模型配置（环境变量） |
| `Agent` 实例 | **独立** | 每个 Channel 独立对话历史 |
| `SkillsManager` | **共享** | Skills 定义与 Channel 无关 |
| SDK 客户端 | **独立** | 各自连接各自的 WebSocket |

## 配置系统

### 存储结构（`~/.ownclaw/config.json`）

```json
{
  "sendThrottleIntervalMs": 2000,
  "channel": {
    "weixin": { "enabled": true },
    "wecom": {
      "enabled": false,
      "botId": "",
      "secret": ""
    },
    "feishu": {
      "enabled": false,
      "appId": "",
      "appSecret": ""
    }
  }
}
```

### 配置加载

- **现有** `src/config.ts`：环境变量验证（`AGENT_MODEL_BASE_URL` 等），不变
- **修改** `src/config-store.ts`：扩展 Zod schema 增加 `channel.feishu` 验证
- 飞书凭证**仅从 config.json 读取**，不通过环境变量传递

### Web 设置页面（`/settings` 统一通道配置区块）

```
设置
├── 发送限流（现有）
├── ACP 模式（现有）
└── 消息通道配置（统一区块）
    ├── 个人微信
    │   └── [开关] 启用
    ├── 企业微信
    │   ├── [开关] 启用
    │   ├── Bot ID:     [___________]
    │   ├── Secret:     [___________] (password input)
    │   └── 状态：未连接 / 已连接
    └── 飞书
        ├── [开关] 启用
        ├── App ID:     [___________]
        ├── App Secret: [___________] (password input)
        └── 状态：未连接 / 已连接
```

### API 路由

复用已有的 `/api/settings` 路由，配置结构自动扩展支持 `channel.feishu`

## FeishuBridge 实现

### 依赖

- `@larksuiteoapi/node-sdk` — WebSocket 连接、消息收发、卡片更新
- AgentScope Agent — AI 处理（独立实例）
- AcpSessionManager — ACP 模式管理（与微信/企微共享）
- SlashCommandRegistry — 斜杠命令（与微信/企微共享）

### 核心方法

| 方法 | 说明 |
|------|------|
| `connect()` | 创建 `LarkWSClient`，绑定事件监听，建立 WebSocket 连接 |
| `handleMessage(feishuMsg)` | 消息路由：ACP → 斜杠命令 → Agent |
| `sendReply(openId/chatId, text)` | 通过 `client.im.message.create()` 发送文本消息 |
| `sendReplyStreaming(messageId, content, done)` | 通过卡片 API 动态更新 JSON 实现流式效果 |
| `extractText(feishuMsg)` | 从飞书消息格式提取文本，仅支持文本消息 |
| `convertToAgentScopeMsg(feishuMsg)` | 转换为 AgentScope `Msg` 格式 |

### 消息格式处理

飞书消息通过 `im.message.receive_v1` 事件推送：

```typescript
interface FeishuMessageEvent {
  message: {
    message_id: string;
    chat_type: 'p2p' | 'group';
    message_type: 'text' | 'image' | 'file' | 'audio' | ...;
    content: string;  // JSON 字符串，如 '{"text":"你好"}'
    chat_id?: string;
  };
  sender: {
    sender_id: {
      open_id: string;
    };
  };
}
```

**文本提取逻辑**：

```typescript
extractText(msg: FeishuMessageEvent): string | null {
  if (msg.message.message_type !== 'text') {
    return '暂不支持此消息类型，请发送文本。';
  }
  const content = JSON.parse(msg.message.content);
  return content.text;
}
```

### 流式卡片实现

```
1. 收到用户消息 → handleMessage()
2. 发送初始卡片（thinking 状态）
   └─ 卡片 JSON: { "elements": [{ "tag": "markdown", "content": "思考中..." }] }
3. AgentScope Agent.reply({ stream: true }) 流式调用
4. 每次迭代输出 → 更新卡片 JSON content 字段
   └─ 使用 `client.im.message.patch()` 更新消息
5. 迭代结束 → 最终更新卡片，标记完成
```

### ACP 支持

与 WeixinBridge、WecomBridge 共享同一个 `AcpSessionManager`：

1. 检查 `AcpSessionManager.hasActiveSession(openId)`
2. 如果是 ACP 消息 → `AcpSessionManager.sendMessage()`
3. exit 命令 → `AcpSessionManager.endSession()`
4. 斜杠命令 → `SlashCommandRegistry`
5. 普通消息 → 独立 Agent 实例

**关键点**：通过 `open_id` 区分用户，飞书的 `open_id` 与微信/企微的用户 ID 格式不同，不会冲突。

### 错误处理

| 场景 | 处理方式 |
|------|----------|
| WebSocket 断开 | `LarkWSClient` 自带自动重连 |
| App ID / Secret 错误 | 启动时验证，失败则不启动 Channel |
| ACP session 超时 | 共享的 AcpSessionManager 定时检查 |
| Agent 崩溃 | 独立实例，不影响其他 Channel |
| 卡片更新失败 | 降级为发送新文本消息 |

## 子进程启动

### `start-feishu.ts` 入口

```typescript
import { LarkWSClient } from '@larksuiteoapi/node-sdk';
import { readConfig } from './config-store.js';
import { createCustomModel } from './model/custom-model.js';
import { FeishuBridge } from './channel/feishu-bridge.js';
import { AcpSessionManager } from './acp-session/manager.js';
import { SlashCommandRegistry } from './commands/registry.js';

async function main() {
  const appConfig = await readConfig();
  const feishuConfig = appConfig.channel.feishu;

  const client = new LarkWSClient({
    appId: feishuConfig.appId,
    appSecret: feishuConfig.appSecret,
  });

  const model = createCustomModel();
  const acpManager = new AcpSessionManager(client);
  const slashCommands = new SlashCommandRegistry();
  const agent = createAgent(model);

  const bridge = new FeishuBridge(client, agent, acpManager, slashCommands);
  await bridge.connect();
  setupGracefulExit(bridge);
}

main();
```

### `start-all.ts` 变更

```typescript
const config = await readConfig();

// 现有
const wechatProc = spawn('node', ['dist/start.js']);
const webProc = spawn('node', ['dist/start-web.js']);

// 企微（已有）
if (config.channel?.wecom?.enabled) {
  // spawn wecom
}

// 飞书（新增，开关与配置统一）
if (config.channel?.feishu?.enabled && config.channel.feishu.appId && config.channel.feishu.appSecret) {
  const feishuProc = spawn('node', ['dist/start-feishu.js'], {
    env: { ...process.env, PREFIX: '[Feishu]' }
  });
  prefixStream(feishuProc.stdout, '[Feishu]');
  prefixStream(feishuProc.stderr, '[Feishu ERR]');
}
```

## 文件变更清单

| 文件 | 变更 | 说明 |
|------|------|------|
| `src/config-store.ts` | 修改 | 新增 `channel.feishu` Zod schema 验证 |
| `src/channel/feishu-bridge.ts` | **新建** | 飞书 Bridge 实现 |
| `src/start-feishu.ts` | **新建** | 飞书子进程入口 |
| `src/start-all.ts` | 修改 | 新增启动 feishu 子进程 |
| `src/web/views/settings.tsx` | 修改 | 新增飞书配置区域（与企微统一区块） |
| `src/web/server.tsx` | 修改 | 配置 API 自动扩展（如需要） |

## 依赖变更

| 包 | 操作 | 版本 | 用途 |
|---|------|------|------|
| `@larksuiteoapi/node-sdk` | 新增 | latest | 飞书 WebSocket 连接、消息收发、卡片更新 |

## 测试策略

| 测试内容 | 类型 |
|----------|------|
| FeishuBridge.extractText() | 单元测试 — 飞书消息格式转文本 |
| FeishuBridge 消息路由 | 单元测试 — ACP → 斜杠命令 → Agent 优先级 |
| 飞书配置验证 schema | 单元测试 — channel.feishu 字段验证 |
| 设置页面 API | 集成测试 — CRUD 操作 |

## 扩展性

未来新增 Channel（如 Telegram、Discord）只需：

1. 实现独立 Bridge 类（与现有架构一致）
2. 新建 `start-<channel>.ts` 子进程入口
3. 在 `config-store.ts` 中添加配置字段
4. 在设置页面中添加配置区块（统一通道区块）
