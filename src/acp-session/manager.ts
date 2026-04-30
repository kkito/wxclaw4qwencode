/**
 * AcpSessionManager - 管理 per-user ACP 会话，带超时清理
 */

import { AcpClient } from '../acp/client.js';
import { AcpWeixinOutput } from './output.js';
import { AcpSessionConfig, DEFAULT_TIMEOUT_MS } from './types.js';

interface ManagerOptions extends AcpSessionConfig {}

interface ActiveSession {
  client: AcpClient;
  cwd: string;
  lastActivity: Date;
  output: AcpWeixinOutput;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
}

export class AcpSessionManager {
  private sessions: Map<string, ActiveSession> = new Map();
  private options: Required<ManagerOptions>;

  constructor(options: ManagerOptions = {}) {
    this.options = {
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  }

  async createSession(
    userId: string,
    cwd: string,
    sendToWeixin: (msg: string) => Promise<void>,
  ): Promise<void> {
    if (this.sessions.has(userId)) {
      await sendToWeixin('⚠️ 您已经在 ACP 模式中了，请先 exit 退出');
      return;
    }

    const client = new AcpClient({
      cwd,
      autoApprove: true,
    });

    try {
      await client.start();
    } catch (err) {
      await sendToWeixin(`❌ ACP 连接失败: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    const output = new AcpWeixinOutput({
      prefix: `[ACP 模式] 工作目录: ${cwd}\n---\n`,
      flushIntervalMs: 3000,
      flushThresholdChars: 200,
    });

    const session: ActiveSession = {
      client,
      cwd,
      lastActivity: new Date(),
      output,
      timeoutTimer: null,
    };

    this.sessions.set(userId, session);
    await sendToWeixin(`✅ 已进入 ACP 模式\n工作目录: ${cwd}\n发送 exit 退出`);
    this.startTimeoutTimer(userId);
  }

  async endSession(
    userId: string,
    sendToWeixin?: (msg: string) => Promise<void>,
  ): Promise<void> {
    const session = this.sessions.get(userId);
    if (!session) {
      await sendToWeixin?.('⚠️ 当前不在 ACP 模式中');
      return;
    }

    if (session.timeoutTimer) {
      clearTimeout(session.timeoutTimer);
    }

    await session.output.flush(userId, async () => {});
    session.output.cleanup(userId);

    await session.client.close();
    this.sessions.delete(userId);
    await sendToWeixin?.('👋 已退出 ACP 模式');
  }

  async sendMessage(
    userId: string,
    message: string,
    sendToWeixin: (msg: string) => Promise<void>,
  ): Promise<void> {
    const session = this.sessions.get(userId);
    if (!session) {
      await sendToWeixin('⚠️ 当前不在 ACP 模式中，请先发送 /acp /path/to/project 进入');
      return;
    }

    this.updateActivity(userId);
    await session.client.sendMessage(message);
    // Flush any remaining output after prompt completes
    session.output.flush(userId, sendToWeixin);
  }

  updateActivity(userId: string): void {
    const session = this.sessions.get(userId);
    if (!session) return;
    session.lastActivity = new Date();
    this.startTimeoutTimer(userId);
  }

  checkTimeouts(): void {
    const now = Date.now();
    for (const [userId, session] of this.sessions) {
      const elapsed = now - session.lastActivity.getTime();
      if (elapsed > this.options.timeoutMs) {
        this.endSession(userId, async (msg) => {
          console.log(`[ACP] ${userId}: ${msg}`);
        });
      }
    }
  }

  hasActiveSession(userId: string): boolean {
    return this.sessions.has(userId);
  }

  getSessionCwd(userId: string): string | undefined {
    return this.sessions.get(userId)?.cwd;
  }

  getActiveCount(): number {
    return this.sessions.size;
  }

  private startTimeoutTimer(userId: string): void {
    const session = this.sessions.get(userId);
    if (!session) return;

    if (session.timeoutTimer) {
      clearTimeout(session.timeoutTimer);
    }

    session.timeoutTimer = setTimeout(() => {
      this.checkTimeouts();
    }, this.options.timeoutMs);
  }
}
