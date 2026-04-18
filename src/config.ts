import { z } from 'zod';

export const ConfigSchema = z.object({
  agentscope: z.object({
    model: z.object({
      type: z.literal('custom'),
      baseUrl: z.string(),
      apiKey: z.string().optional(),
      modelName: z.string(),
    }),
    sysPrompt: z.string().default('你是一个友好的 AI 助手。'),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  // 简化：从环境变量读取配置
  const baseUrl = process.env.AGENT_MODEL_BASE_URL;
  const apiKey = process.env.AGENT_MODEL_API_KEY;
  const modelName = process.env.AGENT_MODEL_NAME || 'gpt-4o';
  const sysPrompt = process.env.AGENT_SYS_PROMPT || '你是一个友好的 AI 助手。';

  if (!baseUrl) {
    throw new Error('AGENT_MODEL_BASE_URL 环境变量未设置');
  }

  return {
    agentscope: {
      model: {
        type: 'custom' as const,
        baseUrl,
        apiKey,
        modelName,
      },
      sysPrompt,
    },
  };
}