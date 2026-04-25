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
├── cron/                  # Cron 定时任务模块
│   ├── types.ts           # 类型定义 (CronJob, CronLogEntry)
│   ├── schema.ts          # Zod 验证 schema
│   ├── store.ts           # 文件存储 (jobs.json + logs)
│   ├── executor.ts        # bash 命令执行 + 日志记录
│   ├── scheduler.ts       # node-cron 调度管理
│   ├── manager.ts         # 高层管理器 (组合 store/scheduler/executor)
│   └── index.ts           # 统一导出
├── model/
│   └── custom-model.ts    # 自定义模型客户端 (继承 ChatModelBase)
├── bridge/
│   └── weixin-bridge.ts   # 微信消息 ↔ AgentScope 消息转换
├── runner/
│   └── agent-runner.ts    # Agent 生命周期管理
└── web/
    ├── index.ts           # Web 模块导出
    ├── server.tsx         # Hono Web 服务器 (含 cron API 路由)
    └── views/
        ├── index.tsx      # 首页
        └── cron.tsx       # Cron 管理页面

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

### Cron 配置存储

| 路径 | 说明 |
|------|------|
| `~/.ownclaw/cron/jobs.json` | Cron 任务列表 |
| `~/.ownclaw/cron/logs/` | Cron 执行日志 |

## Cron 功能

通过 Web 界面 (`/cron`) 或 API 管理 bash 脚本定时任务:

| API | 说明 |
|-----|------|
| `GET /api/cron/jobs` | 列出所有任务 |
| `POST /api/cron/jobs` | 创建任务 |
| `GET /api/cron/jobs/:id` | 获取单个任务 |
| `PUT /api/cron/jobs/:id` | 更新任务 |
| `DELETE /api/cron/jobs/:id` | 删除任务 |
| `POST /api/cron/jobs/:id/run` | 手动触发执行 |
| `GET /api/cron/jobs/:id/logs` | 查看执行日志 |
| `DELETE /api/cron/jobs/:id/logs` | 清空日志 |

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

### 5. cron/ (Cron 定时任务)
- `CronManager`: 高层管理器，组合存储/执行/调度
- `CronJobStore`: 文件存储任务配置和执行日志
- `CronExecutor`: 执行 bash 命令并捕获输出
- `CronScheduler`: 使用 node-cron 注册/停止定时任务
- 支持通过 Web API 和界面管理 cron 任务

### 6. web/ (Web 界面)
- `createWebServer()`: 创建 Hono 服务器
- 内置 `/health` 健康检查和 `/cron` 管理页面

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