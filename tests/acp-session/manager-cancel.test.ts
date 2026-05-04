import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AcpSessionManager } from '../../src/acp-session/manager.js';

// Re-use the mock from manager.test.ts
let _lastMockClient: any = null;

vi.mock('../../src/acp/client.js', () => ({
  AcpClient: class MockAcpClient {
    private _closed = false;
    private _sessionUpdateCallback: ((update: any) => void) | null = null;
    constructor() {
      _lastMockClient = this;
      (this as any)._cancelCalled = false;
      (this as any)._cancelCallCount = 0;
    }
    async start() {}
    async sendMessage() {
      return { usage: { input_tokens: 100, output_tokens: 50 }, stopReason: 'end' };
    }
    async cancel() {
      (this as any)._cancelCalled = true;
      (this as any)._cancelCallCount++;
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
    _triggerServerUpdate(update: any) {
      if (this._sessionUpdateCallback) {
        this._sessionUpdateCallback(update);
      }
    }
  },
}));

describe('AcpSessionManager cancel functionality', () => {
  let manager: AcpSessionManager;
  let sendMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    sendMock = vi.fn().mockResolvedValue(undefined);
    manager = new AcpSessionManager({ timeoutMs: 5000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cancelTask with no active task shows info message', async () => {
    await manager.createSession('user1', '/test', sendMock);
    sendMock.mockClear();

    await manager.cancelTask('user1', sendMock);
    expect(sendMock).toHaveBeenCalledWith('ℹ️ 当前没有正在进行的 ACP 任务');
  });

  it('cancelTask for non-existent session warns', async () => {
    await manager.cancelTask('nobody', sendMock);
    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('不在 ACP 模式中'));
  });
});
