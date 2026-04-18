# AgentScope 框架文档

## 概述

`@agentscope-ai/agentscope` 是一个现代 AI Agent 开发框架，提供了统一的 Agent 抽象、工具系统、消息格式和事件流支持。框架采用 TypeScript 开发，支持流式输出、工具调用循环、内存压缩和状态持久化。

```
┌─────────────────────────────────────────────────────────────────┐
│                        AgentScope 架构                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐   │
│   │    Agent     │────▶│    Model     │◀────│   Toolkit    │   │
│   │   (大脑)     │     │   (LLM)      │     │   (工具集)   │   │
│   └──────────────┘     └──────────────┘     └──────────────┘   │
│          │                                        │              │
│          ▼                                        ▼              │
│   ┌──────────────┐                       ┌──────────────┐       │
│   │   Context    │◀──────────────────────│    Tools     │       │
│   │   (上下文)   │                       │ read/write/  │       │
│   │              │                       │ edit/bash/   │       │
│   │  + Summary   │                       │ glob/grep    │       │
│   └──────────────┘                       └──────────────┘       │
│          │                                                      │
│          ▼                                                      │
│   ┌──────────────┐     ┌──────────────┐                        │
│   │   Storage    │     │    Events    │                        │
│   │  (持久化)    │     │   (事件流)   │                        │
│   └──────────────┘     └──────────────┘                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. 核心概念

### 1.1 Agent (智能体)

Agent 是框架的核心类，负责：
- 与 LLM 模型交互
- 管理对话上下文
- 调用工具执行动作
- 处理用户确认和外部执行
- 状态持久化

```typescript
import { Agent } from '@agentscope-ai/agentscope';

const agent = new Agent({
    name: 'assistant',
    sysPrompt: '你是一个有帮助的助手',
    model: myModel,
    maxIters: 20,
    toolkit: myToolkit,
    storage: myStorage,
    compressionConfig: {
        enabled: true,
        triggerThreshold: 8000,
        keepRecent: 2,
    },
});
```

### 1.2 ReAct 模式

AgentScope 的 Agent 采用 **ReAct (Reasoning + Acting)** 模式：

```
┌─────────────────────────────────────────────────────────────┐
│                     ReAct 循环                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────┐                                           │
│   │   输入消息   │                                           │
│   └──────┬──────┘                                           │
│          ▼                                                  │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│   │  Reasoning  │───▶│   Acting    │───▶│   更新上下文  │    │
│   │  (模型推理)  │    │  (执行工具)  │    │             │    │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    │
│          │                  │                   │           │
│          ▼                  ▼                   ▼           │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│   │ 返回 tool   │    │  工具执行   │    │  检查是否   │    │
│   │   call?     │    │   结果      │    │  继续循环   │    │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    │
│          │ yes              │                   │           │
│          └────────┬─────────┘                   │ no        │
│                   ▼                             ▼           │
│            ┌─────────────┐              ┌─────────────┐     │
│            │  继续下一轮  │              │   返回结果   │     │
│            │  Reasoning  │              │             │     │
│            └─────────────┘              └─────────────┘     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 Toolkit (工具箱)

Toolkit 管理所有可用的工具，支持：
- 注册工具函数
- 生成 JSON Schema
- 用户确认机制
- 外部执行标记

### 1.4 消息与内容块

框架使用统一的消息格式：

```typescript
import { createMsg, Msg, ContentBlock, ToolCallBlock, ToolResultBlock } from '@agentscope-ai/agentscope';

// 创建消息
const msg = createMsg({
    name: 'user',
    content: [{ type: 'text', text: '你好' }],
    role: 'user',
});

// 内容块类型
type ContentBlock = 
    | { type: 'text'; text: string; id: string }
    | { type: 'thinking'; thinking: string; id: string }
    | ToolCallBlock
    | ToolResultBlock;
```

### 1.5 事件流

Agent 支持流式事件输出，便于实时展示思考过程：

```typescript
// 事件类型
type AgentEvent = 
    | RunStartedEvent      // 运行开始
    | RunFinishedEvent     // 运行结束
    | ModelCallStartedEvent    // 模型调用开始
    | ModelCallEndedEvent      // 模型调用结束
    | TextBlockStartEvent      // 文本块开始
    | TextBlockDeltaEvent      // 文本块增量
    | TextBlockEndEvent        // 文本块结束
    | ThinkingBlockStartEvent  // 思考块开始
    | ThinkingBlockDeltaEvent  // 思考块增量
    | ThinkingBlockEndEvent    // 思考块结束
    | ToolCallStartEvent       // 工具调用开始
    | ToolCallDeltaEvent       // 工具调用增量
    | ToolCallEndEvent         // 工具调用结束
    | ToolResultStartEvent     // 工具结果开始
    | ToolResultTextDeltaEvent // 工具结果文本增量
    | ToolResultBinaryDeltaEvent // 工具结果二进制增量
    | ToolResultEndEvent       // 工具结果结束
    | RequireUserConfirmEvent  // 需要用户确认
    | RequireExternalExecutionEvent; // 需要外部执行
```

