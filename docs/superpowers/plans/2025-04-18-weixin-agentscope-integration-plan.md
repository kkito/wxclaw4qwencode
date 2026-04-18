# 微信 + AgentScope 集成实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 实现 AgentScope 处理微信消息的完整集成，包括自定义模型客户端、微信桥接器和运行器。

**架构:** 三个核心组件 - CustomModel (模型客户端) + WeixinBridge (消息转换) + AgentRunner (生命周期管理)

**技术栈:** TypeScript, @agentscope-ai/agentscope, @tencent-weixin/openclaw-weixin, zod

---

## 文件结构

```
src/
├── index.ts                    # 入口，导出主类
├── config.ts                   # 配置加载
├── model/
│   └── custom-model.ts         # 自定义模型客户端
├── bridge/
│   └── weixin-bridge.ts        # 微信桥接器
└── runner/
    └── agent-runner.ts         # 运行器
```

每个文件职责单一，通过接口通信。

---

## Task 1: 配置模块 (src/config.ts)

**Files:**
- Create: `src/config.ts`

- [ ] **Step 1: 创建配置类型定义**

```typescript
import { z } from 'zod';

export const ConfigSchema = z.object({
  agentscope: z.object({
    model: z.object({
      type: z.literal('custom'),
      baseUrl: z.string(),
      apiKey: z.string().optional(),
      modelName: z.string(),
    }),
    sysPrompt: z.string().default('你是一个友好的 AI 助手。'),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  // 简化：从环境变量读取配置
  const baseUrl = process.env.AGENT_MODEL_BASE_URL;
  const apiKey = process.env.AGENT_MODEL_API_KEY;
  const modelName = process.env.AGENT_MODEL_NAME || 'gpt-4o';
  const sysPrompt = process.env.AGENT_SYS_PROMPT || '你是一个友好的 AI 助手。';

  if (!baseUrl) {
    throw new Error('AGENT_MODEL_BASE_URL 环境变量未设置');
  }

  return {
    agentscope: {
      model: {
        type: 'custom' as const,
        baseUrl,
        apiKey,
        modelName,
      },
      sysPrompt,
    },
  };
}
```

- [ ] **Step 2: 提交**

```bash
git add src/config.ts
git commit -m "feat: add config module for agentscope"
```

---

## Task 2: 自定义模型客户端 (src/model/custom-model.ts)

**Files:**
- Create: `src/model/custom-model.ts`
- Modify: `src/index.ts` (导出)

- [ ] **Step 1: 创建模型客户端骨架**

```typescript
import {
  ChatModelBase,
  CallParams,
  ChatResponse,
  CountTokensParams,
  Msg,
} from '@agentscope-ai/agentscope';
import { z } from 'zod';

export interface CustomModelConfig {
  baseUrl: string;
  apiKey?: string;
  modelName: string;
}

export class CustomModel implements ChatModelBase {
  modelName: string;
  stream: boolean;
  
  private baseUrl: string;
  private apiKey?: string;

  constructor(config: CustomModelConfig) {
    this.modelName = config.modelName;
    this.stream = true; // 支持流式
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
  }

  async call(
    params: CallParams
  ): Promise<ChatResponse> | AsyncGenerator<ChatResponse> {
    // TODO: 实现
    throw new Error('Not implemented');
  }

  async callStructured(
    params: CallParams & { schema: z.ZodType }
  ): Promise<ChatResponse> {
    // TODO: 实现
    throw new Error('Not implemented');
  }

  async countTokens(params: CountTokensParams): Promise<number> {
    // 简化实现：估算 token 数
    const text = params.messages
      .map((m: Msg) => m.content?.map((c: any) => c.text || '').join(''))
      .join('');
    return Math.ceil(text.length / 4);
  }
}
```

- [ ] **Step 2: 实现非流式调用**

```typescript
  async call(
    params: CallParams
  ): Promise<ChatResponse> {
    const url = `${this.baseUrl}/chat/completions`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const body = {
      model: this.modelName,
      messages: this.convertMsgsToOpenAI(params.messages),
      temperature: params.config?.temperature,
      max_tokens: params.config?.maxTokens,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API call failed: ${response.status} ${error}`);
    }

    const data = await response.json();
    return this.convertResponse(data);
  }

  private convertMsgsToOpenAI(msgs: Msg[]): any[] {
    return msgs.map((msg) => ({
      role: msg.role,
      content: msg.content
        ?.filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n') || '',
    }));
  }

  private convertResponse(data: any): ChatResponse {
    const choice = data.choices?.[0];
    const msg = choice?.message;
    
    return {
      id: data.id,
      model: data.model || this.modelName,
      content: msg?.content || '',
      finish_reason: choice?.finish_reason || 'stop',
    };
  }
