import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WeixinBridge } from '../../src/bridge/weixin-bridge.js';
import { SlashCommandRegistry } from '../../src/slash-command/registry.js';
import type { SlashCommandHandler, RegisteredCommand } from '../../src/slash-command/types.js';

describe('WeixinBridge slash command routing', () => {
  let sendMock: ReturnType<typeof vi.fn>;
  let registry: SlashCommandRegistry;
  let bridge: WeixinBridge;

  beforeEach(() => {
    sendMock = vi.fn().mockResolvedValue(undefined);
    registry = new SlashCommandRegistry();
  });

  it('slash command is handled by registry', async () => {
    const handler: SlashCommandHandler = vi.fn().mockResolvedValue({ handled: true });
    registry.register('test', {
      name: 'test',
      description: 'Test',
      handler,
      dirPath: '/tmp/test',
    } as RegisteredCommand);

    bridge = new WeixinBridge({
      agent: { reply: vi.fn().mockResolvedValue(null) } as any,
      sendMessage: sendMock,
      slashRegistry: registry,
    });

    await bridge.handleMessage({
      from_user_id: 'user1',
      item_list: [{ type: 1, text_item: { text: '/test arg1' } }],
    } as any);

    expect(handler).toHaveBeenCalledWith('arg1', {
      userId: 'user1',
      text: '/test arg1',
      sendMessage: expect.any(Function),
      sendMessageWithOptions: expect.any(Function),
    });
  });

  it('unregistered slash command falls through to AI flow', async () => {
    const agentReply = { content: [{ type: 'text', text: 'AI response' }] };
    const agent = { reply: vi.fn().mockResolvedValue(agentReply) } as any;
    bridge = new WeixinBridge({
      agent,
      sendMessage: sendMock,
      slashRegistry: registry,
    });

    await bridge.handleMessage({
      from_user_id: 'user1',
      item_list: [{ type: 1, text_item: { text: '/unknown' } }],
    } as any);

    expect(sendMock).toHaveBeenCalledWith('user1', '已收到，开始处理...');
    expect(agent.reply).toHaveBeenCalled();
  });

  it('non-slash command goes to AI flow', async () => {
    const agentReply = { content: [{ type: 'text', text: 'Hello' }] };
    const agent = { reply: vi.fn().mockResolvedValue(agentReply) } as any;
    bridge = new WeixinBridge({
      agent,
      sendMessage: sendMock,
      slashRegistry: registry,
    });

    await bridge.handleMessage({
      from_user_id: 'user1',
      item_list: [{ type: 1, text_item: { text: '你好' } }],
    } as any);

    expect(sendMock).toHaveBeenCalledWith('user1', '已收到，开始处理...');
    expect(agent.reply).toHaveBeenCalled();
  });

  it('slash command handler error is caught and reported', async () => {
    const handler: SlashCommandHandler = vi.fn().mockRejectedValue(new Error('handler error'));
    registry.register('fail', {
      name: 'fail',
      description: 'Fail',
      handler,
      dirPath: '/tmp/fail',
    } as RegisteredCommand);

    bridge = new WeixinBridge({
      agent: { reply: vi.fn().mockResolvedValue(null) } as any,
      sendMessage: sendMock,
      slashRegistry: registry,
    });

    await bridge.handleMessage({
      from_user_id: 'user1',
      item_list: [{ type: 1, text_item: { text: '/fail' } }],
    } as any);

    expect(sendMock).toHaveBeenCalledWith('user1', expect.stringContaining('命令执行失败'));
  });
});
