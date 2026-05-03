import { WSClient } from '@wecom/aibot-node-sdk';
import type {
  WsFrame,
  WsFrameHeaders,
  BaseMessage,
  TextMessage,
  ImageMessage,
  VoiceMessage,
  FileMessage,
  VideoMessage,
  MixedMessage,
} from '@wecom/aibot-node-sdk';
import { Agent } from '@agentscope-ai/agentscope/agent';
import { createMsg, Msg, TextBlock } from '@agentscope-ai/agentscope/message';
import { getGlobalLogger, Logger } from '../logger.js';
import { SlashCommandRegistry } from '../slash-command/index.js';
import type { SlashCommandContext } from '../slash-command/types.js';
import type { AcpSessionManager } from '../acp-session/manager.js';
import { ChannelBridge } from '../channel/channel-bridge.js';
import { ChannelMessage } from '../channel/types.js';

/**
 * 企业微信消息类型别名
 */
type WecomMessage = BaseMessage;

export interface WecomBridgeOptions {
  botId: string;
  secret: string;
  agent: Agent;
  logger?: Logger;
  slashRegistry?: SlashCommandRegistry;
  acpManager?: AcpSessionManager;
}

export class WecomBridge implements ChannelBridge {
  private wsClient: WSClient | null = null;
  private agent: Agent;
  private logger: Logger;
  private slashRegistry: SlashCommandRegistry;
  private acpManager: AcpSessionManager | null;
  private messageCallback: ((msg: ChannelMessage) => Promise<void>) | null = null;
  private botId: string;
  private secret: string;

  constructor(options: WecomBridgeOptions) {
    this.botId = options.botId;
    this.secret = options.secret;
    this.agent = options.agent;
    this.logger = options.logger || getGlobalLogger();
    this.slashRegistry = options.slashRegistry || new SlashCommandRegistry();
    this.acpManager = options.acpManager || null;
  }

  /**
   * 启动企业微信通道
   * 创建 WSClient 并建立 WebSocket 连接
   */
  async start(): Promise<void> {
    if (!this.botId || !this.secret) {
      throw new Error('企业微信 Bot ID 和 Secret 未配置');
    }

    this.wsClient = new WSClient({
      botId: this.botId,
      secret: this.secret,
    });

    // 连接生命周期事件
    this.wsClient.on('connected', () => {
      this.logger.info('[WeCom] WebSocket 已连接');
    });

    this.wsClient.on('authenticated', () => {
      this.logger.info('[WeCom] 认证成功');
    });

    this.wsClient.on('disconnected', (reason: string) => {
      this.logger.warn(`[WeCom] 连接断开: ${reason}`);
    });

    this.wsClient.on('error', (error: Error) => {
      this.logger.error('[WeCom] 发生错误:', error);
    });

    // 监听消息
    this.wsClient.on('message', (frame: WsFrame<WecomMessage>) => {
      this.handleWecomMessage(frame).catch((error) => {
        this.logger.error('[WeCom] 处理消息失败:', error);
      });
    });

    this.logger.info('[WeCom] 正在连接...');
  }

  /**
   * 停止企业微信通道
   */
  async stop(): Promise<void> {
    if (this.wsClient) {
      this.wsClient.removeAllListeners();
      // WSClient 没有公开的 disconnect 方法，依赖自动重连机制
      this.wsClient = null;
      this.logger.info('[WeCom] 通道已停止');
    }
  }

  /**
   * 发送文本回复
   */
  async sendReply(params: { to: string; text: string }): Promise<void> {
    if (!this.wsClient) {
      throw new Error('WSClient 未连接');
    }
    // 企业微信主动推送仅支持 markdown/template_card/media，使用 markdown
    await this.wsClient.sendMessage(params.to, {
      msgtype: 'markdown',
      markdown: { content: params.text },
    });
  }

