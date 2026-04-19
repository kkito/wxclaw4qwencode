import { Agent } from '@agentscope-ai/agentscope/agent';
import { createMsg, Msg, TextBlock, ContentBlock } from '@agentscope-ai/agentscope/message';
import { getGlobalLogger, Logger } from '../logger.js';

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

export interface WeixinBridgeOptions {
  agent: Agent;
  sendMessage: (to: string, text: string) => Promise<void>;
  logger?: Logger;
}

export class WeixinBridge {
  private agent: Agent;
  private sendMessageFn: (to: string, text: string) => Promise<void>;
  private logger: Logger;

  constructor(options: WeixinBridgeOptions) {
    this.agent = options.agent;
    this.sendMessageFn = options.sendMessage;
    this.logger = options.logger || getGlobalLogger();
  }

  async handleMessage(weixinMsg: WeixinMessage): Promise<void> {
    const userId = weixinMsg.from_user_id;
    if (!userId) {
      this.logger.warn('消息缺少 from_user_id');
      return;
    }

    try {
      const text = this.extractText(weixinMsg);

      // 日志打印用户发送的内容
      this.logger.info(`[用户消息] from ${userId}: ${text}`);

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