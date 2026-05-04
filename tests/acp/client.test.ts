import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcpClient } from '../../src/acp/client.js';

// Mock the AcpConnection
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
