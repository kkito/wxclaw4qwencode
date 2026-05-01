# 发送消息限流设计

## 问题

频繁发送消息时，微信 API 会丢弃部分消息。需要对全局发送做限流。

## 方案

使用**合并窗口**策略：5000ms（默认）内所有待发送文本用 `\n` 拼接，窗口到期后一次性发出。

## 核心模块

### `src/utils/send-throttle.ts`

```typescript
export class SendThrottle {
  private buffer = '';
  private timer: NodeJS.Timeout | null = null;
  private intervalMs: number;

  constructor(intervalMs: number = 5000) {
    this.intervalMs = intervalMs;
  }

  // 更新限流间隔（Web 页面保存后调用）
  setInterval(ms: number): void

  // 入队文本并重置定时器
  enqueue(text: string): Promise<void>

  // 立即发送当前 buffer（可选，用于优雅退出）
  flush(): Promise<void>
}

export function createSendThrottle(intervalMs?: number): SendThrottle
```

**行为**：
- `enqueue("A")` → buffer = "A"，启动定时器
- 窗口期内 `enqueue("B")` → buffer = "A\nB"，定时器重置
- 定时器到期 → 发送 "A\nB" → buffer 清空

## 配置存储

`~/.ownclaw/config.json`：
```json
{
  "sendThrottleIntervalMs": 5000
}
```

### `src/config-store.ts`

- `loadSendThrottleInterval(): Promise<number>` — 读取配置，不存在则返回 5000
- `saveSendThrottleInterval(ms: number): Promise<void>` — 写入配置

## 接入点

### `start.ts`

```typescript
import { createSendThrottle } from './utils/send-throttle.js';
import { loadSendThrottleInterval } from './config-store.js';

const interval = await loadSendThrottleInterval();
const throttle = createSendThrottle(interval);

// 替换原来的 sendMessage
runner = await createAgentRunner({
  weixin: {
    sendMessage: async (to: string, text: string) => {
      await throttle.enqueue(text);
    },
  },
  ...
});
```

### ACP 模式

`src/acp-session/manager.ts` 中的 `sendToWeixin` 回调同样替换为 `throttle.enqueue`。

## Web 设置页面

`/settings` 路由，Hono SSR 渲染：
- 输入框：限流间隔（毫秒），回显当前值
- 保存按钮：POST 写入 `~/.ownclaw/config.json`，更新节流器间隔

## 错误处理

- `config.json` 不存在或解析失败：使用默认 5000ms
- 底层 `sendMessage` 抛异常：限流器不吞异常，直接透传
