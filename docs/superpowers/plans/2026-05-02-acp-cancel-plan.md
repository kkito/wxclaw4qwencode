# ACP 取消任务实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ACP 微信集成中实现 `/exit`（退出会话）和 `/cancel`（取消当前任务）两个斜杠命令。

**Architecture:** 在 `WeixinBridge` 中拦截 ACP 模式下的 `/exit` 和 `/cancel` 命令，分别调用 `AcpSessionManager.endSession()` 和新增的 `cancelTask()`。`cancelTask()` 通过 `AcpClient.cancel()` 发送 ACP `session/cancel` 通知，被取消的 `sendMessage()` promise 会以 `stopReason: "cancelled"` 返回，完成标识由正常流程发送。

**Tech Stack:** TypeScript, @agentclientprotocol/sdk, Vitest

---

### Task 1: 为 AcpClient 添加 cancel() 方法

**Files:**
- Modify: `src/acp/client.ts` (在 `sendMessage()` 方法后添加)
- Test: `tests/acp/client.test.ts` (新建)

- [ ] **Step 1: Write the failing test**

Create `tests/acp/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcpClient } from '../../src/acp/client.js';

// Mock the AcpConnection and ClientSideConnection
vi.mock('../../src/acp/connection.js', () => ({
  AcpConnection: class MockAcpConnection {
    async start() {
      return {
        cancel: vi.fn().mockResolvedValue(undefined),
      };
    }
    async close() {}
  },
}));

describe('AcpClient', () => {
  let client: AcpClient;

  beforeEach(() => {
    client = new AcpClient({ cwd: '/tmp', autoApprove: true });
    // Manually set up mock connection for testing
    client['acpConnection'] = {
      cancel: vi.fn().mockResolvedValue(undefined),
    } as any;
    client['sessionInfo'] = { sessionId: 'test-session', cwd: '/tmp' };
  });

  it('cancel calls underlying connection.cancel with sessionId', async () => {
    const cancelSpy = (client['acpConnection'] as any).cancel;
    await client.cancel();
    expect(cancelSpy).toHaveBeenCalledWith({ sessionId: 'test-session' });
  });

  it('cancel throws when no connection', async () => {
    client['acpConnection'] = null;
    await expect(client.cancel()).rejects.toThrow('未连接或未创建会话');
  });

  it('cancel throws when no sessionInfo', async () => {
    client['sessionInfo'] = null;
    await expect(client.cancel()).rejects.toThrow('未连接或未创建会话');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test:run tests/acp/client.test.ts`
Expected: FAIL — `client.cancel is not a function`

- [ ] **Step 3: Write minimal implementation**

In `src/acp/client.ts`, add after the `sendMessage()` method:

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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test:run tests/acp/client.test.ts`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/acp/client.ts tests/acp/client.test.ts
git commit -m "feat(acp): add cancel() method to AcpClient
- Add cancel() that calls underlying connection.cancel with sessionId
- Add unit tests for cancel() success and error cases"
```

---

### Task 2: 为 AcpSessionManager 添加 cancelTask() 方法

**Files:**
- Modify: `src/acp-session/manager.ts` (在 `sendMessage()` 方法后添加)
- Modify: `src/acp-session/manager.ts` — 更新 `sendMessage()` 完成标识，区分 `end_turn` 和 `cancelled`
- Test: `tests/acp-session/manager.test.ts` (添加 cancel 相关测试)

- [ ] **Step 1: Write the failing tests**

Add to `tests/acp-session/manager.test.ts` (before existing tests end):

First, update the mock to support `cancel()`:

```typescript
// Update the mock AcpClient class in the existing vi.mock block:
// Find the MockAcpClient class and add these methods:
    async cancel() {
      // Simulate: cancel causes sendMessage to resolve with cancelled
      return;
    }
    // Add method to simulate cancel interrupting sendMessage
    async sendMessageWithCancel() {
      return { stopReason: 'cancelled', usage: { input_tokens: 50, output_tokens: 10 } };
    }
```

Add new test cases:

```typescript
  it('cancelTask sends cancel to client', async () => {
    await manager.createSession('user1', '/test', sendMock);
    await manager.cancelTask('user1', sendMock);
    // cancel should have been called on the mock client
    expect(_lastMockClient._cancelCalled).toBe(true);
  });

  it('cancelTask for non-existent session warns', async () => {
    await manager.cancelTask('nobody', sendMock);
    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('不在 ACP 模式中'));
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test:run tests/acp-session/manager.test.ts`
Expected: FAIL — `manager.cancelTask is not a function`

- [ ] **Step 3: Write minimal implementation**

