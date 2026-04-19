import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WeixinBridge } from '../../src/bridge/weixin-bridge';
import { createMsg } from '@agentscope-ai/agentscope/message';
import { Logger } from '../../src/logger';

describe('WeixinBridge', () => {
  let bridge: WeixinBridge;
  let mockAgent: any;
  let mockSendMessage: ReturnType<typeof vi.fn>;
  let mockLogger: Logger;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    mockSendMessage = vi.fn().mockResolvedValue(undefined);

    mockAgent = {
      reply: vi.fn().mockResolvedValue(
        createMsg({
          name: 'assistant',
          role: 'assistant',
          content: [{ type: 'text' as const, text: 'Reply text', id: '1' }],
        })
      ),
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    bridge = new WeixinBridge({
      agent: mockAgent,
      sendMessage: mockSendMessage,
      logger: mockLogger,
    });
  });

  describe('constructor', () => {
    it('should create bridge with agent and sendMessage function', () => {
      expect(bridge).toBeDefined();
    });
  });

  describe('handleMessage', () => {
    it('should handle text message and send reply', async () => {
      const weixinMsg = {
        from_user_id: 'user123',
        item_list: [
          { type: 1, content: 'Hello' },
        ],
      };

      await bridge.handleMessage(weixinMsg);

      expect(mockAgent.reply).toHaveBeenCalledWith({
        msgs: expect.arrayContaining([
          expect.objectContaining({
            name: 'user123',
            role: 'user',
          }),
        ]),
      });

      expect(mockSendMessage).toHaveBeenCalledWith('user123', 'Reply text');
    });

    it('should warn and return when from_user_id is missing', async () => {
      const weixinMsg = {
        item_list: [
          { type: 1, content: 'Hello' },
        ],
      };

      await bridge.handleMessage(weixinMsg);

      expect(mockLogger.warn).toHaveBeenCalledWith('消息缺少 from_user_id');
      expect(mockAgent.reply).not.toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should handle empty message with default text', async () => {
      const weixinMsg = {
        from_user_id: 'user123',
        item_list: [],
      };

      await bridge.handleMessage(weixinMsg);

      expect(mockAgent.reply).toHaveBeenCalledWith({
        msgs: expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({ text: '（空消息）' }),
            ]),
          }),
        ]),
      });
    });
  });

  describe('message type handling', () => {
    it('should handle IMAGE message', async () => {
      const weixinMsg = {
        from_user_id: 'user123',
        item_list: [
          { type: 2, media_url: 'http://example.com/img.jpg' },
        ],
      };

      await bridge.handleMessage(weixinMsg);

      expect(mockAgent.reply).toHaveBeenCalledWith({
        msgs: expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({ text: '（收到图片消息，暂不支持）' }),
            ]),
          }),
        ]),
      });
    });

    it('should handle VOICE message', async () => {
      const weixinMsg = {
        from_user_id: 'user123',
        item_list: [
          { type: 3, media_url: 'http://example.com/voice.mp3' },
        ],
      };

      await bridge.handleMessage(weixinMsg);

      expect(mockAgent.reply).toHaveBeenCalledWith({
        msgs: expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({ text: '（收到语音消息，暂不支持）' }),
            ]),
          }),
        ]),
      });
    });

    it('should handle FILE message', async () => {
      const weixinMsg = {
        from_user_id: 'user123',
        item_list: [
          { type: 4, media_url: 'http://example.com/file.pdf', file_name: 'file.pdf' },
        ],
      };

      await bridge.handleMessage(weixinMsg);

      expect(mockAgent.reply).toHaveBeenCalledWith({
        msgs: expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({ text: '（收到文件消息，暂不支持）' }),
            ]),
          }),
        ]),
      });
    });

    it('should handle VIDEO message', async () => {
      const weixinMsg = {
        from_user_id: 'user123',
        item_list: [
          { type: 5, media_url: 'http://example.com/video.mp4' },
        ],
      };

      await bridge.handleMessage(weixinMsg);

      expect(mockAgent.reply).toHaveBeenCalledWith({
        msgs: expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({ text: '（收到视频消息，暂不支持）' }),
            ]),
          }),
        ]),
      });
    });
  });

  describe('error handling', () => {
    it('should handle agent reply error gracefully', async () => {
      mockAgent.reply.mockRejectedValue(new Error('Agent error'));

      const weixinMsg = {
        from_user_id: 'user123',
        item_list: [
          { type: 1, content: 'Hello' },
        ],
      };

      await bridge.handleMessage(weixinMsg);

      expect(mockLogger.error).toHaveBeenCalledWith('处理消息失败:', expect.any(Error));
      // Should send error message to user
      expect(mockSendMessage).toHaveBeenCalledWith(
        'user123',
        '抱歉，处理您的消息时出现错误，请稍后重试。'
      );
    });

    it('should handle empty agent response', async () => {
      mockAgent.reply.mockResolvedValue(null);

      const weixinMsg = {
        from_user_id: 'user123',
        item_list: [
          { type: 1, content: 'Hello' },
        ],
      };

      await bridge.handleMessage(weixinMsg);

      expect(mockLogger.warn).toHaveBeenCalledWith('Agent 返回为空');
      // 会发送"已收到，开始处理..."提示，但不会发送空回复
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(mockSendMessage).toHaveBeenCalledWith('user123', '已收到，开始处理...');
    });

    it('should not send message when reply content is empty', async () => {
      mockAgent.reply.mockResolvedValue(
        createMsg({
          name: 'assistant',
          role: 'assistant',
          content: [],
        })
      );

      const weixinMsg = {
        from_user_id: 'user123',
        item_list: [
          { type: 1, content: 'Hello' },
        ],
      };

      await bridge.handleMessage(weixinMsg);

      expect(mockLogger.warn).toHaveBeenCalledWith('Agent 回复为空');
      // 会发送"已收到，开始处理..."提示，但不会发送空回复
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(mockSendMessage).toHaveBeenCalledWith('user123', '已收到，开始处理...');
    });
  });
});