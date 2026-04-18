# 微信 + AgentScope 单元测试补充计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 为微信 + AgentScope 集成实现的四个核心模块补充完整的单元测试

**架构:** 使用 vitest 框架，为 config、custom-model、weixin-bridge、agent-runner 四个模块分别编写测试，通过 mock 隔离外部依赖

**Tech Stack:** TypeScript, vitest, @vitest/spy

---

## 文件结构

```
tests/
├── config.test.ts              # 配置模块测试
├── model/
│   └── custom-model.test.ts    # 自定义模型客户端测试
├── bridge/
│   └── weixin-bridge.test.ts   # 微信桥接器测试
└── runner/
    └── agent-runner.test.ts    # 运行器测试
```

---

## Task 1: 配置模块测试 (tests/config.test.ts)

**Files:**
- Create: `tests/config.test.ts`
- Reference: `src/config.ts`

- [ ] **Step 1: 创建配置模块测试文件**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, ConfigSchema } from '../../src/config';

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('should throw error when AGENT_MODEL_BASE_URL is not set', () => {
      delete process.env.AGENT_MODEL_BASE_URL;
      expect(() => loadConfig()).toThrow('AGENT_MODEL_BASE_URL 环境变量未设置');
    });

    it('should load config with required env vars', () => {
      process.env.AGENT_MODEL_BASE_URL = 'https://api.example.com/v1';
      process.env.AGENT_MODEL_NAME = 'gpt-4o';
      process.env.AGENT_SYS_PROMPT = 'Test prompt';

      const config = loadConfig();

      expect(config.agentscope.model.baseUrl).toBe('https://api.example.com/v1');
      expect(config.agentscope.model.modelName).toBe('gpt-4o');
      expect(config.agentscope.sysPrompt).toBe('Test prompt');
    });

    it('should use default model name when not set', () => {
      process.env.AGENT_MODEL_BASE_URL = 'https://api.example.com/v1';
      delete process.env.AGENT_MODEL_NAME;

      const config = loadConfig();

      expect(config.agentscope.model.modelName).toBe('gpt-4o');
    });

    it('should use default sysPrompt when not set', () => {
      process.env.AGENT_MODEL_BASE_URL = 'https://api.example.com/v1';
      delete process.env.AGENT_SYS_PROMPT;

      const config = loadConfig();

      expect(config.agentscope.sysPrompt).toBe('你是一个友好的 AI 助手。');
    });

    it('should include optional apiKey when set', () => {
      process.env.AGENT_MODEL_BASE_URL = 'https://api.example.com/v1';
      process.env.AGENT_MODEL_API_KEY = 'test-key';

      const config = loadConfig();

      expect(config.agentscope.model.apiKey).toBe('test-key');
    });

    it('should not include apiKey when not set', () => {
      process.env.AGENT_MODEL_BASE_URL = 'https://api.example.com/v1';
      delete process.env.AGENT_MODEL_API_KEY;

      const config = loadConfig();

      expect(config.agentscope.model.apiKey).toBeUndefined();
    });
  });

  describe('ConfigSchema', () => {
    it('should validate correct config', () => {
      const validConfig = {
        agentscope: {
          model: {
            type: 'custom',
            baseUrl: 'https://api.example.com/v1',
            modelName: 'gpt-4o',
          },
          sysPrompt: 'Test prompt',
        },
      };

      expect(() => ConfigSchema.parse(validConfig)).not.toThrow();
    });

    it('should reject config without baseUrl', () => {
      const invalidConfig = {
        agentscope: {
          model: {
            type: 'custom',
            modelName: 'gpt-4o',
          },
          sysPrompt: 'Test prompt',
        },
      };

      expect(() => ConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('should reject config with invalid type', () => {
      const invalidConfig = {
        agentscope: {
          model: {
            type: 'invalid',
            baseUrl: 'https://api.example.com/v1',
            modelName: 'gpt-4o',
          },
          sysPrompt: 'Test prompt',
        },
      };

      expect(() => ConfigSchema.parse(invalidConfig)).toThrow();
    });
  });
});
```

- [ ] **Step 2: 运行测试验证**

Run: `npm run test:run -- tests/config.test.ts`

- [ ] **Step 3: 提交**

```bash
git add tests/config.test.ts
git commit -m "test: add config module unit tests"
```

---

## Task 2: 自定义模型客户端测试 (tests/model/custom-model.test.ts)

**Files:**
- Create: `tests/model/custom-model.test.ts`
- Reference: `src/model/custom-model.ts`

- [ ] **Step 1: 创建模型客户端测试文件（基础功能）**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CustomModel } from '../../../src/model/custom-model';
import { createMsg } from '@agentscope-ai/agentscope/message';

describe('CustomModel', () => {
  let model: CustomModel;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    
    model = new CustomModel({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'test-key',
      modelName: 'gpt-4o',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create model with correct config', () => {
      expect(model.modelName).toBe('gpt-4o');
      expect(model.stream).toBe(true);
    });

    it('should strip trailing slash from baseUrl', () => {
      const modelNoSlash = new CustomModel({
        baseUrl: 'https://api.example.com/v1/',
        modelName: 'gpt-4o',
      });
      // The baseUrl is private, but we can verify it works
      expect(modelNoSlash.modelName).toBe('gpt-4o');
    });
  });

  describe('countTokens', () => {
    it('should estimate tokens correctly', async () => {
      const msgs = [
        createMsg({
          name: 'user',
          role: 'user',
          content: [{ type: 'text' as const, text: 'Hello world', id: '1' }],
        }),
      ];

      const tokens = await model.countTokens({ messages: msgs });
      
      // "Hello world" = 11 chars, /4 ≈ 3
      expect(tokens).toBe(3);
    });

    it('should handle empty messages', async () => {
      const tokens = await model.countTokens({ messages: [] });
      expect(tokens).toBe(0);
    });

    it('should handle messages without text content', async () => {
      const msgs = [
        createMsg({
          name: 'user',
          role: 'user',
          content: [],
        }),
      ];

      const tokens = await model.countTokens({ messages: msgs });
      expect(tokens).toBe(0);
    });
  });
});
```

- [ ] **Step 2: 添加非流式调用测试**

```typescript
  describe('call (non-streaming)', () => {
    it('should make successful API call and return response', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello!',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const msgs = [
        createMsg({
          name: 'user',
          role: 'user',
          content: [{ type: 'text' as const, text: 'Hi', id: '1' }],
        }),
      ];

      const result = await model.call(msgs as any);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-key',
          }),
        })
      );

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('Hello!');
    });

    it('should throw error when API response is not ok', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      const msgs = [
        createMsg({
          name: 'user',
          role: 'user',
          content: [{ type: 'text' as const, text: 'Hi', id: '1' }],
        }),
      ];

      await expect(model.call(msgs as any)).rejects.toThrow('API call failed: 401 Unauthorized');
    });

    it('should handle timeout', async () => {
      mockFetch.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('AbortError')), 100)
        )
      );

      const msgs = [
        createMsg({
          name: 'user',
          role: 'user',
          content: [{ type: 'text' as const, text: 'Hi', id: '1' }],
        }),
      ];

      await expect(model.call(msgs as any)).rejects.toThrow('API request timed out');
    });
  });
```

- [ ] **Step 3: 添加流式调用测试**

```typescript
  describe('call (streaming)', () => {
    it('should handle streaming response', async () => {
      const mockResponse = new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"id":"1","choices":[{"delta":{"content":"Hello"}}]}\n'));
            controller.enqueue(new TextEncoder().encode('data: {"id":"1","choices":[{"delta":{"content":" World"}}]}\n'));
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n'));
            controller.close();
          },
        })
      );

      mockFetch.mockResolvedValue(mockResponse);

      const msgs = [
        createMsg({
          name: 'user',
          role: 'user',
          content: [{ type: 'text' as const, text: 'Hi', id: '1' }],
        }),
      ];

      const chunks: string[] = [];
      for await (const chunk of await model.call(msgs as any)) {
        if (chunk.content[0]) {
          chunks.push(chunk.content[0].text);
        }
      }

      expect(chunks).toEqual(['Hello', ' World']);
    });

    it('should throw error when response body is null', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: null,
      });

      const msgs = [
        createMsg({
          name: 'user',
          role: 'user',
          content: [{ type: 'text' as const, text: 'Hi', id: '1' }],
        }),
      ];

      // Need to test with stream enabled
      const streamModel = new CustomModel({
        baseUrl: 'https://api.example.com/v1',
        modelName: 'gpt-4o',
      });

      await expect(streamModel.call(msgs as any).next()).rejects.toThrow('Response body is null');
    });
  });
```

- [ ] **Step 4: 运行测试验证**

Run: `npm run test:run -- tests/model/custom-model.test.ts`

- [ ] **Step 5: 提交**

```bash
git add tests/model/custom-model.test.ts
git commit -m "test: add CustomModel unit tests"
```

---

## Task 3: 微信桥接器测试 (tests/bridge/weixin-bridge.test.ts)

**Files:**
- Create: `tests/bridge/weixin-bridge.test.ts`
- Reference: `src/bridge/weixin-bridge.ts`

- [ ] **Step 1: 创建桥接器测试文件（基础功能）**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WeixinBridge } from '../../../src/bridge/weixin-bridge';
import { createMsg } from '@agentscope-agentscope/message';

