import { Agent } from '@agentscope-ai/agentscope/agent';
import { createMsg, Msg, TextBlock, ContentBlock } from '@agentscope-ai/agentscope/message';

/**
 * 微信消息类型 - 从 openclaw-weixin 包
 * 包含 from_user_id, item_list 等字段
 */
interface WeixinMessage {
  seq?: number;
  message_id?: number;
  from_user_id?: string;
  to_user_id?: string;
  message_type?: number;
  item_list?: MessageItem[];
  context_token?: string;
}

interface MessageItem {
  type: number;
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
}

export class WeixinBridge {
  private agent: Agent;
  private sendMessageFn: (to: string, text: string) => Promise<void>;

  constructor(options: WeixinBridgeOptions) {
    this.agent = options.agent;
    this.sendMessageFn = options.sendMessage;
  }

  async handleMessage(weixinMsg: WeixinMessage): Promise<void> {
    const userId = weixinMsg.from_user_id;
    if (!userId) {
      console.warn('消息缺少 from_user_id');
      return;
    }

    // 转换为 AgentScope 消息
    const msg = this.convertToMsg(weixinMsg);
    
    // 调用 Agent 处理
    const reply = await this.agent.reply({ msgs: [msg] });
    
    // 发送回复
    await this.sendReply(userId, reply);
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
          return item.content || '';
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
      console.warn('Agent 回复为空');
      return;
    }

    await this.sendMessageFn(toUserId, text);
  }
}