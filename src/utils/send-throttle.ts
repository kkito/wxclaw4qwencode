export class SendThrottle {
  private buffer: string;
  private timer: NodeJS.Timeout | null;
  private intervalMs: number;
  private sendFn: (text: string) => Promise<void>;

  constructor(sendFn: (text: string) => Promise<void>, intervalMs = 5000) {
    this.sendFn = sendFn;
    this.intervalMs = intervalMs;
    this.buffer = '';
    this.timer = null;
  }

  setInterval(ms: number): void {
    this.intervalMs = ms;
  }

  async enqueue(text: string): Promise<void> {
    if (!text) {
      return;
    }

    this.buffer = this.buffer ? `${this.buffer}\n${text}` : text;

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(async () => {
      await this.flush();
    }, this.intervalMs);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.buffer) {
      await this.sendFn(this.buffer);
      this.buffer = '';
    }
  }
}

export function createSendThrottle(
  sendFn: (text: string) => Promise<void>,
  intervalMs?: number,
): SendThrottle {
  return new SendThrottle(sendFn, intervalMs);
}
