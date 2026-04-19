import { z } from 'zod';
import { LogLevel } from './logger';

export const ConfigSchema = z.object({
  log: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),
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
  const logLevel = (process.env.AGENT_LOG_LEVEL as LogLevel) || 'info';

  if (!baseUrl) {
    throw new Error('AGENT_MODEL_BASE_URL 环境变量未设置');
  }

  const config = {
    log: {
      level: logLevel,
    },
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

  return ConfigSchema.parse(config);
}