import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AcpSessionManager } from '../../src/acp-session/manager.js';

// Mock AcpClient - must be before imports
vi.mock('../../src/acp/client.js', () => ({
  AcpClient: class MockAcpClient {
    private _closed = false;
    async start() {}
    async sendMessage() {}
    async close() {
      this._closed = true;
    }
    getSessionInfo() {
      return { sessionId: 'mock', cwd: '/test' };
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
    manager.checkTimeouts();
    expect(manager.hasActiveSession('user1')).toBe(false);
    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('已退出 ACP 模式'));
  });

  it('resets timeout on activity', async () => {
    await manager.createSession('user1', '/test', sendMock);
    vi.advanceTimersByTime(4000);
    manager.updateActivity('user1');
    vi.advanceTimersByTime(4000);
    manager.checkTimeouts();
    expect(manager.hasActiveSession('user1')).toBe(true);
  });

  it('send message resets timeout', async () => {
    await manager.createSession('user1', '/test', sendMock);
    vi.advanceTimersByTime(4000);
    await manager.sendMessage('user1', 'hello', sendMock);
    vi.advanceTimersByTime(4000);
    manager.checkTimeouts();
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
});