```

- [ ] **Step 3: 实现流式调用**

```typescript
  async *call(
    params: CallParams
  ): AsyncGenerator<ChatResponse> {
    const url = `${this.baseUrl}/chat/completions`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const body = {
      model: this.modelName,
      messages: this.convertMsgsToOpenAI(params.messages),
      temperature: params.config?.temperature,
      max_tokens: params.config?.maxTokens,
      stream: true,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            yield {
              id: parsed.id || '',
              model: this.modelName,
              content: delta.content,
              finish_reason: parsed.choices[0]?.finish_reason,
            };
          }
        } catch {
          // 跳过无效 JSON
        }
      }
    }
  }
```

- [ ] **Step 4: 更新 index.ts 导出**

```typescript
export { CustomModel } from './model/custom-model';
export { loadConfig } from './config';
```

- [ ] **Step 5: 提交**

```bash
git add src/model/custom-model.ts src/index.ts
git commit -m "feat: add CustomModel for custom baseUrl API"
```

---

## Task 3: 微信桥接器 (src/bridge/weixin-bridge.ts)

**Files:**
- Create: `src/bridge/weixin-bridge.ts`
- Modify: `src/index.ts` (导出)

- [ ] **Step 1: 创建桥接器骨架**

```typescript
import { Agent, Msg, createMsg } from '@agentscope-ai/agentscope';
import { WeixinMessage } from '@tencent-weixin/openclaw-weixin';

export interface WeixinBridgeOptions {
  agent: Agent;
  sendMessage: (to: string, text: string) => Promise<void>;
}

export class WeixinBridge {
  private agent: Agent;
  private sendMessageFn: (to: string, text: string) => Promise<void>;

  constructor(options: WeixinBridgeOptions) {
    this.agent = options.agent;
    this.sendMessageFn = options.sendMessage;
  }

  async handleMessage(weixinMsg: WeixinMessage): Promise<void> {
    const userId = weixinMsg.from_user_id;
    if (!userId) {
      console.warn('消息缺少 from_user_id');
      return;
    }

    // 转换为 AgentScope 消息
    const msg = this.convertToMsg(weixinMsg);
    
    // 调用 Agent 处理
    const reply = await this.agent.reply({ msgs: [msg] });
    
    // 发送回复
    await this.sendReply(userId, reply);
  }

  private convertToMsg(weixinMsg: WeixinMessage): Msg {
    const userId = weixinMsg.from_user_id || 'unknown';
    const text = this.extractText(weixinMsg);
    
    return createMsg({
      name: userId,
      role: 'user',
      content: [
        {
          type: 'text' as const,
          text: text || '（空消息）',
          id: crypto.randomUUID(),
        },
      ],
    });
  }

  private extractText(msg: WeixinMessage): string {
    const items = msg.item_list;
    if (!items) return '';
    
    for (const item of items) {
      if (item.type === 1) { // TEXT
        return item.content || '';
      }
    }
    return '';
  }

  private async sendReply(toUserId: string, reply: Msg): Promise<void> {
    const text = reply.content
      ?.filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('');
    
    if (!text) {
      console.warn('Agent 回复为空');
      return;
    }

    await this.sendMessageFn(toUserId, text);
  }
}
```

- [ ] **Step 2: 添加媒体类型处理**

```typescript
  private extractText(msg: WeixinMessage): string {
    const items = msg.item_list;
    if (!items) return '';
    
    for (const item of items) {
      switch (item.type) {
        case 1: // TEXT
          return item.content || '';
        case 2: // IMAGE
          return '（收到图片消息，暂不支持）';
        case 3: // VOICE
          return '（收到语音消息，暂不支持）';
        case 4: // FILE
          return '（收到文件消息，暂不支持）';
        case 5: // VIDEO
          return '（收到视频消息，暂不支持）';
      }
    }
    return '';
  }
```

- [ ] **Step 3: 更新 index.ts 导出**

```typescript
export { WeixinBridge } from './bridge/weixin-bridge';
```

- [ ] **Step 4: 提交**

```bash
git add src/bridge/weixin-bridge.ts src/index.ts
git commit -m "feat: add WeixinBridge for message conversion"
```

---

## Task 4: 运行器 (src/runner/agent-runner.ts)

**Files:**
- Create: `src/runner/agent-runner.ts`
- Modify: `src/index.ts` (导出)

- [ ] **Step 1: 创建运行器**

```typescript
import { Agent, Toolkit } from '@agentscope-ai/agentscope';
import { CustomModel } from '../model/custom-model';
import { WeixinBridge } from '../bridge/weixin-bridge';

export interface AgentRunnerConfig {
  model: {
    baseUrl: string;
    apiKey?: string;
    modelName: string;
  };
  sysPrompt: string;
  weixin: {
    sendMessage: (to: string, text: string) => Promise<void>;
  };
}

export class AgentRunner {
  private agent: Agent;
  private bridge: WeixinBridge;

  constructor(config: AgentRunnerConfig) {
    // 创建模型客户端
    const model = new CustomModel(config.model);
    
    // 创建 Agent
    this.agent = new Agent({
      name: 'weixin-assistant',
      sysPrompt: config.sysPrompt,
      model,
      maxIters: 10,
      // 暂不加工具
    });

    // 创建桥接器
    this.bridge = new WeixinBridge({
      agent: this.agent,
      sendMessage: config.weixin.sendMessage,
    });
  }

