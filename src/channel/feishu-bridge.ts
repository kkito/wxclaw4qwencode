import { Client, WSClient, EventDispatcher } from '@larksuiteoapi/node-sdk';
import { Agent } from '@agentscope-ai/agentscope/agent';
import { createMsg, Msg, TextBlock } from '@agentscope-ai/agentscope/message';
import { getGlobalLogger, Logger } from '../logger.js';
import { SlashCommandRegistry } from '../slash-command/index.js';
import type { SlashCommandContext } from '../slash-command/types.js';
import type { AcpSessionManager } from '../acp-session/manager.js';
import { ChannelBridge } from '../channel/channel-bridge.js';
import { ChannelMessage } from '../channel/types.js';

export interface FeishuBridgeOptions {
  appId: string;
  appSecret: string;
  agent: Agent;
  logger?: Logger;
  slashRegistry?: SlashCommandRegistry;
  acpManager?: AcpSessionManager;
}

export class FeishuBridge implements ChannelBridge {
  private wsClient: WSClient | null = null;
  private client: Client | null = null;
  private agent: Agent;
  private logger: Logger;
  private slashRegistry: SlashCommandRegistry;
  private acpManager: AcpSessionManager | null;
  private messageCallback: ((msg: ChannelMessage) => Promise<void>) | null = null;
  private appId: string;
  private appSecret: string;

  constructor(options: FeishuBridgeOptions) {
    this.appId = options.appId;
    this.appSecret = options.appSecret;
    this.agent = options.agent;
    this.logger = options.logger || getGlobalLogger();
    this.slashRegistry = options.slashRegistry || new SlashCommandRegistry();
    this.acpManager = options.acpManager || null;
  }

  /**
   * 启动飞书通道
   * 创建 WSClient + EventDispatcher 并建立 WebSocket 连接
   */
  async start(): Promise<void> {
    if (!this.appId || !this.appSecret) {
      throw new Error('飞书 App ID 和 App Secret 未配置');
    }

    // 创建用于发送消息的 HTTP Client
    this.client = new Client({
      appId: this.appId,
      appSecret: this.appSecret,
    });

    // 创建事件分发器，注册消息事件处理器
    const eventDispatcher = new EventDispatcher({});

    eventDispatcher.register({
      'im.message.receive_v1': async (data: any) => {
        this.handleFeishuMessage(data).catch((error) => {
          this.logger.error('[Feishu] 处理消息失败:', error);
        });
        return {};
      },
    });

    // 创建并启动 WebSocket 客户端
    this.wsClient = new WSClient({
      appId: this.appId,
      appSecret: this.appSecret,
      onReady: () => {
        this.logger.info('[Feishu] WebSocket 已连接');
      },
      onError: (err: Error) => {
        this.logger.error('[Feishu] 连接错误:', err);
      },
    });

    this.logger.info('[Feishu] 正在连接...');

    await this.wsClient.start({ eventDispatcher });
  }

