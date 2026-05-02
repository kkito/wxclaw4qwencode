# OwnClaw - 微信 + AgentScope + ACP 集成

基于 AgentScope 框架的微信消息处理集成，支持使用自定义大模型 API 处理微信消息，并通过 ACP 协议连接 `qwen --acp` 进行代码开发。

## 概述

OwnClaw 将微信消息通道（openclaw-weixin）与 AgentScope AI Agent 框架连接，实现：

- 接收微信用户消息 → 转换为 AgentScope 格式 → AI 处理 → 发送回复
- 支持自定义模型 API（OpenAI 兼容格式）
- 斜杠命令系统（可扩展）
- **ACP 开发模式** — 通过微信连接 `qwen --acp` 进程进行代码开发
- Cron 定时任务管理
- Skills 插件能力
- Web 管理界面

## 架构

```
微信消息
  │
  ▼
SlashCommandRouter（前置拦截）
  │
  ├── /acp /path/to/project → ACP 会话 → qwen --acp 子进程 → 流式回复微信
  │                              │
  │                              └── exit/quit 或超时 → 返回 AgentScope 流程
  │
  └── 其他消息 → WeixinBridge → AgentScope Agent → 微信回复
```

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 绑定微信

```bash
pnpm run bind
```

### 3. 配置环境变量

```bash
# 必需：模型 API 地址
export AGENT_MODEL_BASE_URL=https://api.example.com/v1

# 必需：API Key
export AGENT_MODEL_API_KEY=your-api-key

# 可选：模型名称，默认 gpt-4o
export AGENT_MODEL_NAME=gpt-4o

# 可选：系统提示词
export AGENT_SYS_PROMPT=你是一个友好的 AI 助手。
```

### 4. 启动

```bash
# 前台运行
pnpm run start

# 后台运行
pnpm run start -- --detach
```

### 5. Web 管理界面

```bash
pnpm run web          # 前台
pnpm run web -- --detach  # 后台

# 浏览器访问 http://localhost:3525
```

## 项目结构

```
src/
├── config.ts              # 配置加载与 Zod 验证
├── index.ts               # 统一导出入口
├── logger.ts              # 日志系统
├── cli.ts                 # CLI 入口（bind/unbind/status）
├── start.ts               # 微信消息模式启动脚本
├── start-web.ts           # Web 服务器启动脚本
├── example.ts             # 使用示例
├── model/
│   └── custom-model.ts    # 自定义模型客户端 (继承 ChatModelBase)
├── bridge/
│   └── weixin-bridge.ts   # 微信消息 ↔ AgentScope 消息转换
├── runner/
│   └── agent-runner.ts    # Agent 生命周期管理
├── acp/                   # ACP 客户端模块
│   ├── client.ts          # AcpClient 高层封装
│   ├── connection.ts      # qwen --acp 进程连接管理
│   ├── handlers.ts        # 权限请求和会话更新处理
│   ├── output.ts          # 终端输出格式化
│   └── types.ts           # 类型定义
├── acp-session/           # ACP 微信会话管理
│   ├── session.ts         # 单个 ACP 会话封装
│   ├── manager.ts         # 多用户会话管理
│   ├── output.ts          # ACP 流式输出 → 微信消息
│   └── index.ts           # 统一导出
├── slash-command/         # 斜杠命令通用框架
│   ├── registry.ts        # 命令注册表
│   ├── loader.ts          # 从文件系统加载命令
│   └── index.ts           # 统一导出
├── cron/                  # Cron 定时任务
│   ├── manager.ts         # 调度管理
│   ├── store.ts           # 文件存储
│   └── executor.ts        # 命令执行
├── skills/                # Skills 插件
│   ├── manager.ts         # Skills 管理和 Toolkit 创建
│   └── store.ts           # 文件存储
└── web/                   # Web 管理界面
    ├── server.tsx         # Hono 服务器
    └── views/             # 页面组件
```

## 功能使用

### 微信 AI 对话

启动后，微信用户直接发消息即可与 AI 对话。

### ACP 开发模式

通过 `/acp` 命令进入 ACP 模式，连接 `qwen --acp` 进程进行代码开发：

```
# 进入 ACP 模式（必须指定项目路径）
/acp /home/kkito/proj/myapp

# 进入后，所有消息都会转发给 qwen --acp 处理
# 例如：
帮我查看当前项目结构
在这个目录下创建一个 main.py 文件

# 退出 ACP 模式
exit
# 或
quit
```

