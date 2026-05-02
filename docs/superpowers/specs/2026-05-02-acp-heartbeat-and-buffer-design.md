# ACP 心跳通知 + 缓冲阈值调整设计

## 背景

ACP 模式下，工具调用和思考过程不会发送任何消息到微信。长时间任务执行期间，用户看不到任何"还在运行中"的提示，无法判断是正在执行还是已经异常中断。

同时，当前的消息缓冲阈值（200 字符）过小，导致某些阶段回复被过早截断发送。

## 需求

1. **心跳通知**：ACP 模式下，如果 5 分钟内没有向用户发送过任何消息，发一条心跳通知告知"仍在工作"
2. **缓冲阈值调整**：将 `flushThresholdChars` 从 200 调整到更大的值

## 设计

### 一、心跳通知

#### 1.1 位置

在 `AcpWeixinOutput` 中新增心跳逻辑。原因：
- 它是 ACP 消息发送到微信的唯一出口
- 已经有 `cleanup(userId)` 生命周期钩子，方便清理定时器
- 不需要改动工具调用流程

#### 1.2 架构

```
┌─────────────────────────────────────────────────────┐
│  AcpWeixinOutput                                     │
│                                                      │
│  per-user state:                                     │
│  ┌─────────────────────────────────┐                 │
│  │  UserBuffer (已有)              │                 │
│  │  - text: string                 │                 │
│  │  - timer: flush 定时器          │                 │
│  └─────────────────────────────────┘                 │
│                                                      │
│  ┌─────────────────────────────────┐                 │
│  │  HeartbeatState (新增)          │                 │
│  │  - lastSentTime: Date           │                 │
│  │  - heartbeatTimer: setInterval  │                 │
│  └─────────────────────────────────┘                 │
└─────────────────────────────────────────────────────┘

触发链：
flushBuffer() → sendMessage() → 更新 lastSentTime

检查：
每 60s setInterval → 如果 now - lastSentTime > 5min
  → sendHeartbeat() → "⏳ 仍在工作中..."
```

#### 1.3 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 心跳间隔 | 5 分钟 | 足够长避免骚扰，足够短让用户知道还活着 |
| 检查频率 | 每 60 秒 | 避免过度检查，与 5 分钟间隔匹配 |
| 心跳消息格式 | `⏳ 仍在工作中...` | 简洁，不阻塞对话流 |
| 是否跳过节流器 | 否，走正常节流 | 避免心跳 + 正常回复两条紧挨着发送 |
| 覆盖范围 | 仅 ACP 模式 | Executor 后台任务后续可扩展 |

#### 1.4 代码变更

**`src/acp-session/output.ts`**

新增 per-user 心跳状态管理：

```typescript
interface HeartbeatState {
  lastSentTime: Date;
  timer: ReturnType<typeof setInterval> | null;
  hasNotified: boolean; // 防止连续发多条心跳
}
```

新增方法：
- `startHeartbeat(userId, sendMessage)` — 启动 setInterval 检查
- `checkHeartbeat(userId, sendMessage)` — 检查是否需要发心跳
- `recordSent(userId)` — 每次发送消息后调用，重置 lastSentTime
- `stopHeartbeat(userId)` — 清理定时器

修改点：
- `flushBuffer()` 末尾调用 `recordSent(userId)`
- `onComplete()` / `cleanup()` 调用 `stopHeartbeat(userId)`
- `onSessionUpdate()` 中 `agent_message_chunk` 时调用 `recordSent(userId)`

#### 1.5 边界情况

| 场景 | 处理 |
|------|------|
| 会话退出 | `cleanup(userId)` 清理心跳定时器 |
| 30 分钟超时 | 超时清理时自动清理心跳定时器 |
| 工具调用期间 | 不发送消息 → lastSentTime 不更新 → 5 分钟后触发心跳 |
| 心跳发送失败 | 静默处理，不阻塞正常流程 |

### 二、缓冲阈值调整

#### 2.1 变更

`src/acp-session/output.ts` 中 `flushThresholdChars` 默认值：

```
旧：200 字符
新：2000 字符
```

#### 2.2 理由

- 200 字符在中文环境下可能只是一两句话，容易被过早截断
- 2000 字符是"一段话"的合理级别，用户等待时间可接受
- `flushIntervalMs = 3000` 兜底：即使不满 2000 字符，3 秒后也会发送
- 后续可通过 Settings 页面做成可配置

#### 2.3 影响

| 场景 | 之前 (200 char) | 之后 (2000 char) |
|------|-----------------|------------------|
| 短回复 (50 字) | 3 秒后发送 | 3 秒后发送（不变） |
| 中等回复 (500 字) | 累积 200 字立即发送 | 3 秒后发送 |
| 长回复 (5000 字) | 每 200 字发一次 | 每 2000 字发一次 |

### 三、配置

当前写死，后续可扩展到 Settings 页面：

```typescript
// 当前
HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000    // 5 分钟
HEARTBEAT_CHECK_MS = 60 * 1000            // 60 秒
FLUSH_THRESHOLD_CHARS = 2000              // 2000 字符
FLUSH_INTERVAL_MS = 3000                  // 3 秒（已有）
```

## 未涉及

- Executor 后台任务的心跳通知（后续可扩展）
- 工具调用详情通知（不在本次范围内）
- Settings 页面可配置（后续可扩展）
