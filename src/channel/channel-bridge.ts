import type { ChannelMessage } from './types.js';

/**
 * ChannelBridge 接口
 * 定义消息通道的标准操作，所有通道（微信、企业微信等）都实现此接口
 */
export interface ChannelBridge {
  /**
   * 启动 Channel（连接/监听）
   */
  start(): Promise<void>;

  /**
   * 停止 Channel（断开连接/清理资源）
   */
  stop(): Promise<void>;

  /**
   * 发送文本回复到指定用户
   */
  sendReply(params: { to: string; text: string }): Promise<void>;

  /**
   * 流式发送文本回复
   * @param to 目标用户 ID
   * @param text 文本内容
   * @param finish 是否为最后一次推送（true 表示完成）
   */
  sendReplyStreaming?(params: {
    to: string;
    text: string;
    finish: boolean;
  }): Promise<void>;

  /**
   * 注册消息到达回调
   * AgentRunner 或其他消费者调用此方法注册处理函数
   */
  onMessage(callback: (msg: ChannelMessage) => Promise<void>): void;
}
