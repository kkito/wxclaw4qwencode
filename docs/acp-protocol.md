# ACP (Agent Client Protocol) 协议文档

基于 `@agentclientprotocol/sdk@0.21.0` 整理，重点关注与 `qwen --acp` 交互相关的核心协议。

---

## 协议概述

ACP 是 Client（本项目）与 Agent（`qwen --acp`）之间的标准化通信协议，基于 JSON-RPC over stdio（ndJsonStream）实现。

```
Client (OwnClaw)  ←── ndJsonStream ──→  Agent (qwen --acp)
```

核心交互流程：

```
1. initialize        →  协商协议版本和能力
2. newSession        →  创建会话，获取 sessionId
3. prompt            →  发送用户消息
   ├─ SessionUpdate 事件流（实时推送中间状态）
   └─ PromptResponse（最终响应，含 stopReason）
```

---

## 一、SessionUpdate 事件（核心关注点）

**这是流式输出事件**，在 `prompt` 方法执行期间，Agent 持续向 Client 推送实时更新。

### 事件类型一览

| `sessionUpdate` 值 | 关联类型 | 含义 | 本项目处理策略 |
|---|---|---|---|
| `agent_message_chunk` | ContentChunk | **Agent 回复内容** | ✅ 缓冲后发送到微信 |
| `agent_thought_chunk` | ContentChunk | Agent 思考内容 | ❌ 不发送到微信，仅终端日志 |
| `tool_call` | ToolCall | 工具调用开始 | ❌ 不发送到微信，仅终端日志 |
| `tool_call_update` | ToolCallUpdate | 工具调用进度/结果 | ❌ 不发送到微信，仅终端日志 |
| `plan` | Plan | 执行计划更新 | ❌ 终端日志 |
| `current_mode_update` | CurrentModeUpdate | 当前模式变更 | ❌ 终端日志 |
| `user_message_chunk` | ContentChunk | 用户消息块 | 忽略 |
| `available_commands_update` | AvailableCommandsUpdate | 可用命令列表更新 | 忽略 |
| `config_option_update` | ConfigOptionUpdate | 配置选项更新 | 忽略 |
| `session_info_update` | SessionInfoUpdate | 会话信息更新 | 忽略 |
| `usage_update` | UsageUpdate | Token 使用量更新 | 在最终结果中展示 |

### ContentChunk 结构

```typescript
{
  sessionUpdate: "agent_message_chunk" | "agent_thought_chunk" | "user_message_chunk";
  content: ContentBlock;      // 实际内容
  messageId?: string;         // 消息 ID (UUID)，变更表示新消息开始
}
```

**ContentBlock 格式**：

```typescript
{
  type: "text";               // 文本类型
  text: string;               // 文本内容（增量）
}
```

> ⚠️ **重要**：`agent_message_chunk` 中的 `text` 是**增量内容**，不是完整消息。Client 需要自行累积拼接。

### SessionNotification 包装

所有 SessionUpdate 通过 `session/update` 通知推送，包装格式：

```typescript
{
  sessionId: string;          // 所属会话
  update: SessionUpdate;      // 实际更新（联合类型）
}
```

---

## 二、StopReason（核心关注点）

**StopReason 不在 SessionUpdate 中告知**，而是在 `prompt` 方法的**最终响应**中返回。

### 调用关系

```
prompt 调用 ──→ Agent 处理中 ──→ 持续发送 SessionUpdate 事件
                                    │
                                    └─→ 处理完成后返回 PromptResponse（一次性）
```

`prompt` 方法返回一个 `Promise<PromptResponse>`，其中包含 `stopReason`。

### StopReason 枚举

| 值 | 含义 | 触发场景 | 本项目处理 |
|---|---|---|---|
| `end_turn` | **正常完成** | Agent 完成回复，等待下一条消息 | ✅ 显示完成提示 |
| `max_tokens` | 达到 token 限制 | 输出长度超过模型最大限制 | 提示用户 |
| `max_turn_requests` | 达到最大轮次 | 多轮对话达到上限 | 提示用户 |
| `refusal` | 拒绝执行 | 安全策略或内容审核拒绝 | 提示用户 |
| `cancelled` | 取消 | Client 发送 `session/cancel` 后 Agent 响应 | 内部处理 |

### PromptResponse 完整结构

```typescript
{
  stopReason: StopReason;         // 停止原因（必填）
  usage?: {                       // Token 使用量
    input_tokens: number;
    output_tokens: number;
  };
  userMessageId?: string;         // 确认的用户消息 ID
}
```

---

## 三、Prompt 完整流程

### 3.1 请求

```typescript
{
  sessionId: string;
  prompt: ContentBlock[];         // 用户消息内容
}
```

