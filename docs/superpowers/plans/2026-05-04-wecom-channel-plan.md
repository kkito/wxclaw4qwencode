# 企业微信 Channel 集成实现计划

## 概述

根据 spec `docs/superpowers/specs/2026-05-04-wecom-channel-design.md` 实现企业微信消息通道，与现有个人微信通道并行运行。

## 实现步骤

### 1. Channel 抽象层
- `src/channel/types.ts` — ChannelMessage 统一消息类型
- `src/channel/channel-bridge.ts` — ChannelBridge 接口定义

### 2. WecomBridge 实现
- `src/channel/wecom-bridge.ts` — 企业微信 Bridge 实现
  - 使用 `@wecom/aibot-node-sdk` 的 WSClient
  - 支持流式回复 (replyStreamNonBlocking)
  - ACP 模式支持（共享 AcpSessionManager）
  - 斜杠命令支持（共享 SlashCommandRegistry）

### 3. 配置系统更新
- `src/config.ts` — 新增 channel.wecom Zod schema 验证
- `src/config-store.ts` — 支持 channel 嵌套结构读写

### 4. 子进程启动
- `src/start-wecom.ts` — 企业微信子进程入口
- `src/start-all.ts` — 新增 wecom 子进程启动逻辑

### 5. Web 设置页面
- `src/web/views/settings.tsx` — 新增企业微信配置区域
- `src/web/server.tsx` — 新增 channel 配置 API 路由

### 6. 单元测试
- WecomBridge.extractText() 测试
- 配置验证 schema 测试
- 设置页面 API 测试

## 依赖

- `@wecom/aibot-node-sdk` 已在 package.json 中 (v1.0.6)

## 架构决策

- 每个 Channel 独立 Agent 实例，对话历史隔离
- 共享 AI 模型环境变量
- 共享 AcpSessionManager 和 SlashCommandRegistry
- Bot 模式 (WebSocket) 连接企业微信
