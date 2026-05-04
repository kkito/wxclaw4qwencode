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

interface HeartbeatState {
  lastSentTime: Date;
  timer: ReturnType<typeof setInterval> | null;
  hasNotified: boolean;
  sendMessage: (msg: string) => Promise<void>;
}

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟
const HEARTBEAT_CHECK_MS = 60 * 1000; // 60 秒
const HEARTBEAT_MSG = '⏳ 仍在工作中...';

export class AcpWeixinOutput {
  private buffers: Map<string, UserBuffer> = new Map();
  private heartbeats: Map<string, HeartbeatState> = new Map();
  private options: AcpWeixinOutputOptions;

  constructor(options: AcpWeixinOutputOptions) {
    this.options = options;
  }

  onAgentMessageChunk(text: string, userId: string, sendMessage: (msg: string) => Promise<void>): void {
    if (!text) return;
    const buf = this.getOrCreateBuffer(userId, sendMessage);
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

    // 工具调用也算用户感知到的活动，重置心跳计时
    this.recordSent(userId);

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
    this.stopHeartbeat(userId);
  }

  flush(userId: string, sendMessage: (msg: string) => Promise<void>): Promise<void> {
    const buf = this.buffers.get(userId);
    if (buf && buf.text.length > 0) {
      return this.flushBuffer(buf, userId, sendMessage);
    }
    return Promise.resolve();
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
    this.stopHeartbeat(userId);
  }

  private getOrCreateBuffer(userId: string, sendMessage?: (msg: string) => Promise<void>): UserBuffer {
    if (!this.buffers.has(userId)) {
      this.buffers.set(userId, { text: '', timer: null });
      if (sendMessage) {
        this.startHeartbeat(userId, sendMessage);
      }
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

  private flushBuffer(buf: UserBuffer, userId: string, sendMessage: (msg: string) => Promise<void>): Promise<void> {
    if (buf.timer) {
      clearTimeout(buf.timer);
      buf.timer = null;
    }
    if (buf.text.length === 0) return Promise.resolve();
    // 统一出口过滤：完整文本中包含"正在调用"则丢弃，不发到微信
    if (buf.text.includes('正在调用')) {
      buf.text = '';
      return Promise.resolve();
    }
    const msg = this.options.prefix + buf.text;
    buf.text = '';
    return sendMessage(msg).then(() => {
      this.recordSent(userId);
    }).catch(() => {});
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

  // --- Heartbeat ---

  startHeartbeat(userId: string, sendMessage: (msg: string) => Promise<void>): void {
    if (this.heartbeats.has(userId)) return;
    this.heartbeats.set(userId, {
      lastSentTime: new Date(),
      timer: null,
      hasNotified: false,
      sendMessage,
    });
    const state = this.heartbeats.get(userId)!;
    state.timer = setInterval(() => {
      this.checkHeartbeat(userId);
    }, HEARTBEAT_CHECK_MS);
  }

  private checkHeartbeat(userId: string): void {
    const state = this.heartbeats.get(userId);
    if (!state || state.hasNotified) return;
    const elapsed = Date.now() - state.lastSentTime.getTime();
    if (elapsed >= HEARTBEAT_INTERVAL_MS) {
      state.hasNotified = true;
      state.lastSentTime = new Date();
      try {
        state.sendMessage(HEARTBEAT_MSG).catch(() => {});
      } catch {
        // Silently ignore heartbeat send failures
      }
    }
  }

  recordSent(userId: string): void {
    const state = this.heartbeats.get(userId);
    if (!state) return;
    state.lastSentTime = new Date();
    state.hasNotified = false;
  }

  stopHeartbeat(userId: string): void {
    const state = this.heartbeats.get(userId);
    if (state?.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    this.heartbeats.delete(userId);
  }
}
