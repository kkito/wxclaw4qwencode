import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export interface WecomChannelConfig {
  enabled?: boolean;
  botId?: string;
  secret?: string;
}

export interface WeixinChannelConfig {
  enabled?: boolean;
}

export interface ChannelConfig {
  weixin?: WeixinChannelConfig;
  wecom?: WecomChannelConfig;
}

export interface ModelConfig {
  baseUrl?: string;
  apiKey?: string;
  modelName?: string;
  sysPrompt?: string;
}

export interface OwnClawConfig {
  sendThrottleIntervalMs?: number;
  channel?: ChannelConfig;
  model?: ModelConfig;
}

const DEFAULT_CONFIG: OwnClawConfig = {
  sendThrottleIntervalMs: 5000,
  channel: {
    weixin: { enabled: true },
    wecom: { enabled: false, botId: '', secret: '' },
  },
};

/**
 * Resolve the config directory.
 * Prioritizes OWNCLAW_STATE_DIR env var, falls back to ~/.ownclaw.
 */
export function resolveConfigDir(): string {
  const envDir = process.env.OWNCLAW_STATE_DIR;
  if (envDir) {
    return envDir;
  }
  return path.join(os.homedir(), '.ownclaw');
}

/**
 * Resolve the full path to config.json.
 */
export function resolveConfigPath(): string {
  return path.join(resolveConfigDir(), 'config.json');
}

/**
 * Load and parse config.json.
 * Returns default config if file doesn't exist or parsing fails.
 */
export async function loadConfig(): Promise<OwnClawConfig> {
  const configPath = resolveConfigPath();
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as OwnClawConfig;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save config to config.json, creating the directory if needed.
 */
export async function saveConfig(config: OwnClawConfig): Promise<void> {
  const dir = resolveConfigDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(resolveConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Load the send throttle interval in milliseconds.
 * Returns the configured value or 5000 as default.
 */
export async function loadSendThrottleInterval(): Promise<number> {
  const config = await loadConfig();
  return config.sendThrottleIntervalMs ?? DEFAULT_CONFIG.sendThrottleIntervalMs!;
}

/**
 * Save the send throttle interval in milliseconds.
 */
export async function saveSendThrottleInterval(ms: number): Promise<void> {
  const config = await loadConfig();
  config.sendThrottleIntervalMs = ms;
  await saveConfig(config);
}

/**
 * Load channel configuration.
 */
export async function loadChannelConfig(): Promise<ChannelConfig> {
  const config = await loadConfig();
  return config.channel ?? DEFAULT_CONFIG.channel!;
}

/**
 * Save channel configuration.
 */
export async function saveChannelConfig(channel: ChannelConfig): Promise<void> {
  const config = await loadConfig();
  config.channel = channel;
  await saveConfig(config);
}

/**
 * Check if WeCom channel is enabled and has required credentials.
 */
export async function isWecomEnabled(): Promise<boolean> {
  const channel = await loadChannelConfig();
  return !!(channel.wecom?.enabled && channel.wecom.botId && channel.wecom.secret);
}

/**
 * Load model configuration from config.json.
 * Returns empty object if not set or read fails.
 */
export async function loadModelConfig(): Promise<ModelConfig> {
  try {
    const configPath = resolveConfigPath();
    const raw = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as OwnClawConfig;
    return parsed.model ?? {};
  } catch {
    return {};
  }
}

/**
 * Save model configuration to config.json, merging with existing config.
 */
export async function saveModelConfig(config: Partial<ModelConfig>): Promise<void> {
  const configPath = resolveConfigPath();
  const dir = resolveConfigDir();

  let existing: OwnClawConfig = {};
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    existing = JSON.parse(raw) as OwnClawConfig;
  } catch {
    // File doesn't exist or is invalid, start fresh
  }

  existing.model = {
    ...existing.model,
    ...config,
  };

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(existing, null, 2), 'utf-8');
}
