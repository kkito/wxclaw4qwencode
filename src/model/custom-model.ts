import { ChatModelBase, ChatResponse, ChatUsage } from '@agentscope-ai/agentscope/model';
import { Msg, TextBlock, ToolCallBlock, ThinkingBlock, DataBlock } from '@agentscope-ai/agentscope/message';

// Types not properly exported from agentscope package
export type ToolChoice = 'auto' | 'none' | 'required' | string;

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties?: Record<string, object>;
      required?: string[];
    };
  };
}

export interface CustomModelConfig {
  baseUrl: string;
  apiKey?: string;
  modelName: string;
}

export class CustomModel extends ChatModelBase {
  private baseUrl: string;
  private apiKey?: string;

  constructor(config: CustomModelConfig) {
    super({ modelName: config.modelName, stream: true });
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
  }

  // 实现 _callAPI
  protected async _callAPI(
    modelName: string,
    options: { messages: any[]; functions?: any[]; function_call?: any; [key: string]: any }
  ): Promise<ChatResponse | AsyncGenerator<ChatResponse>> {
    const isStream = this.stream;
    const url = `${this.baseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const body: any = {
      model: modelName,
      messages: this.convertMsgsToOpenAI(options.messages),
    };

    // Spread options except messages to avoid overwriting
    for (const [key, value] of Object.entries(options)) {
      if (key !== 'messages') {
        (body as any)[key] = value;
      }
    }

    if (isStream) {
      body.stream = true;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${await response.text()}`);
    }

    if (isStream && response.body) {
      return this.parseStreamResponse(response, modelName);
    }

    const data = await response.json();
    return this.convertResponse(data, modelName);
  }

  private convertMsgsToOpenAI(msgs: Msg[]): any[] {
    return msgs.map((msg) => ({
      role: msg.role,
      content: msg.content
        ?.filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n') || '',
    }));
  }

  private convertResponse(data: any, modelName: string): ChatResponse {
    const choice = data.choices?.[0];
    const msg = choice?.message;
    
    const content: (TextBlock | ToolCallBlock | ThinkingBlock | DataBlock)[] = [];
    if (msg?.content) {
      content.push({
        type: 'text',
        text: msg.content,
        id: crypto.randomUUID(),
      });
    }

    const usage: ChatUsage = {
      type: 'chat_usage',
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      time: 0,
    };

    return {
      type: 'chat',
      id: data.id || crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      content,
      usage,
    };
  }

  private async *parseStreamResponse(
    response: Response,
    modelName: string
  ): AsyncGenerator<ChatResponse> {
    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedText = '';
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          // 返回最终消息
          yield {
            type: 'chat',
            id,
            createdAt,
            content: [{
              type: 'text',
              text: accumulatedText,
              id: crypto.randomUUID(),
            }],
          };
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          const content = delta?.content || '';
          
          if (content) {
            accumulatedText += content;
            yield {
              type: 'chat',
              id: id,
              createdAt: new Date().toISOString(),
              content: [{
                type: 'text',
                text: content,
                id: crypto.randomUUID(),
              }],
            };
          }
        } catch {
          // 跳过无效 JSON
        }
      }
    }
  }

  // countTokens 估算
  async countTokens(options: { messages: Msg[]; functions?: ToolSchema[] }): Promise<number> {
    const text = options.messages
      .map((m) => m.content?.map((c: any) => c.text || '').join('') || '')
      .join('\n');
    return Math.ceil(text.length / 4);
  }

  // 工具格式化
  _formatToolChoice(toolChoice?: ToolChoice): unknown {
    if (!toolChoice) return undefined;
    if (toolChoice === 'auto') return 'auto';
    if (toolChoice === 'none') return 'none';
    return toolChoice;
  }

  _formatToolSchemas(tools: ToolSchema[]): unknown[] {
    return tools;
  }
}