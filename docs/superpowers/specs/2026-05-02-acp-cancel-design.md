# ACP 取消任务设计文档

**日期**: 2026-05-02
**状态**: 待审查

## 目标

在 ACP（Agent Client Protocol）微信集成中实现两个斜杠命令：

- `/exit`：退出整个 ACP 会话（现有 `exit` 功能改为斜杠命令格式）
- `/cancel`：取消当前正在执行的任务，但保持 ACP 会话活跃，用户可以继续发送新消息

取消任务的执行结果需要通知微信前端。

## 背景

在 Qwen Code 编辑器中，用户可以通过多次按 Esc 取消正在执行的任务。但在 ACP 微信集成模式下，缺少对应的取消机制。用户只能等待任务完成或发送 `exit` 退出整个会话，无法中途取消单个任务。

ACP 协议本身支持取消操作：Client 发送 `session/cancel` JSON-RPC 通知，Agent 收到后中止 LLM 请求和工具调用，并以 `stopReason: "cancelled"` 响应原始 prompt 请求。

## 架构设计

### 调用链

```
微信用户发送 /cancel
    ↓
WeixinBridge.handleMessage() 拦截命令
    ↓
AcpSessionManager.cancelTask(userId, sendToWeixin)
    ↓
AcpClient.cancel() → 底层 ACP connection 发送 session/cancel
    ↓
qwen --acp 收到取消通知，中止 prompt 执行
    ↓
原始 prompt promise resolve，返回 stopReason: "cancelled"
    ↓
AcpSessionManager 捕获结果，发送"任务已取消"通知到微信
```

### 组件职责

| 文件 | 变更 |
|------|------|
| `src/acp/client.ts` | 新增 `cancel()` 方法：调用底层 `acpConnection.cancel()` |
| `src/acp-session/manager.ts` | 新增 `cancelTask()` 方法：取消当前 prompt，等待结果，发送取消通知到微信 |
| `src/bridge/weixin-bridge.ts` | 命令拦截：将 `exit` 改为 `/exit`，新增 `/cancel` 拦截 |

## 详细设计

### 1. AcpClient.cancel()

```typescript
/**
 * 取消当前正在进行的 prompt 操作
 * 不关闭连接/会话，用户可以继续发消息
 */
async cancel(): Promise<void> {
  if (!this.acpConnection || !this.sessionInfo) {
    throw new Error('未连接或未创建会话');
  }
  await this.acpConnection.cancel({
    sessionId: this.sessionInfo.sessionId,
  });
}
```

**注意**：`ClientSideConnection` 的 `cancel` 方法需要确认是否存在。如果 SDK 没有暴露，需要通过 `extNotification` 发送原始 JSON-RPC：`{ method: "session/cancel", params: { sessionId } }`。

### 2. AcpSessionManager.cancelTask()

```typescript
async cancelTask(
  userId: string,
  sendToWeixin: (msg: string) => Promise<void>,
): Promise<void> {
  const session = this.sessions.get(userId);
  if (!session) {
    await sendToWeixin('⚠️ 当前不在 ACP 模式中');
    return;
  }

  // 调用 client.cancel() 发送取消通知
  try {
    await session.client.cancel();

    // 等待 sendMessage 的 promise resolve（会被 cancel 中断）
    // cancel 后 stopReason 应为 "cancelled"
    await sendToWeixin('⛔ 任务已取消');
  } catch (err) {
    await sendToWeixin(`❌ 取消失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}
```

**问题**：`cancel()` 发送的是 notification，不等待 response。但 `sendMessage()` 那边还在等待 `prompt()` 的 promise resolve。需要在 `cancel()` 和 `sendMessage()` 之间协调。

**解决方案**：`cancelTask()` 只需要调用 `client.cancel()`，`sendMessage()` 的 promise 会在被取消后自行 resolve（返回 `stopReason: "cancelled"`），然后由 `sendMessage()` 的正常流程发送完成标识。

所以 `cancelTask()` 简化为：

```typescript
async cancelTask(
  userId: string,
  sendToWeixin: (msg: string) => Promise<void>,
): Promise<void> {
  const session = this.sessions.get(userId);
  if (!session) {
    await sendToWeixin('⚠️ 当前不在 ACP 模式中');
    return;
  }

  try {
    await session.client.cancel();
  } catch (err) {
    await sendToWeixin(`❌ 取消失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}
```

取消后的完成提示由 `sendMessage()` 的正常流程处理（`stopReason === 'cancelled'` 时显示 `⛔ ACP 任务已取消`）。

### 3. WeixinBridge 命令拦截

修改 `handleMessage()` 中 ACP 模式的命令处理：

```typescript
// ACP 模式下的命令拦截
if (text.toLowerCase() === '/exit') {
  await this.acpManager.endSession(userId, async (msg) => {
    await this.sendMessageFn(userId, msg);
  });
  return;
}

if (text.toLowerCase() === '/cancel') {
  await this.acpManager.cancelTask(userId, async (msg) => {
    await this.sendMessageFn(userId, msg);
  });
  return;
}
```

同时删除原有的 `exit`（无斜杠）命令处理。

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| 不在 ACP 模式发送 `/cancel` | 提示"当前不在 ACP 模式中" |
| 没有正在执行的任务时 `/cancel` | cancel() 发送后无效果，下次 prompt 正常执行 |
| cancel 调用失败 | 提示"取消失败，请尝试发送 /exit 退出" |
| ACP SDK 没有 cancel 方法 | 使用 extNotification 发送原始 JSON-RPC |

## 测试计划

1. **单元测试**：`AcpClient.cancel()` — 验证调用底层 cancel
2. **单元测试**：`AcpSessionManager.cancelTask()` — 验证 session 状态检查
3. **集成测试**：微信发送 `/cancel` → 验证取消流程端到端

## 影响范围

- 不改变现有 ACP 会话生命周期
- 不影响非 ACP 模式的消息处理
- 向后兼容：原来的 `exit` 改为 `/exit`，是破坏性变更（用户需要改用新命令格式）
