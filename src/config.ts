import { z } from 'zod';
import { LogLevel } from './logger.js';
import { loadModelConfig } from './config-store.js';

// Channel 配置 schema
export const ChannelSchema = z.object({
  weixin: z.object({
    enabled: z.boolean().default(true),
  }).default({ enabled: true }),
  wecom: z.object({
    enabled: z.boolean().default(false),
    botId: z.string().default(''),
    secret: z.string().default(''),
  }).default({ enabled: false, botId: '', secret: '' }),
}).default({ weixin: { enabled: true }, wecom: { enabled: false, botId: '', secret: '' } });

export const ConfigSchema = z.object({
  log: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),
  agentscope: z.object({
    model: z.object({
      type: z.literal('custom'),
      baseUrl: z.string().optional(),
      apiKey: z.string().optional(),
      modelName: z.string(),
    }),
    sysPrompt: z.string().default('你是一个友好的 AI 助手。'),
  }),
  channel: ChannelSchema,
});

export type Config = z.infer<typeof ConfigSchema>;

export async function loadConfig(): Promise<Config> {
  // First load from config-store
  const storedModel = await loadModelConfig();

  // Then overlay environment variables (env vars take precedence)
  const envBaseUrl = process.env.AGENT_MODEL_BASE_URL || undefined;
  const envApiKey = process.env.AGENT_MODEL_API_KEY || undefined;
  const envModelName = process.env.AGENT_MODEL_NAME || undefined;
  const envSysPrompt = process.env.AGENT_SYS_PROMPT || undefined;
  const logLevel = (process.env.AGENT_LOG_LEVEL as LogLevel) || 'info';

  const baseUrl = envBaseUrl ?? storedModel.baseUrl;
  const apiKey = envApiKey ?? storedModel.apiKey;
  const modelName = envModelName ?? storedModel.modelName ?? 'gpt-4o';
  const sysPrompt = envSysPrompt ?? storedModel.sysPrompt ?? '你是一个友好的 AI 助手。';

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
    channel: {
      weixin: { enabled: true },
      wecom: { enabled: false, botId: '', secret: '' },
    },
  };

  return ConfigSchema.parse(config);
}