---

## 2. Agent 类 API

### 2.1 构造函数

```typescript
interface AgentOptions {
    /** Agent 名称 */
    name: string;
    /** 系统提示词 */
    sysPrompt: string;
    /** 聊天模型 */
    model: ChatModelBase;
    /** 最大迭代次数，默认 20 */
    maxIters?: number;
    /** 工具箱 */
    toolkit?: Toolkit;
    /** 状态存储 */
    storage?: StorageBase;
    /** 内存压缩配置 */
    compressionConfig?: CompressionConfig;
}

new Agent(options: AgentOptions)
```

### 2.2 核心方法

| 方法 | 说明 |
|------|------|
| `reply(options)` | 同步回复，返回最终消息 |
| `replyStream(options)` | 流式回复，yield 事件 |
| `loadState()` | 从存储加载状态 |
| `saveState()` | 保存状态到存储 |
| `toJSON()` | 序列化为 JSON |

### 2.3 流式回复示例

```typescript
async function* streamReply(agent: Agent, userInput: string) {
    const msg = createMsg({
        name: 'user',
        content: [{ type: 'text', text: userInput, id: crypto.randomUUID() }],
        role: 'user',
    });

    for await (const event of agent.replyStream({ msgs: msg })) {
        switch (event.type) {
            case 'text_block_delta':
                console.log('Text:', event.delta);
                break;
            case 'thinking_block_delta':
                console.log('Thinking:', event.delta);
                break;
            case 'tool_call_start':
                console.log('Tool call:', event.toolCallName);
                break;
            case 'tool_result_text_delta':
                console.log('Result:', event.delta);
                break;
        }
    }
}
```

### 2.4 内存压缩配置

```typescript
const compressionConfig: CompressionConfig = {
    enabled: true,                    // 启用压缩
    triggerThreshold: 8000,          // 触发阈值（token 数）
    keepRecent: 2,                   // 保留最近 N 个单元
    tokenCountFunc: undefined,       // 自定义 token 计数函数
    compressionModel: undefined,     // 压缩专用模型（默认使用主模型）
    compressionPrompt: undefined,    // 自定义压缩提示词
    summarySchema: undefined,        // 自定义摘要 Schema
};
```

---

## 3. 工具系统

### 3.1 内置工具

AgentScope 提供以下内置工具：

| 工具 | 说明 | 参数 |
|------|------|------|
| `read` | 读取文件内容 | `filePath: string` |
| `write` | 写入文件内容 | `filePath: string, content: string` |
| `edit` | 编辑文件 | `filePath: string, oldString: string, newString: string` |
| `bash` | 执行 Shell 命令 | `command: string, workingDir?: string` |
| `glob` | 文件模式搜索 | `pattern: string` |
| `grep` | 内容搜索 | `pattern: string, path?: string, glob?: string` |
| `task` | 任务管理 | `action: 'create'|'list'|'get'\|'update'\|'delete', ...` |

### 3.2 自定义工具

```typescript
import { Toolkit, tool, Tool } from '@agentscope-ai/agentscope';

const toolkit = new Toolkit();

// 方式 1: 使用装饰器
@tool('my_tool', '这是我的工具描述')
async function myTool(param: { input: string }): Promise<string> {
    return `处理: ${param.input}`;
}

// 方式 2: 手动注册
const customTool: Tool = {
    name: 'custom_tool',
    description: '自定义工具',
    parameters: z.object({
        query: z.string().describe('查询内容'),
    }),
    func: async (params) => {
        return await doSomething(params.query);
    },
};

toolkit.register(customTool);
```

### 3.3 用户确认机制

某些工具需要用户确认才能执行：

```typescript
// 在工具定义中设置
const sensitiveTool: Tool = {
    name: 'delete_file',
    description: '删除文件',
    parameters: z.object({ path: z.string() }),
    func: async (params) => { /* ... */ },
    requireUserConfirm: true,  // 需要用户确认
    requireExternalExecution: false,
};
```

---

## 4. 模型接口

### 4.1 ChatModelBase

所有模型需实现 `ChatModelBase` 接口：

```typescript
interface ChatModelBase {
    /** 模型名称 */
    modelName: string;
    /** 是否支持流式 */
    stream: boolean;

    /** 调用模型 */
    call(params: CallParams): Promise<ChatResponse> | AsyncGenerator<ChatResponse>;
    
    /** 结构化输出 */
    callStructured(params: CallParams & { schema: z.ZodType }): Promise<ChatResponse>;
    
    /** 计算 token 数量 */
    countTokens(params: CountTokensParams): Promise<number>;
}
```

### 4.2 支持的模型

查看 `src/model/` 目录，当前包含：
- Ollama 模型
- 更多模型持续添加中...

---

