# WebSocket Channel 文档

OwnClaw 提供基于 WebSocket 的消息通道，与微信/飞书/企微通道并列，允许外部客户端通过 WebSocket 与 AI Agent 交互。

## 快速开始

### 连接地址

```
ws://localhost:3526/<clientId>
```

- `<clientId>` 为客户端标识符，用于区分多个连接。如果省略，服务器会随机生成一个 UUID。
- 示例：`ws://localhost:3526/user123`

### 启动方式

WebSocket Channel 随 `start.ts` 一起启动，默认监听 `0.0.0.0:3526`。

```bash
pnpm run build
node dist/start.js
```

启动日志中会显示：
```
🔌 WebSocket Channel 已启动 (ws://0.0.0.0:3526)
```

## 消息协议

### 客户端 → 服务器（发送消息）

**格式**：JSON 文本帧

```json
{
  "text": "你好，请帮我查一下天气"
}
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `text` | string | 是 | 用户输入的文本消息 |

**示例**（浏览器端）：

```javascript
const ws = new WebSocket('ws://localhost:3526/my-client');

ws.onopen = () => {
  ws.send(JSON.stringify({ text: '你好' }));
};
```

### 服务器 → 客户端（接收回复）

**格式**：JSON 文本帧

```json
{
  "text": "你好！我是 OwnClaw AI 助手，有什么可以帮你的？"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `text` | string | AI Agent 处理后的回复文本 |

**接收示例**：

```javascript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('AI 回复:', data.text);
};
```

## API 参考

### `WebSocketChannel` 类

实现 `ChannelBridge` 接口，与微信/飞书通道并列。

#### 构造函数

```ts
new WebSocketChannel(options?: WebSocketChannelOptions)
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `options.port` | number | `3526` | 监听端口 |
| `options.host` | string | `'0.0.0.0'` | 监听地址 |

#### `start(): Promise<void>`

启动 WebSocket 服务器，开始接受连接。

#### `stop(): Promise<void>`

关闭服务器，断开所有已连接客户端。

#### `sendReply(params): Promise<void>`

向指定客户端发送回复。

| 参数 | 类型 | 说明 |
|------|------|------|
| `params.to` | string | 目标 clientId |
| `params.text` | string | 回复文本 |

**示例**：
```ts
await wsChannel.sendReply({ to: 'user123', text: '你好！' });
```

#### `onMessage(callback): void`

注册消息回调，当收到客户端消息时触发。

```ts
wsChannel.onMessage(async (msg) => {
  console.log('收到消息:', msg.text, 'from:', msg.from);
});
```

回调参数 `msg` 为 `ChannelMessage` 类型：

| 字段 | 类型 | 说明 |
|------|------|------|
| `from` | string | 发送方 clientId |
| `to` | string | 固定为 `'websocket'` |
| `text` | string | 消息文本 |
| `raw` | object | 原始 JSON 对象 |
| `channelType` | string | `'websocket'` |

#### `getClientCount(): number`

获取当前已连接的客户端数量。

#### `broadcast(text: string): void`

向所有已连接客户端广播消息。

```ts
wsChannel.broadcast('系统通知：服务即将重启');
```

## 消息流转流程

```
客户端 (WebSocket)
    ↓ { text: "你好" }
WebSocketChannel.onMessage
    ↓ ChannelMessage
WeixinBridge.handleMessage (复用现有消息处理管线)
    ↓
AgentScope Agent 处理
    ↓
WeixinBridge.sendReply
    ↓
WebSocketChannel.sendReply({ to: clientId, text: "..." })
    ↓
客户端 (WebSocket) ← { text: "..." }
```

## 测试页面

OwnClaw 内置了一个 WebSocket 测试页面，可通过 Web 服务器访问：

```
http://localhost:3525/ws
```

该页面提供：
- 连接/断开按钮
- 消息发送输入框
- 实时消息日志显示

## 多客户端支持

多个客户端可同时连接，每个客户端通过 URL path 区分身份：

| 连接地址 | clientId |
|----------|----------|
| `ws://localhost:3526/alice` | `alice` |
| `ws://localhost:3526/bob` | `bob` |
| `ws://localhost:3526/` | 自动生成 UUID |

AI 的回复会根据 `clientId` 路由回对应的客户端。

## 注意事项

1. **空消息忽略**：客户端发送的 JSON 中如果没有 `text` 字段或为空，服务器会忽略
2. **断开重连**：客户端断开后需要重新建立连接，服务器不会自动重连
3. **端口安全**：默认监听 `0.0.0.0`，如需限制访问可修改 `host` 参数
