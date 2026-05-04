import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AcpSessionManager } from '../../src/acp-session/manager.js';

// Mock AcpClient - must be before imports
let _lastMockClient: any = null;

vi.mock('../../src/acp/client.js', () => ({
  AcpClient: class MockAcpClient {
    private _closed = false;
    private _sessionUpdateCallback: ((update: any) => void) | null = null;
    constructor() {
      _lastMockClient = this;
      (this as any)._cancelCalled = false;
    }
    async start() {}
    async sendMessage() {
      return { usage: { input_tokens: 100, output_tokens: 50 } };
    }
    async cancel() {
      (this as any)._cancelCalled = true;
    }
    async close() {
      this._closed = true;
    }
    getSessionInfo() {
      return { sessionId: 'mock', cwd: '/test' };
    }
    setSessionUpdateCallback(cb: (update: any) => void) {
      this._sessionUpdateCallback = cb;
    }
    // Expose callback for testing server-side activity simulation
    _triggerServerUpdate(update: any) {
      if (this._sessionUpdateCallback) {
        this._sessionUpdateCallback(update);
      }
    }
  },
}));

describe('AcpSessionManager', () => {
  let manager: AcpSessionManager;
  let sendMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    sendMock = vi.fn().mockResolvedValue(undefined);
    manager = new AcpSessionManager({ timeoutMs: 5000 }); // 5 second timeout for tests
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a session', async () => {
    await manager.createSession('user1', '/test', sendMock);
    expect(manager.hasActiveSession('user1')).toBe(true);
    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('已进入 ACP 模式'));
  });

  it('rejects duplicate session creation', async () => {
    await manager.createSession('user1', '/test', sendMock);
    sendMock.mockClear();
    await manager.createSession('user1', '/other', sendMock);
    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('已经在 ACP 模式中'));
  });

  it('ends a session', async () => {
    await manager.createSession('user1', '/test', sendMock);
    await manager.endSession('user1', sendMock);
    expect(manager.hasActiveSession('user1')).toBe(false);
    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('已退出 ACP 模式'));
  });

  it('times out inactive sessions', async () => {
    await manager.createSession('user1', '/test', sendMock);
    expect(manager.hasActiveSession('user1')).toBe(true);

    vi.advanceTimersByTime(6000);
    await manager.checkTimeouts(async (_userId, msg) => {
      await sendMock(msg);
    });
    expect(manager.hasActiveSession('user1')).toBe(false);
    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('已退出 ACP 模式'));
  });

  it('resets timeout on activity', async () => {
    await manager.createSession('user1', '/test', sendMock);
    vi.advanceTimersByTime(4000);
    manager.updateActivity('user1');
    vi.advanceTimersByTime(4000);
    await manager.checkTimeouts();
    expect(manager.hasActiveSession('user1')).toBe(true);
  });

  it('send message resets timeout', async () => {
    await manager.createSession('user1', '/test', sendMock);
    vi.advanceTimersByTime(4000);
    await manager.sendMessage('user1', 'hello', sendMock);
    vi.advanceTimersByTime(4000);
    await manager.checkTimeouts();
    expect(manager.hasActiveSession('user1')).toBe(true);
  });

  it('returns correct cwd', async () => {
    await manager.createSession('user1', '/my/path', sendMock);
    expect(manager.getSessionCwd('user1')).toBe('/my/path');
  });

  it('reports active count', async () => {
    expect(manager.getActiveCount()).toBe(0);
    await manager.createSession('u1', '/tmp', sendMock);
    await manager.createSession('u2', '/tmp', sendMock);
    expect(manager.getActiveCount()).toBe(2);
  });

  it('endSession for non-existent session warns', async () => {
    await manager.endSession('nobody', sendMock);
    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('不在 ACP 模式中'));
  });

  it('server-side activity resets timeout (long-running tasks)', async () => {
    await manager.createSession('user1', '/test', sendMock);
    // Simulate ACP server sending data after 3 seconds (timeout is 5s)
    vi.advanceTimersByTime(3000);
    // Simulate long-running task: server sends data every 2 seconds
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(2000);
      _lastMockClient._triggerServerUpdate({
        sessionUpdate: 'agent_message_chunk',
        content: [{ text: `chunk ${i}` }],
      });
    }
    // Total elapsed: 3000 + 2000*3 = 9000ms, well past the 5000ms timeout
    // But server kept resetting activity, so session should still be alive
    await manager.checkTimeouts();
    expect(manager.hasActiveSession('user1')).toBe(true);
  });

  it('cancelTask sends cancel to client when no active message', async () => {
    await manager.createSession('user1', '/test', sendMock);
    // 当没有正在进行的发送任务时，cancelTask 应该直接调用 client.cancel
    await manager.cancelTask('user1', sendMock);
    expect(_lastMockClient._cancelCalled).toBe(true);
  });

  it('cancelTask for non-existent session warns', async () => {
    await manager.cancelTask('nobody', sendMock);
    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('不在 ACP 模式中'));
  });

  it('sendMessage starts and stops heartbeat on success', async () => {
    await manager.createSession('user1', '/test', sendMock);
    await manager.sendMessage('user1', 'hello', sendMock);

    // sendMessage 完成后心跳应该被停止
    const session = (manager as any).sessions.get('user1');
    const heartbeat = session.output['heartbeats'].get('user1');
    expect(heartbeat).toBeUndefined();
  });

  it('sendMessage stops heartbeat on cancel', async () => {
    await manager.createSession('user1', '/test', sendMock);

    // 模拟被取消的响应
    const mockClient = _lastMockClient;
    mockClient.sendMessage = vi.fn().mockResolvedValue({
      usage: {},
      stopReason: 'cancelled',
    });

    await manager.sendMessage('user1', 'hello', sendMock);

    // 取消后心跳应该被停止
    const session = (manager as any).sessions.get('user1');
    const heartbeat = session.output['heartbeats'].get('user1');
    expect(heartbeat).toBeUndefined();
  });
});