## 5. 存储系统

### 5.1 StorageBase

状态持久化接口：

```typescript
interface StorageBase {
    /** 加载 Agent 状态 */
    loadAgentState(params: { agentId: string }): Promise<{
        context: Msg[];
        metadata: Record<string, any>;
    }>;
    
    /** 保存 Agent 状态 */
    saveAgentState(params: {
        agentId: string;
        context: Msg[];
        metadata: Record<string, any>;
    }): Promise<void>;
}
```

---

## 6. 完整使用示例

```typescript
import { 
    Agent, 
    Toolkit, 
    createMsg, 
    Msg,
    AgentEvent,
    EventType,
} from '@agentscope-ai/agentscope';
import { OllamaModel } from '@agentscope-ai/agentscope/model/ollama-model';

// 1. 初始化模型
const model = new OllamaModel({
    modelName: 'llama3',
    baseUrl: 'http://localhost:11434',
});

// 2. 初始化工具箱
const toolkit = new Toolkit();
// 添加工具...
toolkit.register(myCustomTool);

// 3. 创建 Agent
const agent = new Agent({
    name: 'assistant',
    sysPrompt: '你是一个有帮助的编程助手，可以帮助用户编写和调试代码。',
    model,
    toolkit,
    maxIters: 10,
});

// 4. 流式交互
async function chat(userInput: string) {
    const msg = createMsg({
        name: 'user',
        content: [{ type: 'text', text: userInput, id: crypto.randomUUID() }],
        role: 'user',
    });

    const stream = agent.replyStream({ msgs: msg });
    let finalMsg: Msg | undefined;

    for await (const event of stream) {
        // 处理事件
        if (event.type === EventType.TEXT_BLOCK_DELTA) {
            process.stdout.write(event.delta);
        }
        if (event.type === EventType.RUN_FINISHED) {
            // 获取最终消息
            finalMsg = await stream.return ?? undefined;
        }
    }

    return finalMsg;
}

// 5. 开始对话
const result = await chat('请帮我写一个 Hello World 程序');
console.log('\n最终回复:', result);
```

---

## 7. 目录结构

```
src/
├── agent/              # Agent 核心实现
│   ├── agent.ts        # Agent 类
│   ├── interfaces.ts   # 接口定义
│   └── index.ts        # 导出
├── tool/               # 工具系统
│   ├── toolkit.ts      # 工具箱
│   ├── bash.ts         # Shell 命令工具
│   ├── edit.ts         # 文件编辑工具
│   ├── glob.ts         # 文件搜索工具
│   ├── grep.ts         # 内容搜索工具
│   ├── read.ts         # 文件读取工具
│   ├── write.ts        # 文件写入工具
│   └── ...
├── model/              # 模型接口
│   └── ollama-model.ts # Ollama 支持
├── message/            # 消息格式
│   ├── msg.ts          # 消息创建与处理
│   └── index.ts
├── event/              # 事件系统
│   └── index.ts
├── storage/            # 存储接口
│   └── index.ts
├── formatter/          # 格式化
├── mcp/                # MCP 协议
└── type/               # 类型定义
```

---

## 8. 最佳实践

### 8.1 工具设计原则

1. **单一职责**: 每个工具只做一件事
2. **清晰描述**: 工具描述要准确，便于模型理解
3. **参数简洁**: 避免过多参数，必要时使用对象封装
4. **错误处理**: 返回有意义的错误信息

### 8.2 System Prompt 建议

```typescript
const sysPrompt = `你是一个专业的编程助手。

可用工具:
- read: 读取文件内容
- write: 创建或覆盖文件
- edit: 修改文件内容
- bash: 执行命令
- glob: 搜索文件
- grep: 搜索文件内容

注意事项:
1. 每次操作前确认文件路径正确
2. 执行危险操作前提示用户
3. 提供清晰的错误信息和解决方案`;
```

### 8.3 性能优化

1. **启用内存压缩**: 长对话场景开启 `compressionConfig`
2. **合理设置 maxIters**: 避免过多迭代，默认 20 已足够
3. **使用流式输出**: 提升用户体验，及时展示进度

---

## 9. 常见问题

### Q: 如何处理需要用户确认的操作？

A: 在工具中设置 `requireUserConfirm: true`，Agent 会自动暂停并发送 `REQUIRE_USER_CONFIRM` 事件，等待用户确认后继续执行。

### Q: 如何实现自定义模型？

A: 实现 `ChatModelBase` 接口：
```typescript
class MyModel implements ChatModelBase {
    modelName = 'my-model';
    stream = true;
    
    async call(params) { /* ... */ }
    async callStructured(params) { /* ... */ }
    async countTokens(params) { /* ... */ }
}
```

### Q: 如何保存和恢复 Agent 状态？

A: 实现 `StorageBase` 接口并传递给 Agent：
```typescript
const agent = new Agent({
    // ...
    storage: new MyStorage(),
});
```