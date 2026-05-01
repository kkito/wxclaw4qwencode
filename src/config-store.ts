import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export interface OwnClawConfig {
  sendThrottleIntervalMs?: number;
}

const DEFAULT_CONFIG: OwnClawConfig = {
  sendThrottleIntervalMs: 5000,
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
