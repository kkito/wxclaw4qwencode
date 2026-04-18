# OwnClaw - 微信 + AgentScope 集成

基于 AgentScope 框架的微信消息处理集成，支持使用自定义大模型 API 处理微信消息。

## 概述

OwnClaw 将微信消息通道（openclaw-weixin）与 AgentScope AI Agent 框架连接，实现：

- 接收微信用户消息 → 转换为 AgentScope 格式 → AI 处理 → 发送回复
- 支持自定义模型 API（OpenAI 兼容格式）
- 简单的消息类型处理（文本优先）

## 架构

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  微信用户   │───▶│ openclaw-    │───▶│ AgentScope  │
│             │    │ weixin       │    │ Bridge      │
└─────────────┘    │ (接收消息)   │    │ (格式转换)  │
                   └──────────────┘    └──────┬──────┘
                                                │
                   ┌──────────────┐    ┌──────▼──────┐
│  微信用户   │◀──│ openclaw-    │◀───│ AgentScope  │
│             │    │ weixin       │    │ (AI 处理)   │
└─────────────┘    │ (发送消息)   │    └─────────────┘
                   └──────────────┘
```

## 快速开始

### 1. 安装依赖

```bash
npm install
# 或
pnpm install
```

### 2. 配置环境变量

```bash
# 必需：模型 API 地址
export AGENT_MODEL_BASE_URL=https://api.example.com/v1

# 可选：API Key
export AGENT_MODEL_API_KEY=your-api-key

# 可选：模型名称，默认 gpt-4o
export AGENT_MODEL_NAME=gpt-4o

# 可选：系统提示词
export AGENT_SYS_PROMPT=你是一个友好的 AI 助手。
```

### 3. 编译并运行

```bash
# 编译 TypeScript
npm run build

# 运行示例
npm run start
```

## 项目结构

```
src/
├── config.ts              # 配置加载（从环境变量）
├── index.ts               # 入口导出
├── model/
│   └── custom-model.ts    # 自定义模型客户端 (ChatModelBase)
├── bridge/
│   └── weixin-bridge.ts   # 微信消息 ↔ AgentScope 消息转换
├── runner/
│   └── agent-runner.ts    # Agent 生命周期管理
└── example.ts             # 使用示例
```

## 使用方式

### 基础用法

```typescript
import { createAgentRunner } from './index';

const runner = await createAgentRunner({
  weixin: {
    sendMessage: async (to: string, text: string) => {
      // 使用 openclaw-weixin 发送消息
      await sendMessageWeixin({ to, text });
    },
  },
});

const bridge = runner.getBridge();

// 处理收到的微信消息
await bridge.handleMessage(weixinMessage);
```

### 手动创建

```typescript
import { Agent } from '@agentscope-ai/agentscope/agent';
import { CustomModel } from './model/custom-model';
import { WeixinBridge } from './bridge/weixin-bridge';

// 1. 创建模型
const model = new CustomModel({
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'your-key',
  modelName: 'gpt-4o',
});

// 2. 创建 Agent
const agent = new Agent({
  name: 'weixin-assistant',
  sysPrompt: '你是一个友好的 AI 助手。',
  model,
  maxIters: 10,
});

// 3. 创建桥接器
const bridge = new WeixinBridge({
  agent,
  sendMessage: async (to, text) => {
    // 发送消息
  },
});

// 4. 处理消息
await bridge.handleMessage(weixinMessage);
```

## 配置说明

| 环境变量 | 必需 | 说明 |
|----------|------|------|
| `AGENT_MODEL_BASE_URL` | 是 | 模型 API 地址（如 `https://api.openai.com/v1`） |
| `AGENT_MODEL_API_KEY` | 否 | API Key |
| `AGENT_MODEL_NAME` | 否 | 模型名称，默认 `gpt-4o` |
| `AGENT_SYS_PROMPT` | 否 | 系统提示词，默认 `你是一个友好的 AI 助手。` |

## 消息处理

- **文本消息**：完整处理
- **图片/语音/文件/视频**：返回提示"暂不支持"

后续可扩展媒体处理能力。

## 与微信通道集成

实际使用时，需要将 `bridge.handleMessage` 接入微信消息监控：

```typescript
import { monitorWeixinProvider } from '@tencent-weixin/openclaw-weixin';
import { createAgentRunner } from 'ownclaw';

async function main() {
  const runner = await createAgentRunner({
    weixin: {
      sendMessage: async (to, text) => {
        await sendMessageWeixin({ to, text });
      },
    },
  });

  const bridge = runner.getBridge();

  // 启动微信消息监控
  await monitorWeixinProvider({
    onMessage: async (msg) => {
      await bridge.handleMessage(msg);
    },
  });
}
```

## 依赖

- `@agentscope-ai/agentscope` - AI Agent 框架
- `@tencent-weixin/openclaw-weixin` - 微信通道
- `zod` - 配置验证

## License

ISC