In `src/acp-session/manager.ts`, add after the `sendMessage()` method:

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

- [ ] **Step 4: Update sendMessage() to show different completion message for cancelled**

In `src/acp-session/manager.ts`, modify the `sendMessage()` method's completion message section. Change:

```typescript
    // 发送完成标识，标记大模型本轮回复已结束
    if (result.stopReason) {
      await sendToWeixin(`\n---\n✅ ACP 回复完成 (停止原因: ${result.stopReason})`);
    }
```

To:

```typescript
    // 发送完成标识，标记大模型本轮回复已结束
    if (result.stopReason) {
      const msg = result.stopReason === 'cancelled'
        ? '\n---\n⛔ ACP 任务已取消'
        : `\n---\n✅ ACP 回复完成 (停止原因: ${result.stopReason})`;
      await sendToWeixin(msg);
    }
```

- [ ] **Step 5: Update mock to support _cancelCalled tracking**

In `tests/acp-session/manager.test.ts`, update the mock `cancel()` method:

```typescript
    async cancel() {
      (this as any)._cancelCalled = true;
    }
```

And reset `_cancelCalled` in `beforeEach` for the mock client instance (add after `_lastMockClient = this`):

```typescript
      (this as any)._cancelCalled = false;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm run test:run tests/acp-session/manager.test.ts`
Expected: PASS (all tests including new cancel tests)

- [ ] **Step 7: Commit**

```bash
git add src/acp-session/manager.ts tests/acp-session/manager.test.ts
git commit -m "feat(acp-session): add cancelTask() method to AcpSessionManager
- Add cancelTask() that calls AcpClient.cancel()
- Distinguish cancelled vs end_turn in sendMessage completion message
- Add unit tests for cancelTask"
```

---

### Task 3: 更新 WeixinBridge 命令拦截（exit → /exit，新增 /cancel）

**Files:**
- Modify: `src/bridge/weixin-bridge.ts` (修改 `handleMessage()` 中的 ACP 命令处理)
- Test: `tests/bridge/weixin-bridge-acp.test.ts` (修改现有 exit 测试，添加 cancel 测试)

- [ ] **Step 1: Check existing ACP bridge test**

Read `tests/bridge/weixin-bridge-acp.test.ts` to understand current test structure.

- [ ] **Step 2: Write the failing tests**

Add to `tests/bridge/weixin-bridge-acp.test.ts`:

```typescript
describe('WeixinBridge ACP mode commands', () => {
  let sendMock: ReturnType<typeof vi.fn>;
  let mockAcpManager: any;
  let bridge: WeixinBridge;

  beforeEach(() => {
    sendMock = vi.fn().mockResolvedValue(undefined);
    mockAcpManager = {
      hasActiveSession: vi.fn().mockReturnValue(true),
      endSession: vi.fn().mockResolvedValue(undefined),
      cancelTask: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockResolvedValue(undefined),
    };
    bridge = new WeixinBridge({
      agent: { reply: vi.fn().mockResolvedValue(null) } as any,
      sendMessage: sendMock,
      acpManager: mockAcpManager,
    });
  });

  it('/exit ends the ACP session', async () => {
    await bridge.handleMessage({
      from_user_id: 'user1',
      item_list: [{ type: 1, text_item: { text: '/exit' } }],
    } as any);

    expect(mockAcpManager.endSession).toHaveBeenCalledWith('user1', expect.any(Function));
    expect(mockAcpManager.sendMessage).not.toHaveBeenCalled();
  });

  it('/cancel cancels the current task', async () => {
    await bridge.handleMessage({
      from_user_id: 'user1',
      item_list: [{ type: 1, text_item: { text: '/cancel' } }],
    } as any);

    expect(mockAcpManager.cancelTask).toHaveBeenCalledWith('user1', expect.any(Function));
    expect(mockAcpManager.sendMessage).not.toHaveBeenCalled();
  });

  it('exit (no slash) is treated as normal message, not a command', async () => {
    mockAcpManager.hasActiveSession = vi.fn().mockReturnValue(true);
    await bridge.handleMessage({
      from_user_id: 'user1',
      item_list: [{ type: 1, text_item: { text: 'exit' } }],
    } as any);

    // Should go through sendMessage, not endSession
    expect(mockAcpManager.endSession).not.toHaveBeenCalled();
    expect(mockAcpManager.sendMessage).toHaveBeenCalledWith('user1', 'exit', expect.any(Function));
  });

  it('EXIT (uppercase) also works as /exit', async () => {
    await bridge.handleMessage({
      from_user_id: 'user1',
      item_list: [{ type: 1, text_item: { text: '/EXIT' } }],
    } as any);

    expect(mockAcpManager.endSession).toHaveBeenCalledWith('user1', expect.any(Function));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm run test:run tests/bridge/weixin-bridge-acp.test.ts`
