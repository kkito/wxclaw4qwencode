# OwnClaw 项目指南

## 项目概述

OwnClaw 是一个 TypeScript/Node.js 库，用于将微信消息通道与 [AgentScope](https://github.com/agentscope/agentscope) AI Agent 框架集成。它接收微信用户消息，转换为 AgentScope 格式，经过 AI 处理后发送回复。

### 核心技术栈

- **语言**: TypeScript (ES2022)
- **AI 框架**: @agentscope-ai/agentscope
- **微信通道**: @tencent-weixin/openclaw-weixin
- **配置验证**: Zod
- **测试**: Vitest

## 项目结构

```
src/
├── config.ts              # 环境变量配置加载与 Zod 验证
├── index.ts               # 入口文件，统一导出
├── example.ts             # 使用示例
├── model/
│   └── custom-model.ts    # 自定义模型客户端 (继承 ChatModelBase)
├── bridge/
│   └── weixin-bridge.ts   # 微信消息 ↔ AgentScope 消息转换
└── runner/
    └── agent-runner.ts    # Agent 生命周期管理

tests/                     # Vitest 单元测试
docs/                      # 文档资料
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm install` | 安装依赖 |
| `pnpm run build` | 编译 TypeScript 到 `dist/` |
| `pnpm run dev` | 监听模式编译 (watch) |
| `pnpm run typecheck` | 类型检查 |
| `pnpm run test` | 运行测试 (watch 模式) |
| `pnpm run test:run` | 运行测试 (单次) |

## 配置说明

通过环境变量配置：

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `AGENT_MODEL_BASE_URL` | 是 | - | 模型 API 地址 (如 `https://api.openai.com/v1`) |
| `AGENT_MODEL_API_KEY` | 否 | - | API Key |
| `AGENT_MODEL_NAME` | 否 | `gpt-4o` | 模型名称 |
| `AGENT_SYS_PROMPT` | 否 | `你是一个友好的 AI 助手。` | 系统提示词 |

## 核心模块

### 1. config.ts
- `loadConfig()`: 从环境变量读取配置并通过 Zod 验证
- `ConfigSchema`: Zod 配置验证 schema
- `Config`: TypeScript 类型推断

### 2. model/custom-model.ts
- `CustomModel`: 继承 AgentScope 的 `ChatModelBase`
- 支持流式和非流式响应
- 支持 OpenAI 兼容格式的 API

### 3. bridge/weixin-bridge.ts
- `WeixinBridge`: 消息转换桥梁
- `handleMessage()`: 处理收到的微信消息
- 支持文本/图片/语音/文件/视频消息 (非文本返回提示)

### 4. runner/agent-runner.ts
- `AgentRunner`: Agent 生命周期管理
- `createAgentRunner()`: 工厂函数，一键创建并启动

## 开发约定

- **模块系统**: ES Modules (`"type": "module"`)
- **TypeScript**: 严格模式 (`strict: true`)
- **代码风格**: 遵循项目现有风格，使用 TypeScript 类型
- **测试**: 使用 Vitest，测试文件放在 `tests/` 目录，保持与 `src/` 对应的目录结构

## 依赖

```json
{
  "@agentscope-ai/agentscope": "^0.0.2",
  "@tencent-weixin/openclaw-weixin": "^2.1.8",
  "zod": "^4.3.6"
}
```

## 相关文档

- [AgentScope 文档](./docs/agentscope.md)
- [OpenClaw 微信核心](./docs/openclaw-weixin-core.md)