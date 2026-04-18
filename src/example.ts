import { createAgentRunner } from './index';

/**
 * 使用示例
 * 
 * 设置环境变量：
 *   AGENT_MODEL_BASE_URL=https://api.example.com/v1
 *   AGENT_MODEL_API_KEY=your-api-key
 *   AGENT_MODEL_NAME=gpt-4o
 *   AGENT_SYS_PROMPT=你是一个友好的 AI 助手。
 * 
 * 运行：
 *   npm run build
 *   node dist/example.js
 */

async function main() {
  // 创建 AgentRunner
  const runner = await createAgentRunner({
    weixin: {
      sendMessage: async (to: string, text: string) => {
        // 这里使用 openclaw-weixin 的发送函数
        // import { sendMessageWeixin } from '@tencent-weixin/openclaw-weixin';
        // await sendMessageWeixin({ to, text });
        console.log(`[发送消息] to: ${to}, text: ${text}`);
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

  console.log('处理消息...');
  
  try {
    // @ts-ignore - 模拟消息类型
    await bridge.handleMessage(mockWeixinMessage);
    console.log('消息处理完成');
  } catch (error) {
    console.error('处理消息失败:', error);
  }

  // 优雅退出
  process.on('SIGINT', async () => {
    console.log('\n正在停止...');
    await runner.stop();
    process.exit(0);
  });
}

main().catch(console.error);