  getBridge(): WeixinBridge {
    return this.bridge;
  }

  async start(): Promise<void> {
    // 加载状态（如果有）
    await this.agent.loadState?.();
    console.log('AgentRunner started');
  }

  async stop(): Promise<void> {
    // 保存状态
    await this.agent.saveState?.();
    console.log('AgentRunner stopped');
  }
}
```

- [ ] **Step 2: 添加便捷创建方法**

```typescript
import { loadConfig, Config } from '../config';

export interface AgentRunnerOptions {
  config?: Config;
  weixin: {
    sendMessage: (to: string, text: string) => Promise<void>;
  };
}

export async function createAgentRunner(options: AgentRunnerOptions): Promise<AgentRunner> {
  const config = options.config || loadConfig();
  
  const runner = new AgentRunner({
    model: {
      baseUrl: config.agentscope.model.baseUrl,
      apiKey: config.agentscope.model.apiKey,
      modelName: config.agentscope.model.modelName,
    },
    sysPrompt: config.agentscope.sysPrompt,
    weixin: options.weixin,
  });

  await runner.start();
  return runner;
}
```

- [ ] **Step 3: 更新 index.ts 导出**

```typescript
export { AgentRunner, createAgentRunner } from './runner/agent-runner';
```

- [ ] **Step 4: 提交**

```bash
git add src/runner/agent-runner.ts src/index.ts
git commit -m "feat: add AgentRunner for lifecycle management"
```

---

## Task 5: 入口和类型 (src/index.ts)

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: 完善入口文件**

```typescript
// 配置
export { loadConfig, Config, ConfigSchema } from './config';

// 模型
export { CustomModel, CustomModelConfig } from './model/custom-model';

// 桥接器
export { WeixinBridge, WeixinBridgeOptions } from './bridge/weixin-bridge';

// 运行器
export { AgentRunner, AgentRunnerConfig, createAgentRunner } from './runner/agent-runner';

// AgentScope 类型（重新导出方便使用）
export {
  Agent,
  Toolkit,
  createMsg,
  Msg,
  ContentBlock,
} from '@agentscope-ai/agentscope';
```

- [ ] **Step 2: 编译检查**

```bash
npm run typecheck
```

修复任何类型错误。

- [ ] **Step 3: 提交**

```bash
git add src/index.ts
git commit -m "feat: complete index.ts exports"
```

---

## Task 6: 使用示例 (src/example.ts)

**Files:**
- Create: `src/example.ts`

- [ ] **Step 1: 创建使用示例**

```typescript
import { createAgentRunner } from './index';
import { monitorWeixinProvider } from '@tencent-weixin/openclaw-weixin';

/**
 * 使用示例
 * 
 * 设置环境变量：
 *   AGENT_MODEL_BASE_URL=https://api.example.com/v1
 *   AGENT_MODEL_API_KEY=your-api-key
 *   AGENT_MODEL_NAME=gpt-4o
 *   AGENT_SYS_PROMPT=你是一个友好的 AI 助手。
 */

async function main() {
  // 创建 AgentRunner
  const runner = await createAgentRunner({
    weixin: {
      sendMessage: async (to: string, text: string) => {
        // 这里使用 openclaw-weixin 的发送函数
        const { sendMessageWeixin } = await import('@tencent-weixin/openclaw-weixin');
        await sendMessageWeixin({ to, text });
      },
    },
  });

  const bridge = runner.getBridge();

  // 启动微信消息监控
  console.log('启动微信消息监控...');
  
  await monitorWeixinProvider({
    onMessage: async (msg) => {
      console.log(`收到消息 from ${msg.from_user_id}:`, msg.item_list?.[0]?.content);
      
      try {
        await bridge.handleMessage(msg);
      } catch (error) {
        console.error('处理消息失败:', error);
      }
    },
  });

  console.log('服务已启动，按 Ctrl+C 停止');

  // 优雅退出
  process.on('SIGINT', async () => {
    console.log('\n正在停止...');
    await runner.stop();
    process.exit(0);
  });
}

main().catch(console.error);
```

- [ ] **Step 2: 添加 package.json 脚本**

修改 package.json 添加启动脚本：

```json
{
  "scripts": {
    "start": "node dist/example.js",
    "dev": "tsc --watch"
  }
}
```

- [ ] **Step 3: 编译并验证**

```bash
npm run build
```

- [ ] **Step 4: 提交**

```bash
git add src/example.ts package.json
git commit -m "feat: add usage example"
```

---

## 实现完成检查

- [ ] Task 1: 配置模块 ✅
- [ ] Task 2: 自定义模型客户端 ✅
- [ ] Task 3: 微信桥接器 ✅
- [ ] Task 4: 运行器 ✅
- [ ] Task 5: 入口和类型 ✅
- [ ] Task 6: 使用示例 ✅

---

## Plan Complete

Implementation plan saved to `docs/superpowers/plans/2025-04-18-weixin-agentscope-integration-plan.md`.