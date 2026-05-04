# OwnClaw

微信消息通道 × AgentScope AI 框架 × ACP 开发模式集成。

## 核心功能

### 1. ACP 开发模式

微信发送 `/acp` 选择项目后进入 coding agent 模式，所有消息直接路由给 qwen CLI，实现对话式开发。

**使用方式：**

| 命令 | 说明 |
|------|------|
| `/acp` | 扫描已配置的目录下所有可选项目 |
| `/acp N` | 通过序号选择项目进入 ACP 会话 |
| `/acp /path/to/project` | 直接指定路径进入 ACP 会话 |
| `exit` | 退出 ACP 模式 |

**特点：**
- **模式切换**：进入后所有消息直接发给 qwen CLI，不再走 AgentScope 流程
- **流式输出**：累积 3 秒或 200 字符批量发送，避免微信频率限制
- **自动超时**：30 分钟无活动自动结束会话
- **权限自动同意**：工具调用（文件读写、shell 命令等）自动允许
- **Token 统计**：每轮回复后显示输入/输出 token 数

**数据流：**

```
用户发消息 "帮我查看项目结构"
  │
  ▼
AcpSessionManager.sendMessage()
  │
  ▼
AcpClient.sendMessage()
  ├── spawn qwen --acp 进程
  ├── 创建 session
  ├── 发送 prompt
  └── sessionUpdate 回调（流式输出）
       ▼
     AcpWeixinOutput.onSessionUpdate()
       ├── 缓冲文本
       ├── 过滤 "正在调用" 等工具调用中间文本
       └── 达到阈值 → flush 到微信
```

详见 [ACP 模式文档](docs/acp-mode.md)。

### 2. Executor 长任务执行器

基于 ACP 和 Superpower 的异步任务队列系统。用户提前编写好 spec 文件（任务规格说明），Executor 会自动读取 spec 并利用 Superpower 的能力自动完成实现。与 ACP 模式的实时交互不同，Executor 适合批量/异步场景：用户提交 spec 后，系统排队自动执行，无需用户在线等待。

**工作流程：**

1. 用户编写 spec 文件，定义任务需求和规格
2. 通过 Web 界面或 API 提交任务，选择对应的 spec 文件
3. Executor 读取 spec，利用 Superpower 功能自动完成实现
4. 任务排队执行，全程无需用户干预

**任务状态：** `pending → running → completed`，失败时标记为 `failed`。

**管理方式：**

- Web 页面 `/executor`：创建任务、选择项目、选择 spec 文件、查看队列、启动/停止执行器、删除/重新入队
- API：`/api/executor/tasks` CRUD + `/api/executor/start` `/api/executor/stop`

详见 [Executor 文档](docs/executor.md)。

### 3. AgentScope 聊天机器人

默认对话模式，微信消息经 WeixinBridge 转换后由 AgentScope Agent 处理回复。

**消息流程：**

```
微信用户发消息
  │
  ▼
WeixinBridge.handleMessage()
  ├── 提取文本
  ├── 检查 ACP 会话 → 已路由到 ACP（见功能 1）
  ├── 斜杠命令前置拦截 → 执行命令 handler
  └── 正常消息 → AgentScope Agent.reply() → 微信回复
```

**支持能力：**
- 文本消息处理（图片/语音/文件/视频暂不支持）
- 斜杠命令系统（文件驱动，`~/.ownclaw/commands/` 目录可扩展）
- Skills 自动注入（AgentScope Toolkit，扫描 `~/.ownclaw/skills/`）
- 发送限流（可配置间隔，避免触发微信 API 频率限制）
- 自动重试（指数退避，最长 30 分钟）
- 自定义模型（OpenAI 兼容格式 API）

详见 [AgentScope 文档](docs/agentscope.md)。

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
# 必需
export AGENT_MODEL_BASE_URL=https://api.example.com/v1
export AGENT_MODEL_API_KEY=your-api-key

# 可选
export AGENT_MODEL_NAME=gpt-4o
export AGENT_SYS_PROMPT=你是一个友好的 AI 助手。
```

### 4. 启动

```bash
pnpm run start              # 前台运行（仅微信消息服务）
pnpm run start -- --detach  # 后台运行
pnpm run web                # 启动 Web 管理界面（http://localhost:3525）
pnpm run start:all          # 同时启动微信 + Web
```

## Web 管理页面

访问 `http://localhost:3525`：

