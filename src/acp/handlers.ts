/**
 * ACP 消息处理器
 * 处理来自 ACP 服务端的请求：权限请求、会话更新、扩展通知
 */

import type { Client, Agent, RequestPermissionRequest, RequestPermissionResponse, SessionNotification, PermissionOption, SelectedPermissionOutcome, ToolCall } from '@agentclientprotocol/sdk';
import { formatSessionUpdate } from './output.js';

export interface HandlerOptions {
  /** 是否自动同意所有权限请求 */
  autoApprove?: boolean;
}

/**
 * 创建 ACP Client 处理器
 * 返回一个 Client 对象，用于处理来自服务端（Agent 端）的请求
 */
export function createClientHandler(options: HandlerOptions = {}): (agent: Agent) => Client {
  const { autoApprove = true } = options;

  return (_agent: Agent): Client => {
    return {
      /**
       * 处理权限请求
       * 当 Agent 需要执行工具（如文件读写、Shell 命令）时，会向客户端请求权限
       */
      requestPermission: async (params: RequestPermissionRequest): Promise<RequestPermissionResponse> => {
        const toolCall = params.toolCall as ToolCall | undefined;
        const toolName = toolCall?._meta?.name as string ?? toolCall?.toolCallId ?? '未知工具';
        const toolInput = toolCall?.rawInput;

        console.error(`\n[权限] 收到权限请求:`);
        console.error(`[权限] 工具: ${toolName}`);
        if (toolInput) {
          const inputStr = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput);
          console.error(`[权限] 输入: ${inputStr.slice(0, 200)}`);
        }

        if (autoApprove) {
          // 自动同意：优先选择 "allow_once"，否则选第一个选项
          const availableOptions: PermissionOption[] = params.options ?? [];

          const selectedOption =
            availableOptions.find((o: PermissionOption) => o.kind === 'allow_once') ??
            availableOptions.find((o: PermissionOption) => o.kind === 'allow_always') ??
            availableOptions[0];

          if (selectedOption) {
            console.error(`[权限] 自动同意 (optionId: ${selectedOption.optionId}, kind: ${selectedOption.kind})`);
            const outcome: SelectedPermissionOutcome = {
              optionId: selectedOption.optionId,
            };
            return {
              outcome: {
                outcome: 'selected',
                ...outcome,
              },
            };
          } else {
            console.error(`[权限] 无可用选项，拒绝`);
            return {
              outcome: {
                outcome: 'cancelled',
              },
            };
          }
        } else {
          // 手动模式：默认拒绝
          console.error(`[权限] 拒绝（手动模式未实现交互式确认）`);
          return {
            outcome: {
              outcome: 'cancelled',
            },
          };
        }
      },

      /**
       * 处理会话更新通知
       * 包含流式输出的内容块：文本、思考、工具调用等
       */
      sessionUpdate: async (params: SessionNotification): Promise<void> => {
        formatSessionUpdate(params);
      },

      /**
       * 处理扩展通知
       * 目前为空实现
       */
      extNotification: async (): Promise<void> => {
        // 扩展通知，暂不处理
      },
    };
  };
}
