/**
 * ACP 输出格式化
 * 将 ACP 会话更新事件格式化为可读的终端输出
 */

import type { SessionUpdate, ToolCall, ToolCallUpdate, PromptResponse } from '@agentclientprotocol/sdk';

/** 记录当前是否在输出内容 */
let isOutputting = false;

/**
 * 格式化并打印会话更新通知
 */
export function formatSessionUpdate(params: { update: SessionUpdate }): void {
  const update = params.update;

  // 根据 sessionUpdate 字段区分更新类型
  switch (update.sessionUpdate) {
    case 'user_message_chunk':
      // 用户消息块，通常不需要显示
      break;

    case 'agent_message_chunk':
      // Agent 消息内容块
      formatContentChunk(update, 'text');
      break;

    case 'agent_thought_chunk':
      // Agent 思考内容块
      formatContentChunk(update, 'thought');
      break;

    case 'tool_call':
      // 工具调用
      formatToolCall(update as ToolCall);
      break;

    case 'tool_call_update':
      // 工具调用更新
      formatToolCallUpdate(update as ToolCallUpdate);
      break;

    case 'plan':
      // 计划更新
      if ((update as Record<string, unknown>).content) {
        console.error(`\n📋 [计划] ${String((update as Record<string, unknown>).content).slice(0, 200)}`);
      }
      break;

    case 'available_commands_update':
      // 可用命令更新
      break;

    case 'current_mode_update':
      // 当前模式更新
      console.error(`\n[模式] ${(update as Record<string, unknown>).mode}`);
      break;

    case 'config_option_update':
      // 配置选项更新
      break;

    case 'session_info_update':
      // 会话信息更新
      break;

    case 'usage_update':
      // 使用量更新
      formatUsageUpdate(update);
      break;

    default:
      // 忽略未知类型
      break;
  }
}

/**
 * 从 content 字段提取文本
 * content 可能是字符串或数组 [{ type: 'text', text: '...' }]
 */
function extractText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item) {
          return String((item as Record<string, unknown>).text ?? '');
        }
        return '';
      })
      .join('');
  }

  if (content && typeof content === 'object' && 'text' in content) {
    return String((content as Record<string, unknown>).text ?? '');
  }

  return '';
}

/**
 * 格式化内容块（文本或思考）
 */
function formatContentChunk(
  update: { sessionUpdate: string; content?: unknown },
  type: 'text' | 'thought',
): void {
  const content = extractText(update.content);
  if (!content) return;

  if (type === 'thought') {
    if (!isOutputting) {
      console.error('\n💭 [思考中]');
      isOutputting = true;
    }
  } else {
    if (!isOutputting) {
      console.error('\n═══════════════════════════════════════════');
      console.error('🤖 AI 回复:');
      console.error('═══════════════════════════════════════════\n');
      isOutputting = true;
    }
  }

  process.stdout.write(content);
}

/**
 * 格式化工具调用
 */
function formatToolCall(toolCall: ToolCall): void {
  isOutputting = false;
  const name = toolCall.toolCallId ?? '未知工具';
  const input = toolCall.rawInput;

  console.error(`\n\n🔧 [工具调用] ${name}`);
  if (input) {
    const inputStr = typeof input === 'string' ? input : JSON.stringify(input, null, 2);
    console.error(`   输入: ${inputStr.length > 150 ? inputStr.slice(0, 150) + '...' : inputStr}`);
  }
  console.error('');
}

/**
 * 格式化工具调用更新
 */
function formatToolCallUpdate(update: ToolCallUpdate): void {
  const status = (update as Record<string, unknown>).status as string | undefined;
  if (status) {
    console.error(`   状态: ${status}`);
  }
  if (update.content) {
    const text = extractText(update.content);
    if (text) {
      console.error(`   结果: ${text.slice(0, 200)}`);
    }
  }
}

/**
 * 格式化使用量更新
 */
function formatUsageUpdate(_update: SessionUpdate): void {
  // 使用量信息通常在最终结果中显示
}

/**
 * 重置输出状态
 */
export function resetOutputState(): void {
  isOutputting = false;
}

/**
 * 打印 prompt 响应的最终结果
 */
export function formatPromptResult(result: PromptResponse): void {
  isOutputting = false;

  console.error('\n\n═══════════════════════════════════════════');
  console.error('✅ 本轮对话完成');
  console.error('═══════════════════════════════════════════');

  if (result.stopReason) {
    console.error(`[结果] 停止原因: ${result.stopReason}`);
  }

  if (result.usage) {
    console.error(`[结果] Token 使用:`);
    const usage = result.usage as Record<string, unknown>;
    if (usage.input_tokens !== undefined) {
      console.error(`   输入: ${usage.input_tokens} tokens`);
    }
    if (usage.output_tokens !== undefined) {
      console.error(`   输出: ${usage.output_tokens} tokens`);
    }
  }
  console.error('');
}