Expected: FAIL — `/cancel` not handled, `/exit` not handled (only `exit` was)

- [ ] **Step 4: Update WeixinBridge handleMessage**

In `src/bridge/weixin-bridge.ts`, find the ACP mode command handling section and replace:

```typescript
      // === ACP 模式消息路由 ===
      if (this.acpManager?.hasActiveSession(userId)) {
        // 检查是否是 exit 命令
        if (text.toLowerCase() === 'exit') {
          await this.acpManager.endSession(userId, async (msg) => {
            await this.sendMessageFn(userId, msg);
          });
          return;
        }

        // 路由到 ACP
        await this.acpManager.sendMessage(userId, text, async (msg) => {
          await this.sendMessageFn(userId, msg);
        });
        return;
      }
```

With:

```typescript
      // === ACP 模式消息路由 ===
      if (this.acpManager?.hasActiveSession(userId)) {
        // 检查是否是 /exit 命令
        if (text.toLowerCase() === '/exit') {
          await this.acpManager.endSession(userId, async (msg) => {
            await this.sendMessageFn(userId, msg);
          });
          return;
        }

        // 检查是否是 /cancel 命令
        if (text.toLowerCase() === '/cancel') {
          await this.acpManager.cancelTask(userId, async (msg) => {
            await this.sendMessageFn(userId, msg);
          });
          return;
        }

        // 路由到 ACP
        await this.acpManager.sendMessage(userId, text, async (msg) => {
          await this.sendMessageFn(userId, msg);
        });
        return;
      }
```

- [ ] **Step 5: Update session creation hint message**

In `src/acp-session/manager.ts`, update the session creation success message in `createSession()`:

Change:
```typescript
    await sendToWeixin(`✅ 已进入 ACP 模式\n工作目录: ${cwd}\n发送 exit 退出`);
```

To:
```typescript
    await sendToWeixin(`✅ 已进入 ACP 模式\n工作目录: ${cwd}\n发送 /exit 退出，/cancel 取消当前任务`);
```

Also update the duplicate session warning in `createSession()`:

Change:
```typescript
      await sendToWeixin('⚠️ 您已经在 ACP 模式中了，请先 exit 退出');
```

To:
```typescript
      await sendToWeixin('⚠️ 您已经在 ACP 模式中了，请先发送 /exit 退出');
```

- [ ] **Step 6: Run all related tests**

Run: `pnpm run test:run tests/bridge/weixin-bridge-acp.test.ts tests/bridge/weixin-bridge.test.ts tests/acp-session/manager.test.ts`
Expected: PASS (all tests)

- [ ] **Step 7: Commit**

```bash
git add src/bridge/weixin-bridge.ts src/acp-session/manager.ts tests/bridge/weixin-bridge-acp.test.ts
git commit -m "feat(bridge): intercept /exit and /cancel commands in ACP mode
- Change exit to /exit (slash command format)
- Add /cancel command to cancel current task without exiting session
- Update session hint messages to reflect new command format"
```

---

### Task 4: 运行完整测试套件 + Typecheck

**Files:**
- All test files
- All source files modified above

- [ ] **Step 1: Run typecheck**

Run: `pnpm run typecheck`
Expected: No type errors

- [ ] **Step 2: Run full test suite**

Run: `pnpm run test:run`
Expected: All tests pass

- [ ] **Step 3: Build**

Run: `pnpm run build`
Expected: Clean build to dist/

- [ ] **Step 4: Final commit**

If all passes:
```bash
git status
```
Verify all changes are staged and committed. No uncommitted changes.

---

## 文件变更总览

| 文件 | 变更 |
|------|------|
| `src/acp/client.ts` | 新增 `cancel()` 方法 |
| `src/acp-session/manager.ts` | 新增 `cancelTask()` 方法；更新 `sendMessage()` 完成标识区分 cancelled；更新提示消息 |
| `src/bridge/weixin-bridge.ts` | ACP 模式命令拦截：`exit` → `/exit`，新增 `/cancel` |
| `tests/acp/client.test.ts` | **新建** — AcpClient.cancel() 单元测试 |
| `tests/acp-session/manager.test.ts` | 更新 mock 支持 cancel，新增 cancelTask 测试 |
| `tests/bridge/weixin-bridge-acp.test.ts` | 新增 /exit 和 /cancel 命令拦截测试 |
