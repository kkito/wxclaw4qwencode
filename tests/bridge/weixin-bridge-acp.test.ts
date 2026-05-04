import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WeixinBridge } from '../../src/bridge/weixin-bridge.js';

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
