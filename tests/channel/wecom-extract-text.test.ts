import { describe, it, expect } from 'vitest';
import type { TextMessage, VoiceMessage, ImageMessage, FileMessage, VideoMessage, MixedMessage, BaseMessage } from '@wecom/aibot-node-sdk';

/**
 * Tests for WecomBridge.extractText() method.
 * Since extractText is private, we test it through a minimal reproduction.
 */

function extractText(msg: BaseMessage): string {
  const msgtype = msg.msgtype;

  switch (msgtype) {
    case 'text': {
      const textMsg = msg as TextMessage;
      return textMsg.text?.content || '';
    }
    case 'image':
      return '（收到图片消息，暂不支持）';
    case 'voice': {
      const voiceMsg = msg as VoiceMessage;
      return voiceMsg.voice?.content || '（收到语音消息，暂不支持）';
    }
    case 'file':
      return '（收到文件消息，暂不支持）';
    case 'video':
      return '（收到视频消息，暂不支持）';
    case 'mixed': {
      const mixedMsg = msg as MixedMessage;
      const texts: string[] = [];
      if (mixedMsg.mixed?.msg_item) {
        for (const item of mixedMsg.mixed.msg_item) {
          if (item.msgtype === 'text' && item.text?.content) {
            texts.push(item.text.content);
          } else if (item.msgtype === 'image') {
            texts.push('（图片）');
          }
        }
      }
      return texts.join('') || '（收到图文消息）';
    }
    default:
      return '';
  }
}

describe('WecomBridge.extractText', () => {
  it('should extract text from text message', () => {
    const msg: BaseMessage = {
      msgid: 'msg-1',
      aibotid: 'bot-1',
      chattype: 'single',
      from: { userid: 'user-1' },
      msgtype: 'text',
      text: { content: 'Hello World' },
    } as TextMessage;

    expect(extractText(msg)).toBe('Hello World');
  });

  it('should return empty string for empty text content', () => {
    const msg: BaseMessage = {
      msgid: 'msg-1',
      aibotid: 'bot-1',
      chattype: 'single',
      from: { userid: 'user-1' },
      msgtype: 'text',
      text: { content: '' },
    } as TextMessage;

    expect(extractText(msg)).toBe('');
  });

  it('should return placeholder for image message', () => {
    const msg: BaseMessage = {
      msgid: 'msg-1',
      aibotid: 'bot-1',
      chattype: 'single',
      from: { userid: 'user-1' },
      msgtype: 'image',
      image: { url: 'https://example.com/img.png' },
    } as ImageMessage;

    expect(extractText(msg)).toBe('（收到图片消息，暂不支持）');
  });

  it('should extract voice content if available', () => {
    const msg: BaseMessage = {
      msgid: 'msg-1',
      aibotid: 'bot-1',
      chattype: 'single',
      from: { userid: 'user-1' },
      msgtype: 'voice',
      voice: { content: '语音转文本内容' },
    } as VoiceMessage;

    expect(extractText(msg)).toBe('语音转文本内容');
  });

  it('should return placeholder for voice message without content', () => {
    const msg: BaseMessage = {
      msgid: 'msg-1',
      aibotid: 'bot-1',
      chattype: 'single',
      from: { userid: 'user-1' },
      msgtype: 'voice',
      voice: {},
    } as VoiceMessage;

    expect(extractText(msg)).toBe('（收到语音消息，暂不支持）');
  });

  it('should return placeholder for file message', () => {
    const msg: BaseMessage = {
      msgid: 'msg-1',
      aibotid: 'bot-1',
      chattype: 'single',
      from: { userid: 'user-1' },
      msgtype: 'file',
      file: { url: 'https://example.com/file.pdf' },
    } as FileMessage;

    expect(extractText(msg)).toBe('（收到文件消息，暂不支持）');
  });

  it('should return placeholder for video message', () => {
    const msg: BaseMessage = {
      msgid: 'msg-1',
      aibotid: 'bot-1',
      chattype: 'single',
      from: { userid: 'user-1' },
      msgtype: 'video',
      video: { url: 'https://example.com/video.mp4' },
    } as VideoMessage;

    expect(extractText(msg)).toBe('（收到视频消息，暂不支持）');
  });

  it('should extract text from mixed message with text items', () => {
    const msg: BaseMessage = {
      msgid: 'msg-1',
      aibotid: 'bot-1',
      chattype: 'single',
      from: { userid: 'user-1' },
      msgtype: 'mixed',
      mixed: {
        msg_item: [
          { msgtype: 'text', text: { content: 'Hello' } },
          { msgtype: 'image', image: { url: 'https://example.com/img.png' } },
          { msgtype: 'text', text: { content: ' World' } },
        ],
      },
    } as MixedMessage;

    expect(extractText(msg)).toBe('Hello（图片） World');
  });

  it('should return placeholder for mixed message with no text', () => {
    const msg: BaseMessage = {
      msgid: 'msg-1',
      aibotid: 'bot-1',
      chattype: 'single',
      from: { userid: 'user-1' },
      msgtype: 'mixed',
      mixed: {
        msg_item: [
          { msgtype: 'image', image: { url: 'https://example.com/img.png' } },
        ],
      },
    } as MixedMessage;

    // Mixed with only images returns concatenated image placeholders
    expect(extractText(msg)).toBe('（图片）');
  });

  it('should return empty string for unknown message type', () => {
    const msg: BaseMessage = {
      msgid: 'msg-1',
      aibotid: 'bot-1',
      chattype: 'single',
      from: { userid: 'user-1' },
      msgtype: 'unknown_type',
    };

    expect(extractText(msg)).toBe('');
  });
});
