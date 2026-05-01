import type { SessionUpdate, ToolCall } from '@agentclientprotocol/sdk';

interface AcpWeixinOutputOptions {
  prefix: string;
  flushIntervalMs: number;
  flushThresholdChars: number;
}

interface UserBuffer {
  text: string;
  timer: ReturnType<typeof setTimeout> | null;
}

export class AcpWeixinOutput {
  private buffers: Map<string, UserBuffer> = new Map();
  private options: AcpWeixinOutputOptions;

  constructor(options: AcpWeixinOutputOptions) {
    this.options = options;
  }

  onAgentMessageChunk(text: string, userId: string, sendMessage: (msg: string) => Promise<void>): void {
    if (!text) return;
    // 过滤掉 qwen --acp 自行输出的工具调用提示文本
    if (text.includes('正在调用')) return;
    const buf = this.getOrCreateBuffer(userId);
    buf.text += text;
    this.maybeFlush(buf, userId, sendMessage);
  }

  onAgentThought(text: string, _userId: string, _sendMessage: (msg: string) => Promise<void>): void {
    // Thought content not sent to WeChat users
  }

  onToolCall(toolCall: { name: string }, userId: string, sendMessage: (msg: string) => Promise<void>): void {
    // 工具调用不再发送给微信用户
    // 只在终端日志中记录
    console.error(`\n🔧 [工具调用] ${toolCall.name}`);

    // 清空 buffer，丢弃之前累积的"正在调用"等提示文本
    const buf = this.buffers.get(userId);
    if (buf) {
      if (buf.timer) {
        clearTimeout(buf.timer);
        buf.timer = null;
      }
      buf.text = '';
    }
  }

  onComplete(userId: string, sendMessage: (msg: string) => Promise<void>): void {
    const buf = this.getOrCreateBuffer(userId);
    if (buf.text.length > 0) {
      this.flushBuffer(buf, userId, sendMessage);
    }
  }

  flush(userId: string, sendMessage: (msg: string) => Promise<void>): void {
    const buf = this.buffers.get(userId);
    if (buf && buf.text.length > 0) {
      this.flushBuffer(buf, userId, sendMessage);
    }
  }

  onSessionUpdate(update: SessionUpdate, userId: string, sendMessage: (msg: string) => Promise<void>): void {
    switch (update.sessionUpdate) {
      case 'agent_message_chunk': {
        const text = this.extractText((update as Record<string, unknown>).content);
        this.onAgentMessageChunk(text, userId, sendMessage);
        break;
      }
      case 'agent_thought_chunk': {
        const text = this.extractText((update as Record<string, unknown>).content);
        this.onAgentThought(text, userId, sendMessage);
        break;
      }
      case 'tool_call': {
        const tc = update as ToolCall;
        const name = tc.toolCallId ?? 'unknown';
        this.onToolCall({ name }, userId, sendMessage);
        break;
      }
    }
  }

  cleanup(userId: string): void {
    const buf = this.buffers.get(userId);
    if (buf?.timer) {
      clearTimeout(buf.timer);
    }
    this.buffers.delete(userId);
  }

  private getOrCreateBuffer(userId: string): UserBuffer {
    if (!this.buffers.has(userId)) {
      this.buffers.set(userId, { text: '', timer: null });
    }
    return this.buffers.get(userId)!;
  }

  private maybeFlush(buf: UserBuffer, userId: string, sendMessage: (msg: string) => Promise<void>): void {
    if (buf.text.length >= this.options.flushThresholdChars) {
      this.flushBuffer(buf, userId, sendMessage);
      return;
    }
    if (buf.timer) {
      clearTimeout(buf.timer);
    }
    buf.timer = setTimeout(() => {
      this.flushBuffer(buf, userId, sendMessage);
    }, this.options.flushIntervalMs);
  }

  private flushBuffer(buf: UserBuffer, userId: string, sendMessage: (msg: string) => Promise<void>): void {
    if (buf.timer) {
      clearTimeout(buf.timer);
      buf.timer = null;
    }
    if (buf.text.length === 0) return;
    const msg = this.options.prefix + buf.text;
    sendMessage(msg);
    buf.text = '';
  }

  private extractText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && 'text' in item) {
            return String((item as Record<string, unknown>).text ?? '');
          }
          return '';
        })
        .join('');
    }
    if (content && typeof content === 'object' && 'text' in content) {
      return String((content as Record<string, unknown>).text ?? '');
    }
    return '';
  }
}