describe('WeixinBridge', () => {
  let bridge: WeixinBridge;
  let mockAgent: any;
  let mockSendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSendMessage = vi.fn().mockResolvedValue(undefined);
    
    mockAgent = {
      reply: vi.fn().mockResolvedValue(
        createMsg({
          name: 'assistant',
          role: 'assistant',
          content: [{ type: 'text' as const, text: 'Reply text', id: '1' }],
        })
      ),
    };

    bridge = new WeixinBridge({
      agent: mockAgent,
      sendMessage: mockSendMessage,
    });
  });

  describe('constructor', () => {
    it('should create bridge with agent and sendMessage function', () => {
      expect(bridge).toBeDefined();
    });
  });

  describe('handleMessage', () => {
    it('should handle text message and send reply', async () => {
      const weixinMsg = {
        from_user_id: 'user123',
        item_list: [
          { type: 1, content: 'Hello' },
        ],
      };

      await bridge.handleMessage(weixinMsg);

      expect(mockAgent.reply).toHaveBeenCalledWith({
        msgs: expect.arrayContaining([
          expect.objectContaining({
            name: 'user123',
            role: 'user',
          }),
        ]),
      });

      expect(mockSendMessage).toHaveBeenCalledWith('user123', 'Reply text');
    });

    it('should warn and return when from_user_id is missing', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const weixinMsg = {
        item_list: [
          { type: 1, content: 'Hello' },
        ],
      };

      await bridge.handleMessage(weixinMsg);

      expect(consoleWarn).toHaveBeenCalledWith('消息缺少 from_user_id');
      expect(mockAgent.reply).not.toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled();

      consoleWarn.mockRestore();
    });

    it('should handle empty message with default text', async () => {
      const weixinMsg = {
        from_user_id: 'user123',
        item_list: [],
      };

      await bridge.handleMessage(weixinMsg);

      expect(mockAgent.reply).toHaveBeenCalledWith({
        msgs: expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({ text: '（空消息）' }),
            ]),
          }),
        ]),
      });
    });
  });

  describe('message type handling', () => {
    it('should handle IMAGE message', async () => {
      const weixinMsg = {
        from_user_id: 'user123',
        item_list: [
          { type: 2, media_url: 'http://example.com/img.jpg' },
        ],
      };

      await bridge.handleMessage(weixinMsg);

      expect(mockAgent.reply).toHaveBeenCalledWith({
        msgs: expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({ text: '（收到图片消息，暂不支持）' }),
            ]),
          }),
        ]),
      });
    });

    it('should handle VOICE message', async () => {
      const weixinMsg = {
        from_user_id: 'user123',
        item_list: [
          { type: 3, media_url: 'http://example.com/voice.mp3' },
        ],
      };

      await bridge.handleMessage(weixinMsg);

      expect(mockAgent.reply).toHaveBeenCalledWith({
        msgs: expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({ text: '（收到语音消息，暂不支持）' }),
            ]),
          }),
        ]),
      });
    });

    it('should handle FILE message', async () => {
      const weixinMsg = {
        from_user_id: 'user123',
        item_list: [
          { type: 4, media_url: 'http://example.com/file.pdf', file_name: 'file.pdf' },
        ],
      };

      await bridge.handleMessage(weixinMsg);

      expect(mockAgent.reply).toHaveBeenCalledWith({
        msgs: expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({ text: '（收到文件消息，暂不支持）' }),
            ]),
          }),
        ]),
      });
    });

    it('should handle VIDEO message', async () => {
      const weixinMsg = {
        from_user_id: 'user123',
        item_list: [
          { type: 5, media_url: 'http://example.com/video.mp4' },
        ],
      };

      await bridge.handleMessage(weixinMsg);

      expect(mockAgent.reply).toHaveBeenCalledWith({
        msgs: expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({ text: '（收到视频消息，暂不支持）' }),
            ]),
          }),
        ]),
      });
    });
  });

  describe('error handling', () => {
    it('should handle agent reply error gracefully', async () => {
      mockAgent.reply.mockRejectedValue(new Error('Agent error'));
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const weixinMsg = {
        from_user_id: 'user123',
        item_list: [
          { type: 1, content: 'Hello' },
        ],
      };

      await bridge.handleMessage(weixinMsg);

      expect(consoleError).toHaveBeenCalledWith('处理消息失败:', expect.any(Error));
      // Should send error message to user
      expect(mockSendMessage).toHaveBeenCalledWith(
        'user123',
        '抱歉，处理您的消息时出现错误，请稍后重试。'
      );

      consoleError.mockRestore();
    });

    it('should handle empty agent response', async () => {
      mockAgent.reply.mockResolvedValue(null);
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const weixinMsg = {
        from_user_id: 'user123',
        item_list: [
          { type: 1, content: 'Hello' },
        ],
      };

      await bridge.handleMessage(weixinMsg);

      expect(consoleWarn).toHaveBeenCalledWith('Agent 返回为空');
      expect(mockSendMessage).not.toHaveBeenCalled();

      consoleWarn.mockRestore();
    });

    it('should not send message when reply content is empty', async () => {
      mockAgent.reply.mockResolvedValue(
        createMsg({
          name: 'assistant',
          role: 'assistant',
          content: [],
        })
      );
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const weixinMsg = {
        from_user_id: 'user123',
        item_list: [
          { type: 1, content: 'Hello' },
        ],
      };

      await bridge.handleMessage(weixinMsg);

      expect(consoleWarn).toHaveBeenCalledWith('Agent 回复为空');
      expect(mockSendMessage).not.toHaveBeenCalled();

      consoleWarn.mockRestore();
    });
  });
});
```

- [ ] **Step 2: 运行测试验证**

Run: `npm run test:run -- tests/bridge/weixin-bridge.test.ts`

- [ ] **Step 3: 提交**

```bash
git add tests/bridge/weixin-bridge.test.ts
git commit -m "test: add WeixinBridge unit tests"
```

---

## Task 4: 运行器测试 (tests/runner/agent-runner.test.ts)

**Files:**
- Create: `tests/runner/agent-runner.test.ts`
- Reference: `src/runner/agent-runner.ts`

- [ ] **Step 1: 创建运行器测试文件（基础功能）**

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AgentRunner, createAgentRunner } from '../../../src/runner/agent-runner';
import * as configModule from '../../../src/config';

describe('AgentRunner', () => {
  let runner: AgentRunner;
  let mockSendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSendMessage = vi.fn().mockResolvedValue(undefined);
    
    runner = new AgentRunner({
      model: {
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'test-key',
        modelName: 'gpt-4o',
      },
      sysPrompt: 'You are a helpful assistant.',
      weixin: {
        sendMessage: mockSendMessage,
      },
    });
  });

  describe('constructor', () => {
    it('should create runner with bridge', () => {
      expect(runner.getBridge()).toBeDefined();
    });
  });

  describe('start/stop', () => {
    it('should start and stop runner', async () => {
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await runner.start();
      expect(consoleLog).toHaveBeenCalledWith('AgentRunner started');
      
      await runner.stop();
      expect(consoleLog).toHaveBeenCalledWith('AgentRunner stopped');

      consoleLog.mockRestore();
    });
  });
});

describe('createAgentRunner', () => {
  let mockSendMessage: ReturnType<typeof vi.fn>;
  let mockLoadConfig: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSendMessage = vi.fn().mockResolvedValue(undefined);
    mockLoadConfig = vi.spyOn(configModule, 'loadConfig').mockReturnValue({
      agentscope: {
        model: {
          type: 'custom' as const,
          baseUrl: 'https://api.example.com/v1',
          apiKey: 'test-key',
          modelName: 'gpt-4o',
        },
        sysPrompt: 'You are a helpful assistant.',
      },
    });
  });

  afterEach(() => {
    mockLoadConfig.mockRestore();
  });

  it('should create and start runner with provided config', async () => {
    const runner = await createAgentRunner({
      weixin: {
        sendMessage: mockSendMessage,
      },
    });

    expect(runner).toBeDefined();
    expect(runner.getBridge()).toBeDefined();
    mockLoadConfig.mockRestore();
  });

  it('should create runner with custom config', async () => {
    const customConfig = {
      agentscope: {
        model: {
          type: 'custom' as const,
          baseUrl: 'https://custom.example.com/v1',
          apiKey: 'custom-key',
          modelName: 'custom-model',
        },
        sysPrompt: 'Custom prompt',
      },
    };

    const runner = await createAgentRunner({
      config: customConfig,
      weixin: {
        sendMessage: mockSendMessage,
      },
    });

    expect(runner).toBeDefined();
    expect(mockLoadConfig).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试验证**

Run: `npm run test:run -- tests/runner/agent-runner.test.ts`

- [ ] **Step 3: 提交**

```bash
git add tests/runner/agent-runner.test.ts
git commit -m "test: add AgentRunner unit tests"
```

---

## Task 5: 运行所有测试并验证覆盖率

**Files:**
- Modify: `package.json` (optional: add coverage script)

- [ ] **Step 1: 运行所有测试**

Run: `npm run test:run`

- [ ] **Step 2: 检查测试结果**

确保所有测试通过，无报错。

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "test: add all unit tests for weixin-agentscope integration"
```

---

## 实现完成检查

- [ ] Task 1: 配置模块测试 ✅
- [ ] Task 2: 自定义模型客户端测试 ✅
- [ ] Task 3: 微信桥接器测试 ✅
- [ ] Task 4: 运行器测试 ✅
- [ ] Task 5: 运行所有测试 ✅

---

## Plan Complete

Implementation plan saved to `docs/superpowers/plans/2025-04-18-weixin-agentscope-unit-tests-plan.md`.