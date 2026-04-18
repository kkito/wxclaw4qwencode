# 微信 + AgentScope 集成设计文档

## 1. 目标

实现 AgentScope 作为 AI 引擎处理微信消息的完整集成：
- 接收微信消息 → 转换为 AgentScope 消息格式 → Agent 处理 → 发送回复给微信用户

## 2. 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        消息流                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   微信用户 ──▶ openclaw-weixin ──▶ WeixinBridge ──▶ AgentScope  │
│                         (接收消息)         (格式转换)       (AI 处理)  │
│                                                                  │
│   微信用户 ◀── openclaw-weixin ◀── WeixinBridge ◀── AgentScope  │
│                         (发送消息)         (格式转换)       (回复)    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 核心组件

| 组件 | 职责 |
|------|------|
| `WeixinBridge` | 消息格式转换：微信 ↔ AgentScope |
| `CustomModel` | 自定义 baseUrl 的模型客户端 |
| `AgentRunner` | AgentScope Agent 生命周期管理 |

## 3. 数据转换

### 3.1 微信消息 → AgentScope 消息

```typescript
// 微信消息 (WeixinMessage)
{
  from_user_id: "user123",
  item_list: [{ type: 1, content: "你好" }]
}

// AgentScope 消息 (Msg)
{
  name: "user123",
  role: "user",
  content: [{ type: 'text', text: "你好", id: "uuid" }]
}
```

### 3.2 AgentScope 回复 → 微信消息

```typescript
// AgentScope 回复
{
  name: "assistant",
  role: "assistant", 
  content: [{ type: 'text', text: "你好，我是 AI 助手" }]
}

// 微信发送
sendMessageWeixin({ to: "user123", text: "你好，我是 AI 助手" })
```

## 4. 组件设计

### 4.1 CustomModel (src/model/custom-model.ts)

```typescript
import { ChatModelBase, CallParams, ChatResponse } from '@agentscope-ai/agentscope';

export class CustomModel implements ChatModelBase {
  modelName: string;
  stream: boolean;
  
  constructor(config: {
    modelName: string;
    baseUrl: string;
    apiKey?: string;
  });
  
  call(params: CallParams): Promise<ChatResponse> | AsyncGenerator<ChatResponse>;
  callStructured(params: CallParams & { schema: z.ZodType }): Promise<ChatResponse>;
  countTokens(params: CountTokensParams): Promise<number>;
}
```

### 4.2 WeixinBridge (src/bridge/weixin-bridge.ts)

```typescript
import { Agent } from '@agentscope-ai/agentscope';
import { WeixinMessage } from '@tencent-weixin/openclaw-weixin';

export class WeixinBridge {
  constructor(
    private agent: Agent,
    private sendMessage: (to: string, text: string) => Promise<void>
  ) {}
  
  // 处理接收到的微信消息
  async handleMessage(weixinMsg: WeixinMessage): Promise<void>;
  
  // 微信消息 → AgentScope 消息
  private convertToMsg(weixinMsg: WeixinMessage): Msg;
  
  // AgentScope 回复 → 发送微信消息
  private async sendReply(toUserId: string, reply: Msg): Promise<void>;
}
```

### 4.3 AgentRunner (src/runner/agent-runner.ts)

```typescript
import { Agent } from '@agentscope-ai/agentscope';
import { CustomModel } from '../model/custom-model';
import { WeixinBridge } from '../bridge/weixin-bridge';

export class AgentRunner {
  private agent: Agent;
  private bridge: WeixinBridge;
  
  constructor(config: {
    model: { baseUrl: string; apiKey?: string; modelName: string };
    sysPrompt: string;
    weixin: { sendMessage: (to: string, text: string) => Promise<void> };
  });
  
  async start(): Promise<void>;
  async stop(): Promise<void>;
}
```

## 5. 配置

通过 `openclaw.json` 或环境变量配置：

```json
{
  "agentscope": {
    "model": {
      "type": "custom",
      "baseUrl": "https://api.example.com/v1",
      "apiKey": "${API_KEY}",
      "modelName": "gpt-4o"
    },
    "sysPrompt": "你是一个友好的 AI 助手，请用简洁的语言回复用户。"
  }
}
```

## 6. 媒体处理

简单实现阶段：
- 文本消息：完整处理
- 图片/语音/文件：暂不处理（可返回提示"暂不支持此类型消息"）

后续扩展：
- 图片：下载后转为 base64 或图片 URL
- 语音：转文字后处理

## 7. 错误处理

| 场景 | 处理 |
|------|------|
| 模型调用失败 | 返回"服务暂时不可用，请稍后重试" |
| 消息转换失败 | 记录日志，跳过该消息 |
| 发送回复失败 | 重试 3 次，失败则记录 |

## 8. 目录结构

```
src/
├── index.ts              # 入口，导出主类
├── config.ts             # 配置加载
├── model/
│   └── custom-model.ts   # 自定义模型客户端
├── bridge/
│   └── weixin-bridge.ts  # 微信桥接器
└── runner/
    └── agent-runner.ts   # 运行器
```

## 9. 依赖

- `@agentscope-ai/agentscope`
- `@tencent-weixin/openclaw-weixin`
- `zod` (AgentScope 需要)