import type { SlashCommandHandler, SlashCommandResult, SendMessageOptions } from '../../slash-command/types.js';

// message_state 常量，对应微信 API
const MessageState = {
  NEW: 0,
  GENERATING: 1,
  FINISH: 2,
} as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 直接调用微信 sendMessage API，支持自定义 message_state 和 client_id
 */
async function sendWithState(baseUrl: string, token: string, toUserId: string, clientId: string, text: string, state: number): Promise<void> {
  const headers = {
    'Content-Type': 'application/json',
    'AuthorizationType': 'ilink_bot_token',
    'Authorization': `Bearer ${token}`,
    'X-WECHAT-UIN': String(Math.floor(Math.random() * 0xffffffff)),
    'iLink-App-Id': '',
    'iLink-App-ClientVersion': '65536',
  };

  const body = {
    msg: {
      from_user_id: '',
      to_user_id: toUserId,
      client_id: clientId,
      message_type: 2,
      message_state: state,
      item_list: [{ type: 1, text_item: { text } }],
    },
  };

  const stateLabels: Record<number, string> = { 0: 'NEW', 1: 'GENERATING', 2: 'FINISH' };
  console.error(`\n📤 [streaming] 发送第 ${stateLabels[state] ?? state} 次请求:`);
  console.error(`    baseUrl:   ${baseUrl}`);
  console.error(`    toUserId:  ${toUserId}`);
  console.error(`    clientId:  ${clientId}`);
  console.error(`    message_state: ${state} (${stateLabels[state] ?? 'unknown'})`);
  console.error(`    text (前50字): ${text.slice(0, 50)}`);
  console.error(`    完整 body: ${JSON.stringify(body, null, 2)}`);

  const url = `${baseUrl}/ilink/bot/sendmessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  console.error(`    响应状态: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errText = await response.text().catch(() => '<无法读取>');
    console.error(`    响应内容: ${errText}`);
    throw new Error(`sendmessage failed: ${response.status} ${response.statusText}`);
  }
}

interface StreamingHandlerDeps {
  baseUrl: string;
  token: string;
}

/**
 * /streaming 命令 - 流式发送演示
 *
 * 演示 message_state 的完整流程：
 * 1. GENERATING + "正在思考..."
 * 2. GENERATING + "正在生成内容..."
 * 3. GENERATING + "内容生成中..."
 * 4. FINISH + 完整内容
 */
export default function createStreamingHandler(deps: StreamingHandlerDeps): SlashCommandHandler {
  return async (_args, ctx): Promise<SlashCommandResult> => {
    const { sendMessage } = ctx;
    const { baseUrl, token } = deps;

    // 从 ctx.userId 获取接收者 ID（slash command 上下文里有 userId）
    const toUserId = ctx.userId;

    // 复用同一个 client_id，让微信端更新同一条消息
    const clientId = `streaming-${Date.now()}`;

    // 第一阶段：GENERATING
    await sendWithState(baseUrl, token, toUserId, clientId, '🚀 流式 Demo 开始\n正在初始化...', MessageState.GENERATING);

    await sleep(1000);

    // 第二阶段：继续 GENERATING
    await sendWithState(
      baseUrl, token, toUserId, clientId,
      [
        '🔄 流式生成中... (2/4)',
        '',
        '这是第二段内容，模拟 AI 正在逐步生成的过程。',
        '在实际场景中，这里可能是 LLM 流式输出的第一批 tokens。',
      ].join('\n'),
      MessageState.GENERATING,
    );

    await sleep(1500);

    // 第三阶段：继续 GENERATING
    await sendWithState(
      baseUrl, token, toUserId, clientId,
      [
        '✨ 即将完成... (3/4)',
        '',
        '这是第三段内容。',
        '通过多次发送不同 message_state 的消息，',
        '可以模拟流式输出的效果。',
        '',
        '📊 当前状态：',
        '  • 已发送 3 条 GENERATING 消息',
        '  • 即将发送最后一条 FINISH 消息',
      ].join('\n'),
      MessageState.GENERATING,
    );

    await sleep(1000);

    // 第四阶段：FINISH
    await sendWithState(
      baseUrl, token, toUserId, clientId,
      [
        '✅ 流式生成完成！(4/4) — 最终结果',
        '',
        '📝 总结：',
        '  • 本 Demo 演示了 message_state 的使用方式',
        '  • GENERATING (1) = 正在生成中',
        '  • FINISH (2) = 生成完成',
        '',
        '💡 提示：微信端是否支持同一条消息的增量更新，',
        '   取决于服务端实现。当前每条消息作为独立消息发送。',
      ].join('\n'),
      MessageState.FINISH,
    );

    return { handled: true };
  };
}
