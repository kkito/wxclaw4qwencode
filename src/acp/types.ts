/**
 * ACP 客户端类型定义
 */

export interface AcpClientOptions {
  /** qwen CLI 可执行文件路径，默认 'qwen' */
  cliPath?: string;
  /** 工作目录 */
  cwd: string;
  /** AI 模型名称 */
  model?: string;
  /** 是否自动同意所有权限请求 */
  autoApprove?: boolean;
}

export interface AcpSessionInfo {
  sessionId: string;
  cwd: string;
}

/**
 * 流式输出事件的类型
 */
export enum StreamEventType {
  /** 消息开始 */
  MessageStart = 'message_start',
  /** 内容块开始 */
  ContentBlockStart = 'content_block_start',
  /** 内容增量 */
  ContentBlockDelta = 'content_block_delta',
  /** 内容块结束 */
  ContentBlockStop = 'content_block_stop',
  /** 消息结束 */
  MessageStop = 'message_stop',
}

/**
 * 内容块类型
 */
export enum ContentBlockType {
  /** 普通文本 */
  Text = 'text',
  /** 思考内容 */
  Thinking = 'thinking',
  /** 工具调用 */
  ToolUse = 'tool_use',
  /** 工具结果 */
  ToolResult = 'tool_result',
}

/**
 * 流式输出事件
 */
export interface StreamEvent {
  type: StreamEventType;
  index?: number;
  contentBlock?: {
    type: ContentBlockType;
    text?: string;
    thinking?: string;
    name?: string;
    input?: unknown;
  };
  delta?: {
    type: 'text_delta' | 'thinking_delta' | 'input_json_delta';
    text?: string;
    thinking?: string;
    partialJson?: string;
  };
}

/**
 * 权限请求信息
 */
export interface PermissionRequest {
  toolName: string;
  toolInput: unknown;
  options: Array<{
    optionId: string;
    label?: string;
  }>;
}
