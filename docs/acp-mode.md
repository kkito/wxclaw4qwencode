# ACP 模式 — Qwen Code 集成

## 概述

ACP（Agent Client Protocol）模式允许微信用户通过微信与 `qwen` CLI 进行对话式开发。用户进入 ACP 模式后，所有消息直接路由给 qwen CLI 子进程，实现完整的 coding agent 能力。

## 架构

```
微信用户发消息
  │
  ▼
WeixinBridge.handleMessage()
  │
  ├── 用户在 ACP 会话中？
  │   ├── 是 → 路由到 AcpSessionManager
  │   │         ├── exit 命令 → 结束会话
  │   │         └── 普通消息 → AcpClient.sendMessage() → qwen CLI 子进程
  │   └── 否 → 走正常 AgentScope 流程
  │
  └── 斜杠命令前置拦截 → 执行命令 handler
```

### 核心模块

| 模块 | 文件 | 职责 |
|------|------|------|
| AcpClient | `src/acp/client.ts` | 启动 qwen 进程、创建会话、发送消息、接收响应 |
| Connection | `src/acp/connection.ts` | 底层进程管理（spawn qwen CLI，stdin/stdout 通信） |
| Handlers | `src/acp/handlers.ts` | 权限请求处理（autoApprove 自动同意）、会话更新通知 |
| SessionManager | `src/acp-session/manager.ts` | 每用户独立会话管理，30 分钟超时自动清理 |
| AcpWeixinOutput | `src/acp-session/output.ts` | 流式输出适配：缓冲 ACP 输出，按 200 字符或 3 秒阈值 flush 到微信 |
| /acp 命令 | `src/commands/acp/handler.ts` | 三种模式：scan / select / direct-path |

## 使用方式

### 1. 扫描模式：`/acp`

列出已配置的目录下所有可选项目：

```
可选项目：
1. /home/kkito/proj/myapp
2. /home/kkito/proj/other-project

发送 /acp <序号> 进入对应项目
```

### 2. 选择模式：`/acp N`

通过序号选择项目进入 ACP 会话：

```
✅ 已进入 ACP 模式
工作目录: /home/kkito/proj/myapp
发送 exit 退出
```

### 3. 直接路径模式：`/acp /path/to/project`

直接指定路径进入 ACP 模式。

### 退出 ACP 模式

发送 `exit`（不区分大小写）退出 ACP 会话：

```
👋 已退出 ACP 模式
```

## ACP 模式特点

- **模式切换**：进入后所有消息直接发给 qwen CLI，不再走 AgentScope 流程
- **流式输出**：累积 3 秒或 200 字符批量发送，避免微信频率限制
- **自动超时**：30 分钟无活动自动结束会话
- **权限自动同意**：工具调用（文件读写、shell 命令等）自动允许
- **Token 统计**：每轮回复后显示输入/输出 token 数
- **每用户独立进程**：每个微信用户独立的 qwen 进程

## 项目目录配置

ACP 项目目录通过 Web 页面 `/acp-dirs` 或 API 管理：

| API | 说明 |
|-----|------|
| `GET /api/acp-dirs` | 列出已配置目录 |
| `POST /api/acp-dirs` | 添加目录 |
| `DELETE /api/acp-dirs/:path` | 删除目录（URL-encoded path） |

数据存储在 `~/.ownclaw/acp-dirs.json`。

## 数据流

```
用户发消息 "帮我查看项目结构"
  │
  ▼
AcpSessionManager.sendMessage()
  │
  ▼
AcpClient.sendMessage("帮我查看项目结构")
  │
  ├── spawn qwen --acp 进程
  ├── 创建 session
  ├── 发送 prompt
  │
  └── sessionUpdate 回调（流式输出）
       │
       ▼
     AcpWeixinOutput.onSessionUpdate()
       ├── 缓冲文本
       ├── 过滤 "正在调用" 等工具调用中间文本
       └── 达到阈值 → flush 到微信
```