  /**
   * 停止飞书通道
   */
  async stop(): Promise<void> {
    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = null;
      this.client = null;
      this.logger.info('[Feishu] 通道已停止');
    }
  }

  /**
   * 发送文本回复
   */
  async sendReply(params: { to: string; text: string }): Promise<void> {
    if (!this.client) {
      throw new Error('Lark Client 未连接');
    }

    try {
      await this.client.im.message.create({
        data: {
          receive_id: params.to,
          content: JSON.stringify({ text: params.text }),
          msg_type: 'text',
        },
        params: {
          receive_id_type: 'open_id',
        },
      });
    } catch (error) {
      this.logger.error('[Feishu] 发送消息失败:', error);
      throw error;
    }
  }

  /**
   * 流式发送文本回复
   */
  async sendReplyStreaming(params: {
    to: string;
    text: string;
    finish: boolean;
  }): Promise<void> {
    // 飞书暂不支持流式卡片更新，使用普通文本发送
    await this.sendReply({ to: params.to, text: params.text });
  }

  /**
   * 注册消息到达回调
   */
  onMessage(callback: (msg: ChannelMessage) => Promise<void>): void {
    this.messageCallback = callback;
  }

  getSlashRegistry(): SlashCommandRegistry {
    return this.slashRegistry;
  }

  /**
   * 处理飞书消息
   */
  private async handleFeishuMessage(event: any): Promise<void> {
    const msg = event.message;
    if (!msg) {
      this.logger.warn('[Feishu] 消息 message 字段为空');
      return;
    }

    const openId = event.sender?.sender_id?.open_id;
    if (!openId) {
      this.logger.warn('[Feishu] 消息缺少 sender.sender_id.open_id');
      return;
    }

    const text = this.extractText(event);

    // 日志打印用户发送的内容
    this.logger.info(`[Feishu][用户消息] from ${openId}: ${text}`);

    // === ACP 模式消息路由 ===
    if (this.acpManager?.hasActiveSession(openId)) {
      if (text.toLowerCase() === 'exit') {
        await this.acpManager.endSession(openId, async (replyText) => {
          await this.sendReply({ to: openId, text: replyText });
        });
        return;
      }

      await this.acpManager.sendMessage(openId, text, async (replyText) => {
        await this.sendReply({ to: openId, text: replyText });
      });
      return;
    }

    // === 斜杠命令 ===
    if (text.startsWith('/')) {
      const handled = await this.handleSlashCommand(openId, text);
      if (handled) return;
    }

    // 先发送"已收到开始处理"提示
    await this.sendReply({ to: openId, text: '已收到，开始处理...' });

    // 转换为 AgentScope 消息
    const agentMsg = this.convertToAgentScopeMsg(openId, text);

    // 调用 Agent 处理
    const reply = await this.agent.reply({ msgs: [agentMsg] });

    if (!reply) {
      this.logger.warn('[Feishu] Agent 返回为空');
      return;
    }

    const replyText = (reply.content ?? [])
      .filter((c): c is TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('');

    this.logger.info(`[Feishu][Agent回复] to ${openId}: ${replyText}`);

    await this.sendReply({ to: openId, text: replyText });

    // 构造 ChannelMessage 并通知回调
    const channelMsg: ChannelMessage = {
      from: openId,
      to: this.appId,
      text,
      raw: event,
      channelType: 'feishu',
    };

    if (this.messageCallback) {
      await this.messageCallback(channelMsg);
    }
  }

  /**
   * 处理斜杠命令
   */
  private async handleSlashCommand(
    userId: string,
    text: string,
  ): Promise<boolean> {
    const commandName = text.slice(1).split(/\s/)[0];
    const command = this.slashRegistry.get(commandName);
    if (!command) return false;

    const args = text.slice(1 + commandName.length).trim();
    const sendMessage = async (reply: string) => {
      await this.sendReply({ to: userId, text: reply });
    };
    const sendMessageWithOptions = async (
      reply: string,
      _opts: import('../slash-command/types.js').SendMessageOptions,
    ) => {
      await this.sendReply({ to: userId, text: reply });
    };

    const ctx: SlashCommandContext = {
      userId,
      text,
      sendMessage,
      sendMessageWithOptions,
    };

    try {
      const result = await command.handler(args, ctx);
      return result.handled;
    } catch (error) {
      this.logger.error('[Feishu] 斜杠命令执行失败:', error);
      await this.sendReply({
        to: userId,
        text: `命令执行失败: ${error instanceof Error ? error.message : String(error)}`,
      });
      return true;
    }
  }

  /**
   * 从飞书消息格式提取文本
   */
  private extractText(event: any): string {
    const msg = event.message;
    if (msg.message_type !== 'text') {
      return '暂不支持此消息类型，请发送文本。';
    }
    try {
      const content = JSON.parse(msg.content);
      return content.text || '';
    } catch {
      this.logger.warn('[Feishu] 消息 content 解析失败');
      return '';
    }
  }

  /**
   * 转换为 AgentScope Msg 格式
   */
  private convertToAgentScopeMsg(userId: string, text: string): Msg {
    return createMsg({
      name: userId,
      role: 'user',
      content: [
        {
          type: 'text' as const,
          text: text || '（空消息）',
          id: crypto.randomUUID(),
        },
      ],
    });
  }
}
