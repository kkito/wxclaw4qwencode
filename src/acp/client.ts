/**
 * AcpClient - ACP 客户端主类
 * 高层封装，组合连接、处理器和输出格式化
 */

import type { ClientSideConnection, PromptResponse, NewSessionResponse, SessionUpdate } from '@agentclientprotocol/sdk';
import { AcpConnection } from './connection.js';
import { createClientHandler } from './handlers.js';
import { formatPromptResult, resetOutputState } from './output.js';
import type { AcpClientOptions, AcpSessionInfo } from './types.js';

export class AcpClient {
  private connection: AcpConnection;
  private acpConnection: ClientSideConnection | null = null;
  private sessionInfo: AcpSessionInfo | null = null;
  private options: AcpClientOptions;
  private sessionUpdateRef: { cb: ((update: SessionUpdate) => void) | null };

  constructor(options: AcpClientOptions) {
    this.options = options;
    this.connection = new AcpConnection();
    this.sessionUpdateRef = { cb: null };
  }

  /**
   * 启动 ACP 连接并创建会话
   */
  async start(): Promise<void> {
    // 创建 Client 处理器，使用引用以便动态更新回调
    const clientFactory = createClientHandler({
      autoApprove: this.options.autoApprove ?? true,
      onSessionUpdate: (update) => {
        if (this.sessionUpdateRef.cb) {
          this.sessionUpdateRef.cb(update);
        }
      },
    });

    // 启动连接
    this.acpConnection = await this.connection.start(this.options, clientFactory);

    // 创建新会话
    await this.createSession(this.options.cwd);
  }

  /**
   * 创建新的 ACP 会话
   */
  private async createSession(cwd: string): Promise<void> {
    if (!this.acpConnection) {
      throw new Error('ACP 连接未初始化');
    }

    console.error(`\n[会话] 正在创建新会话 (cwd: ${cwd})...`);

    const response: NewSessionResponse = await this.acpConnection.newSession({
      cwd,
      mcpServers: [],
    });

    this.sessionInfo = {
      sessionId: response.sessionId,
      cwd,
    };

    console.error(`[会话] 会话创建成功 (ID: ${response.sessionId})`);
    if (response.configOptions) {
      console.error(`[会话] 配置选项: ${response.configOptions.length} 个`);
    }
    console.error('');
  }

  /**
   * 发送消息并等待响应
   * 响应通过 sessionUpdate 流式输出，该方法返回最终结果
   */
  async sendMessage(message: string): Promise<PromptResponse> {
    if (!this.acpConnection || !this.sessionInfo) {
      throw new Error('未连接或未创建会话');
    }

    resetOutputState();

    console.error(`\n[消息] 发送消息: "${message.slice(0, 50)}${message.length > 50 ? '...' : ''}"`);

    const result: PromptResponse = await this.acpConnection.prompt({
      sessionId: this.sessionInfo.sessionId,
      prompt: [
        {
          type: 'text',
          text: message,
        },
      ],
    });

    // 打印最终结果
    formatPromptResult(result);
    
    return result;
  }

  /**
   * 获取当前会话信息
   */
  getSessionInfo(): AcpSessionInfo | null {
    return this.sessionInfo;
  }

  /**
   * 获取底层 ACP 连接实例
   */
  getConnection(): ClientSideConnection | null {
    return this.acpConnection;
  }

  /**
   * 设置会话更新回调
   * 用于接收流式输出事件（文本、思考、工具调用等）
   * 可以在 start() 之后调用，回调会立即生效
   */
  setSessionUpdateCallback(cb: (update: SessionUpdate) => void): void {
    this.sessionUpdateRef.cb = cb;
  }

  /**
   * 关闭连接和会话
   */
  async close(): Promise<void> {
    await this.connection.close();
    this.acpConnection = null;
    this.sessionInfo = null;
  }
}

/**
 * 创建 AcpClient 实例的便捷函数
 */
export function createAcpClient(options: AcpClientOptions): AcpClient {
  return new AcpClient(options);
}
