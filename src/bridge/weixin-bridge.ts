import { Agent } from '@agentscope-ai/agentscope/agent';
import { createMsg, Msg, TextBlock, ContentBlock } from '@agentscope-ai/agentscope/message';
import { getGlobalLogger, Logger } from '../logger.js';
import { SlashCommandRegistry } from '../slash-command/index.js';
import type { SlashCommandContext } from '../slash-command/types.js';
import type { AcpSessionManager } from '../acp-session/manager.js';

/**
 * 微信消息类型 - 从 openclaw-weixin 包
 * 包含 from_user_id, item_list 等字段
 */
export interface WeixinMessage {
  seq?: number;
  message_id?: number;
  from_user_id?: string;
  to_user_id?: string;
  message_type?: number;
  item_list?: MessageItem[];
  context_token?: string;
}

export interface MessageItem {
  type: number;
  text_item?: {
    text: string;
  };
  content?: string;
  media_url?: string;
  file_name?: string;
}

// 消息类型常量
const MessageItemType = {
  NONE: 0,
  TEXT: 1,
  IMAGE: 2,
  VOICE: 3,
  FILE: 4,
  VIDEO: 5,
} as const;

/** 消息状态，对应微信 message_state 字段 */
export const MessageState = {
  NEW: 0,
  GENERATING: 1,
  FINISH: 2,
} as const;

export type MessageStateType = typeof MessageState[keyof typeof MessageState];

export interface SendMessageOptions {
  messageState?: MessageStateType;
}

export interface WeixinBridgeOptions {
  agent: Agent;
  sendMessage: (to: string, text: string) => Promise<void>;
  sendMessageWithOptions?: (to: string, text: string, opts: SendMessageOptions) => Promise<void>;
  logger?: Logger;
  slashRegistry?: SlashCommandRegistry;
  acpManager?: AcpSessionManager;
}

export class WeixinBridge {
  private agent: Agent | null;
  private sendMessageFn: (to: string, text: string) => Promise<void>;
  private sendMessageWithOptionsFn: (to: string, text: string, opts: SendMessageOptions) => Promise<void>;
  private logger: Logger;
  private slashRegistry: SlashCommandRegistry;
  private acpManager: AcpSessionManager | null;

  constructor(options: WeixinBridgeOptions) {
    this.agent = options.agent;
    this.sendMessageFn = options.sendMessage;
    this.sendMessageWithOptionsFn = options.sendMessageWithOptions || this.defaultSendMessageWithOptions;
    this.logger = options.logger || getGlobalLogger();
    this.slashRegistry = options.slashRegistry || new SlashCommandRegistry();
    this.acpManager = options.acpManager || null;
  }

  setAgent(agent: Agent): void {
    this.agent = agent;
  }

  private defaultSendMessageWithOptions = async (
    to: string,
    text: string,
    _opts: SendMessageOptions,
  ): Promise<void> => {
    await this.sendMessageFn(to, text);
  };

