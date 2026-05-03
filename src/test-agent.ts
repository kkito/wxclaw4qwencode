/**
 * 单独测试 AgentScope -> 大模型流程
 * 运行: pnpm run dev:test
 */
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createAgentRunner } from './runner/agent-runner.js';

async function testAgent() {
  console.log('=== 测试 AgentScope -> 大模型 ===\n');

  const config = await loadConfig();
  const logger = createLogger({ level: 'debug', prefix: '[Test] ' });

  // 创建一个 mock sendMessage（不实际发送）
  const runner = await createAgentRunner({
    config,
    logger,
    weixin: {
      sendMessage: async (_to: string, text: string) => {
        console.log('📤 机器人回复:', text);
      },
    },
  });

  const bridge = runner.getBridge();

  // 模拟微信消息
  const testMessage = {
    from_user_id: 'test_user_123',
    message_type: 1,
    item_list: [
      { type: 1, text_item: { text: '你好，请介绍一下你自己' } },
    ],
  };

  console.log('📥 收到用户消息:', '你好，请介绍一下你自己\n');

  await bridge.handleMessage(testMessage);
}

testAgent().catch(console.error);