  /**
   * 流式发送文本回复
   */
  async sendReplyStreaming(params: {
    to: string;
    text: string;
    finish: boolean;
  }): Promise<void> {
    if (!this.wsClient) {
      throw new Error('WSClient 未连接');
    }
    // 主动推送场景使用 markdown 类型
    await this.wsClient.sendMessage(params.to, {
      msgtype: 'markdown',
      markdown: { content: params.text },
    });
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
   * 处理企业微信消息
   */
  private async handleWecomMessage(frame: WsFrame<WecomMessage>): Promise<void> {
    const body = frame.body;
    if (!body) {
      this.logger.warn('[WeCom] 消息 body 为空');
      return;
    }

    const userId = body.from?.userid;
    if (!userId) {
      this.logger.warn('[WeCom] 消息缺少 from.userid');
      return;
    }

    const text = this.extractText(body);

    // 日志打印用户发送的内容
    this.logger.info(`[WeCom][用户消息] from ${userId}: ${text}`);

    // === ACP 模式消息路由 ===
    if (this.acpManager?.hasActiveSession(userId)) {
      if (text.toLowerCase() === 'exit') {
        await this.acpManager.endSession(userId, async (msg) => {
          await this.replyWithFrame(frame, msg);
        });
        return;
      }

      await this.acpManager.sendMessage(userId, text, async (msg) => {
        await this.replyWithFrame(frame, msg);
      });
      return;
    }

    // === 斜杠命令 ===
    if (text.startsWith('/')) {
      const handled = await this.handleSlashCommand(userId, text, frame);
      if (handled) return;
    }

    // 先发送"已收到开始处理"提示
    await this.replyWithFrame(frame, '已收到，开始处理...');

    // 转换为 AgentScope 消息
    const msg = this.convertToAgentScopeMsg(userId, text);

    // 调用 Agent 处理
    const reply = await this.agent.reply({ msgs: [msg] });

    if (!reply) {
      this.logger.warn('[WeCom] Agent 返回为空');
      return;
    }

    const replyText = (reply.content ?? [])
      .filter((c): c is TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('');

    this.logger.info(`[WeCom][Agent回复] to ${userId}: ${replyText}`);

    await this.replyWithFrame(frame, replyText);
  }

  /**
   * 处理斜杠命令
   */
  private async handleSlashCommand(
    userId: string,
    text: string,
    frame: WsFrame<WecomMessage>,
  ): Promise<boolean> {
    const commandName = text.slice(1).split(/\s/)[0];
    const command = this.slashRegistry.get(commandName);
    if (!command) return false;

    const args = text.slice(1 + commandName.length).trim();
    const sendMessage = async (reply: string) => {
      await this.replyWithFrame(frame, reply);
    };
    const sendMessageWithOptions = async (
      reply: string,
      _opts: import('../slash-command/types.js').SendMessageOptions,
    ) => {
      await this.replyWithFrame(frame, reply);
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
      this.logger.error('[WeCom] 斜杠命令执行失败:', error);
      await this.replyWithFrame(
        frame,
        `命令执行失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      return true;
    }
  }

  /**
   * 使用 frame 上下文回复（保持 req_id 关联）
   */
  private async replyWithFrame(frame: WsFrame<WecomMessage>, text: string): Promise<void> {
    if (!this.wsClient) return;
    try {
      await this.wsClient.reply(frame, {
        msgtype: 'text',
        text: { content: text },
      });
    } catch (error) {
      this.logger.error('[WeCom] 回复失败:', error);
    }
  }

  /**
   * 从企业微信消息格式提取文本
   */
  private extractText(msg: WecomMessage): string {
    const msgtype = msg.msgtype;

    switch (msgtype) {
      case 'text': {
        const textMsg = msg as TextMessage;
        return textMsg.text?.content || '';
      }
      case 'image':
        return '（收到图片消息，暂不支持）';
      case 'voice': {
        const voiceMsg = msg as VoiceMessage;
        return voiceMsg.voice?.content || '（收到语音消息，暂不支持）';
      }
      case 'file':
        return '（收到文件消息，暂不支持）';
      case 'video':
        return '（收到视频消息，暂不支持）';
      case 'mixed': {
        const mixedMsg = msg as MixedMessage;
        const texts: string[] = [];
        if (mixedMsg.mixed?.msg_item) {
          for (const item of mixedMsg.mixed.msg_item) {
            if (item.msgtype === 'text' && item.text?.content) {
              texts.push(item.text.content);
            } else if (item.msgtype === 'image') {
              texts.push('（图片）');
            }
          }
        }
        return texts.join('') || '（收到图文消息）';
      }
      default:
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
