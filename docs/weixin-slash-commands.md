# 微信斜杠命令

## 概述

斜杠命令是 `openclaw-weixin` 框架提供的内置功能，用于处理以 `/` 开头的特殊指令。这些命令在消息处理流程的最早阶段被拦截，**不会流转到 AgentScope**。

## 支持的命令

| 命令 | 功能 |
|------|------|
| `/echo <message>` | 直接回复消息（不经过 AI），并附带通道耗时统计 |
| `/toggle-debug` | 开关 debug 模式，启用后每条 AI 回复追加全链路耗时 |

## 处理流程

```
微信消息 → extractTextBody() 提取文字
               │
               ▼
        textBody.startsWith("/") ?
               │
       ┌───────┴───────┐
       ▼               ▼
      是               否
       │               │
       ▼               ▼
handleSlashCommand()   继续走 AI 管道
       │
       ▼
  handled: true → 直接返回，不触发 AI
  handled: false → 继续走 AI 管道
```

## 源码位置

`node_modules/.pnpm/@tencent-weixin+openclaw-weixin@2.1.8/node_modules/@tencent-weixin/openclaw-weixin/src/messaging/slash-commands.ts`

## 使用示例

### /echo

发送 `/echo 你好` → 直接回复 "你好" + 通道耗时统计：

```
⏱ 通道耗时
├ 事件时间: 2025-01-01T00:00:00.000Z
├ 平台→插件: 1234ms
└ 插件处理: 5ms
```

**用途：** 测试单条消息的通道延迟，排查消息接收耗时问题。

---

### /toggle-debug

发送 `/toggle-debug` → 切换 debug 模式状态（开启/关闭）

**状态持久化：** 状态保存在 `<stateDir>/openclaw-weixin/debug-mode.json`，重启服务后仍然保留。

**调试输出内容：** 开启后，每条 AI 回复会追加完整的全链路耗时日志：

```
⏱ Debug 全链路
── 收消息 ──
│ seq=1234 msgId=567890 from=wx_user_xxx
│ body="今天天气怎么样" (len=6) itemTypes=[TEXT]
│ sessionId=abc123 contextToken=present
── 媒体 ──
│ (无)
── 路由 ──
│ agentId=default-agent
── 回复 ──
│ textLen=128 media=undefined
│ text="今天天气晴朗，气温20-28度..."
│ deliver耗时: 234ms
── 耗时 ──
├ 平台→插件: 567ms
├ 入站处理(auth+route+media): 45ms (mediaDownload: 0ms)
├ AI生成+回复: 1234ms
├ 总耗时: 1846ms
└ eventTime: 2025-01-01T00:00:00.000Z
```

**各阶段说明：**

| 阶段 | 说明 |
|------|------|
| `收消息` | 消息基本元数据：seq、message_id、发送者、内容、session |
| `媒体` | 下载的媒体信息（图片/视频/文件/语音），无媒体时显示 `(无)` |
| `路由` | 解析出的 agentId |
| `回复` | AI 回复的文本长度、媒体类型、deliver 耗时 |
| `耗时` | 全链路各阶段耗时统计 |

**耗时分解：**

| 指标 | 说明 |
|------|------|
| `平台→插件` | 微信服务器 → 插件接收 的时间间隔 |
| `入站处理` | 授权检查 + 路由解析 + 媒体下载 的总耗时 |
| `mediaDownload` | 媒体下载耗时（单独列出） |
| `AI生成+回复` | AgentScope AI 生成 + 发送回复 的总耗时 |
| `总耗时` | 消息接收到回复发送完成的完整耗时 |
| `eventTime` | 微信服务器事件时间戳 |

**用途：**

- 调试 AI 回复性能，观察全链路耗时分布
- 排查消息处理卡点（是 AI 生成慢？还是网络延迟？）
- 无需手动加日志，直接在微信里发指令就能调试

**对比手动加日志：**

| 方式 | 优点 | 缺点 |
|------|------|------|
| `/toggle-debug` | 自动完整覆盖各阶段耗时，微信端直接查看，无需改代码 | 输出格式固定 |
| 手动加日志 | 可自定义内容 | 需要改代码、重新部署，只能看日志文件 |

**推荐：** 直接使用 `/toggle-debug` 进行调试，**无需手动添加日志代码**。