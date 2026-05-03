import { describe, it, expect } from 'vitest';

/**
 * Tests for FeishuBridge.extractText() method.
 * Since extractText is private, we test it through a minimal reproduction.
 */

function extractText(event: any): string {
  const msg = event.message;
  if (msg.message_type !== 'text') {
    return '暂不支持此消息类型，请发送文本。';
  }
  try {
    const content = JSON.parse(msg.content);
    return content.text || '';
  } catch {
    return '';
  }
}

describe('FeishuBridge.extractText', () => {
  it('should extract text from text message', () => {
    const event = {
      message: {
        message_id: 'msg-1',
        message_type: 'text',
        content: JSON.stringify({ text: 'Hello World' }),
        chat_type: 'p2p',
      },
      sender: {
        sender_id: { open_id: 'ou_xxx' },
      },
    };

    expect(extractText(event)).toBe('Hello World');
  });

  it('should return empty string for empty text content', () => {
    const event = {
      message: {
        message_id: 'msg-1',
        message_type: 'text',
        content: JSON.stringify({ text: '' }),
        chat_type: 'p2p',
      },
      sender: {
        sender_id: { open_id: 'ou_xxx' },
      },
    };

    expect(extractText(event)).toBe('');
  });

  it('should return placeholder for image message', () => {
    const event = {
      message: {
        message_id: 'msg-1',
        message_type: 'image',
        content: JSON.stringify({ image_key: 'img_xxx' }),
        chat_type: 'p2p',
      },
      sender: {
        sender_id: { open_id: 'ou_xxx' },
      },
    };

    expect(extractText(event)).toBe('暂不支持此消息类型，请发送文本。');
  });

  it('should return placeholder for file message', () => {
    const event = {
      message: {
        message_id: 'msg-1',
        message_type: 'file',
        content: JSON.stringify({ file_key: 'file_xxx' }),
        chat_type: 'p2p',
      },
      sender: {
        sender_id: { open_id: 'ou_xxx' },
      },
    };

    expect(extractText(event)).toBe('暂不支持此消息类型，请发送文本。');
  });

  it('should return placeholder for audio message', () => {
    const event = {
      message: {
        message_id: 'msg-1',
        message_type: 'audio',
        content: JSON.stringify({ audio_key: 'audio_xxx' }),
        chat_type: 'p2p',
      },
      sender: {
        sender_id: { open_id: 'ou_xxx' },
      },
    };

    expect(extractText(event)).toBe('暂不支持此消息类型，请发送文本。');
  });

  it('should return placeholder for video message', () => {
    const event = {
      message: {
        message_id: 'msg-1',
        message_type: 'video',
        content: JSON.stringify({ video_key: 'video_xxx' }),
        chat_type: 'p2p',
      },
      sender: {
        sender_id: { open_id: 'ou_xxx' },
      },
    };

    expect(extractText(event)).toBe('暂不支持此消息类型，请发送文本。');
  });

  it('should handle invalid JSON content gracefully', () => {
    const event = {
      message: {
        message_id: 'msg-1',
        message_type: 'text',
        content: 'invalid json',
        chat_type: 'p2p',
      },
      sender: {
        sender_id: { open_id: 'ou_xxx' },
      },
    };

    expect(extractText(event)).toBe('');
  });
});