**ACP 模式特点：**
- 每次回复前会显示 `[ACP 模式] 工作目录: /path/to/project`
- 支持流式输出（累积 3 秒或 200 字符批量发送）
- 30 分钟无消息自动退出
- 每个微信用户独立的 ACP 进程

### 斜杠命令

OwnClaw 采用文件驱动的斜杠命令架构。命令存储在 `~/.ownclaw/commands/` 目录，每个子目录一个命令：

```
~/.ownclaw/commands/
├── acp/
│   ├── COMMAND.md    # 命令元数据
│   └── handler.ts    # 处理逻辑
└── ...               # 未来可扩展更多命令
```

当前支持的命令：

| 命令 | 说明 |
|------|------|
| `/acp /path/to/project` | 进入 ACP 开发模式 |
| `/echo <message>` | 直接回复（openclaw-weixin 内置） |
| `/toggle-debug` | 切换调试模式（openclaw-weixin 内置） |

### Cron 定时任务

通过 Web 界面 `/cron` 或 API 管理 bash 脚本定时任务。

### Skills 插件

Skills 存储在 `~/.ownclaw/skills/` 目录，每个 Skill 一个子目录。Agent 启动时自动加载。

### Web 管理界面

访问 `http://localhost:3525` 查看：
- `/cron` — Cron 定时任务管理
- `/skills` — Skills 管理
- `/sysprompt` — 系统提示词管理

## 配置说明

### 环境变量

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `AGENT_MODEL_BASE_URL` | 是 | - | 模型 API 地址 |
| `AGENT_MODEL_API_KEY` | 是 | - | API Key |
| `AGENT_MODEL_NAME` | 否 | `gpt-4o` | 模型名称 |
| `AGENT_SYS_PROMPT` | 否 | `你是一个友好的 AI 助手。` | 系统提示词 |
| `OWNCLAW_WEB_PORT` | 否 | `3525` | Web 服务器端口 |
| `OWNCLAW_WEB_HOST` | 否 | `0.0.0.0` | Web 服务器地址 |
| `OWNCLAW_STATE_DIR` | 否 | `~/.ownclaw` | 状态存储目录 |

### 配置文件位置

| 路径 | 说明 |
|------|------|
| `~/.ownclaw/openclaw-weixin/` | 微信账户配置 |
| `~/.ownclaw/cron/jobs.json` | Cron 任务列表 |
| `~/.ownclaw/skills/` | Skills 目录 |
| `~/.ownclaw/commands/` | 斜杠命令目录 |
| `~/.ownclaw/sysprompt` | 系统提示词 |

## CLI 命令

```bash
pnpm run bind      # 绑定微信
pnpm run unbind    # 解绑微信
pnpm run status    # 查看绑定状态
```

## 开发

```bash
pnpm run build       # 编译 TypeScript
pnpm run dev         # 监听模式编译
pnpm run test        # 运行测试
pnpm run typecheck   # 类型检查
```

## 测试

OwnClaw 包含三层测试体系，详见 [测试指南](docs/testing.md)：

| 层次 | 位置 | 说明 |
|---|---|---|
| 单元测试 | `tests/` 下各模块 | 测单个函数/类，mock 所有依赖 |
| Web 路由测试 | `tests/web/*.test.ts` | 通过 `app.request()` 测完整 Hono 应用（页面+API） |
| TSX 组件测试 | `tests/web/index.test.ts` | 直接 `jsx()` 渲染单个组件 |

```bash
pnpm run test:run      # 运行全部 259 个用例
npx vitest run tests/web/  # 只运行 Web 相关测试
```

## 依赖

- `@agentscope-ai/agentscope` — AI Agent 框架
- `@tencent-weixin/openclaw-weixin` — 微信通道
- `@agentclientprotocol/sdk` — ACP 协议 SDK
- `zod` — 配置验证
- `hono` — Web 框架
- `node-cron` — 定时任务调度

## 文档

- [ACP 协议规范](docs/acp-protocol.md) — ACP 数据协议详解
- [AgentScope 框架](docs/agentscope.md) — AgentScope 核心概念
- [OpenClaw 微信核心](docs/openclaw-weixin-core.md) — 微信通道 API
- [斜杠命令](docs/weixin-slash-commands.md) — 斜杠命令架构
- [微信群支持](docs/weixin-group-support.md) — 群消息处理
- [测试指南](docs/testing.md) — 测试体系说明
- [TODO](docs/TODO.md) — 待办事项

## License

GPL-3.0