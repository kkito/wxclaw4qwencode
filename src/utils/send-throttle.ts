interface PendingSend {
  buffer: string;
  timer: NodeJS.Timeout | null;
  sent: boolean; // 是否已发送过首次消息
}

export class SendThrottle {
  private pending: Map<string, PendingSend>;
  private intervalMs: number;
  private sendFn: (to: string, text: string) => Promise<void>;

  constructor(
    sendFn: (to: string, text: string) => Promise<void>,
    intervalMs = 2000,
  ) {
    this.sendFn = sendFn;
    this.intervalMs = intervalMs;
    this.pending = new Map();
  }

  setInterval(ms: number): void {
    this.intervalMs = ms;
  }

  async enqueue(to: string, text: string): Promise<void> {
    if (!text) {
      return;
    }

    let ps = this.pending.get(to);
    if (!ps) {
      ps = { buffer: '', timer: null, sent: false };
      this.pending.set(to, ps);
    }

    if (!ps.sent) {
      // 首次：立即发送
      ps.sent = true;
      await this.sendFn(to, text);
      return;
    }

    // 后续追加：合并到 buffer，重置定时器
    ps.buffer = ps.buffer ? `${ps.buffer}\n${text}` : text;

    if (ps.timer) {
      clearTimeout(ps.timer);
    }

    ps.timer = setTimeout(async () => {
      await this.flushOne(to);
    }, this.intervalMs);
  }

  async flush(): Promise<void> {
    const targets = Array.from(this.pending.keys());
    for (const to of targets) {
      await this.flushOne(to);
    }
  }

  private async flushOne(to: string): Promise<void> {
    const ps = this.pending.get(to);
    if (!ps) {
      return;
    }

    if (ps.timer) {
      clearTimeout(ps.timer);
    }

    if (ps.buffer) {
      await this.sendFn(to, ps.buffer);
    }

    this.pending.delete(to);
  }
}

export function createSendThrottle(
  sendFn: (to: string, text: string) => Promise<void>,
  intervalMs?: number,
): SendThrottle {
  return new SendThrottle(sendFn, intervalMs);
}