| 路径 | 说明 |
|------|------|
| `/` | 首页 |
| `/cron` | Cron 定时任务管理 |
| `/executor` | 长任务队列管理 |
| `/skills` | Skills 插件管理 |
| `/settings` | 系统设置（发送限流等） |
| `/acp-dirs` | ACP 项目目录配置 |

## 配置

### 环境变量

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `AGENT_MODEL_BASE_URL` | 是 | - | 模型 API 地址 |
| `AGENT_MODEL_API_KEY` | 是 | - | API Key |
| `AGENT_MODEL_NAME` | 否 | `gpt-4o` | 模型名称 |
| `AGENT_SYS_PROMPT` | 否 | `你是一个友好的 AI 助手。` | 系统提示词 |
| `OWNCLAW_WEB_PORT` | 否 | `3525` | Web 服务器端口 |
| `OWNCLAW_STATE_DIR` | 否 | `~/.ownclaw` | 状态存储目录 |

### 状态存储

| 路径 | 说明 |
|------|------|
| `~/.ownclaw/openclaw-weixin/` | 微信账户配置 |
| `~/.ownclaw/cron/jobs.json` + `logs/` | Cron 任务及日志 |
| `~/.ownclaw/executor/tasks.json` | Executor 任务列表 |
| `~/.ownclaw/skills/` | Skills 插件目录 |
| `~/.ownclaw/commands/` | 斜杠命令目录 |
| `~/.ownclaw/acp-dirs.json` | ACP 项目目录配置 |

## CLI

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

## 项目结构

```
src/
├── config.ts              # 配置加载与 Zod 验证
├── logger.ts              # 日志系统
├── cli.ts / cli/          # CLI 入口（bind/unbind/status）
├── start.ts               # 微信服务启动脚本
├── start-web.ts           # Web 服务器启动脚本
├── start-all.ts           # 统一启动（微信 + Web）
├── model/
│   └── custom-model.ts    # 自定义模型客户端
├── bridge/
│   └── weixin-bridge.ts   # 微信消息 ↔ AgentScope 消息转换
├── runner/
│   └── agent-runner.ts    # Agent 生命周期管理
├── acp/                   # ACP 客户端（qwen 进程连接）
├── acp-session/           # ACP 会话管理（per-user，超时清理）
├── acp-config/            # ACP 项目目录配置（扫描/选择）
├── commands/              # 斜杠命令实现
├── slash-command/         # 斜杠命令框架（注册/加载）
├── executor/              # 长任务执行器（基于 ACP 的队列）
├── cron/                  # Cron 定时任务
├── skills/                # Skills 插件管理
├── config-store.ts        # 通用配置存储（发送限流等）
└── web/                   # Web 管理界面（Hono）
```

## 其他模块

| 模块 | 说明 | 存储位置 |
|------|------|---------|
| **Cron 定时任务** | 管理 bash 脚本定时执行 | `~/.ownclaw/cron/jobs.json` + `logs/` |
| **Skills 管理** | 创建/编辑/安装 Skills，注入 AgentScope Toolkit | `~/.ownclaw/skills/` |
| **斜杠命令系统** | 动态加载 `~/.ownclaw/commands/` 下的命令 | `COMMAND.md` + `handler.js` |
| **发送限流** | 控制微信 sendMessage 频率间隔 | config-store.json |

## 文档

| 文档 | 说明 |
|------|------|
| [ACP 模式](docs/acp-mode.md) | ACP 开发模式架构、使用方式、数据流 |
| [Executor](docs/executor.md) | 长任务执行器架构、API、超时机制 |
| [AgentScope](docs/agentscope.md) | AgentScope 框架集成 |
| [斜杠命令](docs/weixin-slash-commands.md) | 斜杠命令架构 |
| [ACP 协议](docs/acp-protocol.md) | ACP 数据协议详解 |
| [微信核心](docs/openclaw-weixin-core.md) | 微信通道 API |
| [微信群支持](docs/weixin-group-support.md) | 群消息处理 |
| [WebSocket Channel](docs/websocket-channel.md) | WebSocket 消息通道 API、协议、多客户端连接 |
| [测试指南](docs/testing.md) | 测试体系说明 |

## 依赖

- `@agentscope-ai/agentscope` — AI Agent 框架
- `@tencent-weixin/openclaw-weixin` — 微信通道
- `@agentclientprotocol/sdk` — ACP 协议 SDK
- `zod` — 配置验证
- `hono` — Web 框架
- `node-cron` — 定时任务调度

## License

GPL-3.0
