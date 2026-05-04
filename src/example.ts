import { createAgentRunner, createLogger, LogLevel, SendMessageOptions, MessageState } from './index.js';

/**
 * 使用示例
 *
 * 设置环境变量：
 *   AGENT_MODEL_BASE_URL=https://api.example.com/v1
 *   AGENT_MODEL_API_KEY=your-api-key
 *   AGENT_MODEL_NAME=gpt-4o
 *   AGENT_SYS_PROMPT=你是一个友好的 AI 助手。
 *   AGENT_LOG_LEVEL=debug  # 可选：debug|info|warn|error
 *
 * 运行：
 *   npm run build
 *   node dist/example.js
 */

async function main() {
  // 可选：自定义日志级别，默认为 'info'
  // 可通过环境变量 AGENT_LOG_LEVEL 设置
  const logLevel = (process.env.AGENT_LOG_LEVEL as LogLevel) || 'info';

  const logger = createLogger({ level: logLevel, prefix: '[Example] ' });

  // 创建 AgentRunner
  const runner = await createAgentRunner({
    logger,
    weixin: {
      sendMessage: async (to: string, text: string) => {
        // 这里使用 openclaw-weixin 的发送函数
        // import { sendMessageWeixin } from '@tencent-weixin/openclaw-weixin';
        // await sendMessageWeixin({ to, text });
        logger.info(`[发送消息] to: ${to}, text: ${text}`);
      },
      // 可选：支持带 message_state 的发送，用于流式 Demo
      sendMessageWithOptions: async (to: string, text: string, opts: SendMessageOptions) => {
        // import { sendMessage, MessageState } from '@tencent-weixin/openclaw-weixin';
        // 实际使用时需要构建自定义 SendMessageReq 并调用 sendMessage API
        const stateLabel = opts.messageState === MessageState.GENERATING ? 'GENERATING' : 'FINISH';
        logger.info(`[发送消息(${stateLabel})] to: ${to}, text: ${text}`);
      },
    },
  });

  const bridge = runner.getBridge();

  // 模拟收到微信消息
  // 实际使用中，这里应该连接微信消息监控
  const mockWeixinMessage = {
    from_user_id: 'user123',
    item_list: [{ type: 1, content: '你好' }],
  };

  logger.info('处理消息...');

  try {
    // @ts-ignore - 模拟消息类型
    await bridge.handleMessage(mockWeixinMessage);
    logger.info('消息处理完成');
  } catch (error) {
    logger.error('处理消息失败:', error);
  }

  // 优雅退出
  process.on('SIGINT', async () => {
    logger.info('正在停止...');
    await runner.stop();
    process.exit(0);
  });
}

main().catch(console.error);