  async handleMessage(weixinMsg: WeixinMessage): Promise<void> {
    const userId = weixinMsg.from_user_id;
    if (!userId) {
      this.logger.warn('消息缺少 from_user_id');
      return;
    }

    // 检查 agent 是否已配置
    if (!this.agent) {
      await this.sendMessageFn(userId, '模型配置未完成，请前往设置页面配置。');
      return;
    }

    try {
      const text = this.extractText(weixinMsg);

      // 日志打印用户发送的内容
      this.logger.info(`[用户消息] from ${userId}: ${text}`);

      // === ACP 模式消息路由 ===
      if (this.acpManager?.hasActiveSession(userId)) {
        // 检查是否是 exit 命令
        if (text.toLowerCase() === 'exit') {
          await this.acpManager.endSession(userId, async (msg) => {
            await this.sendMessageFn(userId, msg);
          });
          return;
        }

        // 路由到 ACP
        await this.acpManager.sendMessage(userId, text, async (msg) => {
          await this.sendMessageFn(userId, msg);
        });
        return;
      }

      // === Slash command pre-intercept ===
      if (text.startsWith('/')) {
        const commandName = text.slice(1).split(/\s/)[0];
        const command = this.slashRegistry.get(commandName);
        if (command) {
          const args = text.slice(1 + commandName.length).trim();
          const sendMessage = async (reply: string) => {
            await this.sendMessageFn(userId, reply);
          };
          const sendMessageWithOptions = async (
            reply: string,
            opts: import('../slash-command/types.js').SendMessageOptions,
          ) => {
            await this.sendMessageWithOptionsFn(userId, reply, {
              messageState: opts.messageState as MessageStateType | undefined,
            });
          };
          const ctx: SlashCommandContext = {
            userId,
            text,
            sendMessage,
            sendMessageWithOptions,
          };
          try {
            const result = await command.handler(args, ctx);
            if (result.handled) return;
          } catch (error) {
            this.logger.error('斜杠命令执行失败:', error);
            await this.sendMessageFn(userId, `命令执行失败: ${error instanceof Error ? error.message : String(error)}`);
            return;
          }
        }
      }

      // 先发送"已收到开始处理"提示
      await this.sendMessageFn(userId, '已收到，开始处理...');

      // 转换为 AgentScope 消息
      const msg = this.convertToMsg(weixinMsg);

      // 调用 Agent 处理
      const reply = await this.agent.reply({ msgs: [msg] });

      if (!reply) {
        this.logger.warn('Agent 返回为空');
        return;
      }

      const replyText = (reply.content ?? [])
        .filter((c): c is TextBlock => c.type === 'text')
        .map((c) => c.text)
        .join('');

      // 日志打印回复内容
      this.logger.info(`[Agent回复] to ${userId}: ${replyText}`);

      // 发送回复
      await this.sendReply(userId, reply);
      this.logger.debug(`已发送回复 to ${userId}`);
    } catch (error) {
      this.logger.error('处理消息失败:', error);
      // 可以选择发送错误消息给用户
      try {
        await this.sendMessageFn(userId, '抱歉，处理您的消息时出现错误，请稍后重试。');
      } catch {
        // 忽略发送错误消息的失败
      }
    }
  }

  getSlashRegistry(): SlashCommandRegistry {
    return this.slashRegistry;
  }

  /**
   * 发送消息，支持自定义 message_state
   * 用于流式发送 demo：GENERATING → GENERATING → ... → FINISH
   */
  async sendMessageWithOptions(
    to: string,
    text: string,
    opts?: SendMessageOptions,
  ): Promise<void> {
    await this.sendMessageWithOptionsFn(to, text, opts || {});
  }

  private convertToMsg(weixinMsg: WeixinMessage): Msg {
    const userId = weixinMsg.from_user_id || 'unknown';
    const text = this.extractText(weixinMsg);

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

  private extractText(msg: WeixinMessage): string {
    const items = msg.item_list;

    if (!items || items.length === 0) return '';

    for (const item of items) {
      switch (item.type) {
        case MessageItemType.TEXT:
          // 微信消息结构是 text_item.text，不是 content
          return item.text_item?.text || item.content || '';
        case MessageItemType.IMAGE:
          return '（收到图片消息，暂不支持）';
        case MessageItemType.VOICE:
          return '（收到语音消息，暂不支持）';
        case MessageItemType.FILE:
          return '（收到文件消息，暂不支持）';
        case MessageItemType.VIDEO:
          return '（收到视频消息，暂不支持）';
        default:
          continue;
      }
    }
    return '';
  }

  private async sendReply(toUserId: string, reply: Msg): Promise<void> {
    const text = (reply.content ?? [])
      .filter((c: ContentBlock): c is TextBlock => c.type === 'text')
      .map((c: TextBlock) => c.text)
      .join('');

    if (!text) {
      this.logger.warn('Agent 回复为空');
      return;
    }

    await this.sendMessageFn(toUserId, text);
  }
}
