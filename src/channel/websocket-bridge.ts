/**
 * WebSocket Channel
 * 提供基于 WebSocket 的消息通道，与微信/飞书/企微通道并列
 */

import { WebSocketServer, WebSocket as WSWebSocket } from 'ws';
import type { ChannelBridge } from './channel-bridge.js';
import type { ChannelMessage } from './types.js';

export interface WebSocketChannelOptions {
  /** WebSocket 监听端口，默认 8765 */
  port?: number;
  /** WebSocket 监听地址，默认 '0.0.0.0' */
  host?: string;
}

export class WebSocketChannel implements ChannelBridge {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, WSWebSocket>();
  private messageCallback?: (msg: ChannelMessage) => Promise<void>;
  private options: WebSocketChannelOptions;

  constructor(options: WebSocketChannelOptions = {}) {
    this.options = options;
  }

  async start(): Promise<void> {
    const port = this.options.port ?? 8765;
    const host = this.options.host ?? '0.0.0.0';

    this.wss = new WebSocketServer({ port, host });

    this.wss.on('listening', () => {
      console.error(`[WebSocket] 服务器已启动 ws://${host}:${port}`);
    });

    this.wss.on('connection', (ws, req) => {
      // 从 URL path 提取 clientId，如 /ws/user123 → user123
      const path = req.url || '/';
      const clientId = path.split('/').filter(Boolean)[1] || crypto.randomUUID();

      console.error(`[WebSocket] 客户端已连接: ${clientId}`);
      this.clients.set(clientId, ws);

      ws.on('message', async (data) => {
        try {
          const text = data.toString();
          const parsed = JSON.parse(text) as { text?: string; [key: string]: unknown };

          if (!parsed.text) {
            console.error(`[WebSocket] 忽略空文本消息 from ${clientId}`);
            return;
          }

          const msg: ChannelMessage = {
            from: clientId,
            to: 'websocket',
            text: parsed.text,
            raw: parsed,
            channelType: 'websocket' as any, // 扩展 ChannelType
          };

          await this.messageCallback?.(msg);
        } catch (err) {
          console.error(`[WebSocket] 解析消息失败: ${err}`);
        }
      });

      ws.on('close', () => {
        console.error(`[WebSocket] 客户端已断开: ${clientId}`);
        this.clients.delete(clientId);
      });

      ws.on('error', (err) => {
        console.error(`[WebSocket] 连接错误 (${clientId}): ${err.message}`);
      });
    });

    this.wss.on('error', (err) => {
      console.error(`[WebSocket] 服务器错误: ${err.message}`);
    });
  }

  async stop(): Promise<void> {
    if (this.wss) {
      for (const ws of this.clients.values()) {
        ws.close();
      }
      this.clients.clear();

      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });

      this.wss = null;
      console.error('[WebSocket] 服务器已关闭');
    }
  }

  async sendReply(params: { to: string; text: string }): Promise<void> {
    const ws = this.clients.get(params.to);
    if (!ws || ws.readyState !== WSWebSocket.OPEN) {
      console.error(`[WebSocket] 客户端 ${params.to} 未连接，消息已丢弃`);
      return;
    }

    ws.send(JSON.stringify({ text: params.text }));
  }

  onMessage(callback: (msg: ChannelMessage) => Promise<void>): void {
    this.messageCallback = callback;
  }

  /**
   * 获取已连接的客户端数量
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * 向所有已连接客户端广播消息
   */
  broadcast(text: string): void {
    const payload = JSON.stringify({ text });
    for (const [clientId, ws] of this.clients.entries()) {
      if (ws.readyState === WSWebSocket.OPEN) {
        ws.send(payload);
      } else {
        this.clients.delete(clientId);
      }
    }
  }
}