**ContentBlock 类型**：

| `type` | 说明 | 支持情况 |
|---|---|---|
| `text` | 文本 | ✅ 必须支持 |
| `resource_link` | 资源链接 | ✅ 支持 |
| `image` | 图片 | 可选 |
| `audio` | 音频 | 可选 |
| `resource` | 嵌入资源 | 可选 |

### 3.2 过程

Agent 在处理 prompt 期间，通过 `session/update` 通知推送 SessionUpdate 事件：

```
session/update → { sessionId, update: { sessionUpdate: "agent_message_chunk", ... } }
session/update → { sessionId, update: { sessionUpdate: "tool_call", ... } }
session/update → { sessionId, update: { sessionUpdate: "tool_call_update", ... } }
...
```

### 3.3 结果

`prompt` 方法返回 `PromptResponse`，标志着整个 prompt 轮次**结束**。

```typescript
const response = await connection.prompt({
  sessionId: "xxx",
  prompt: [{ type: "text", text: "用户消息" }]
});

console.log(response.stopReason);  // "end_turn"
console.log(response.usage);       // { input_tokens: 1234, output_tokens: 567 }
```

---

## 四、权限请求（RequestPermission）

当 Agent 需要执行敏感操作（如文件写、命令执行）时，向 Client 请求用户授权。

### 请求

```typescript
{
  toolName: string;           // 工具名称
  toolInput: unknown;         // 工具输入
  options: [
    { optionId: "allow_once", label: "允许一次" },
    { optionId: "allow_always", label: "总是允许" },
    { optionId: "deny", label: "拒绝" }
  ]
}
```

### 响应

```typescript
// 同意
{ outcome: { outcome: "selected", optionId: "allow_once" } }

// 拒绝
{ outcome: { outcome: "cancelled" } }
```

> 本项目中 `autoApprove=true` 时优先选择 `allow_once` 选项。

---

## 五、会话生命周期方法

| 方法 | 说明 |
|---|---|
| `initialize` | 协议握手，交换能力 |
| `newSession` | 创建会话 |
| `prompt` | 发送消息（含流式事件 + 最终响应） |
| `cancel` | 取消正在进行的 prompt |
| `closeSession` | 关闭会话 |

### Initialize 握手

```typescript
// Request
{ protocolVersion: 1, clientCapabilities: {} }

// Response
{ protocolVersion: 1, agentCapabilities: {...} }
```

### NewSession

```typescript
// Request
{ cwd: "/path/to/project", mcpServers: [] }

// Response
{ sessionId: "session-xxx", configOptions?: [...] }
```

### Cancel

Client 发送 `session/cancel` 通知后，Agent 必须：
1. 立即停止所有 LLM 请求
2. 中止所有进行中的工具调用
3. 发送待处理的 `session/update` 通知
4. 以 `stopReason: "cancelled"` 响应原始 `prompt` 请求

---

## 六、协议通信机制

### 传输层

- 基于 stdio 的 **ndJsonStream**（换行分隔的 JSON 流）
- 每条消息是一个 JSON 对象，以 `\n` 分隔

### 消息类型

| 类型 | 方向 | 说明 |
|---|---|---|
| Request | Client → Agent | 需要响应的调用（如 `prompt`、`newSession`） |
| Response | Agent → Client | 对应 Request 的结果 |
| Notification | Agent → Client | 单向通知（如 `session/update`） |

### 扩展机制

```typescript
// 自定义请求
extMethod(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>>

// 自定义通知
extNotification(method: string, params: Record<string, unknown>): Promise<void>
```

---

## 七、关键文件索引

| 文件 | 职责 |
|------|------|
| `src/acp/client.ts` | AcpClient 主类，封装 prompt/sendMessage 等高层 API |
| `src/acp/connection.ts` | 子进程连接管理，ndJsonStream 通信 |
| `src/acp/handlers.ts` | sessionUpdate / requestPermission 回调处理 |
| `src/acp/output.ts` | 终端输出格式化 |
| `src/acp-session/output.ts` | ACP 流式输出 → 微信消息适配器 |

## 官方文档

- [协议概览](https://agentclientprotocol.com/protocol/overview)
- [初始化](https://agentclientprotocol.com/protocol/initialization)
- [内容模型](https://agentclientprotocol.com/protocol/content)
- [Prompt 轮次](https://agentclientprotocol.com/protocol/prompt-turn)
- [停止原因](https://agentclientprotocol.com/protocol/prompt-turn#stop-reasons)
- [工具调用权限](https://agentclientprotocol.com/protocol/tool-calls)
- [取消操作](https://agentclientprotocol.com/protocol/prompt-turn#cancellation)
