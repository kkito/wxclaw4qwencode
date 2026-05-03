/**
 * Channel 统一消息类型
 * 用于在不同消息通道（微信、企业微信等）之间统一消息格式
 */

export type ChannelType = 'weixin' | 'wecom' | 'feishu';

export interface ChannelMessage {
  /** 发送者 ID */
  from: string;
  /** 接收者 ID */
  to: string;
  /** 消息文本内容 */
  text: string;
  /** 原始消息对象，保留完整信息 */
  raw: unknown;
  /** 消息来源通道类型 */
  channelType: ChannelType;
}
