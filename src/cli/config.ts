import path from 'node:path';
import os from 'node:os';

/**
 * 解析状态目录
 * 优先级: OWNCLAW_STATE_DIR 环境变量 > ~/.ownclaw
 */
export function resolveStateDir(): string {
  const envPath = process.env.OWNCLAW_STATE_DIR?.trim();
  if (envPath) return path.resolve(envPath);
  return path.join(os.homedir(), '.ownclaw');
}