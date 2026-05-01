import * as fs from 'node:fs/promises';
import { resolveConfigDir, resolveConfigPath } from '../config-store.js';

export interface AcpConfig {
  acpProjectDirs?: string[];
}

export async function loadAcpProjectDirs(): Promise<string[]> {
  try {
    const raw = await fs.readFile(resolveConfigPath(), 'utf-8');
    const parsed = JSON.parse(raw) as AcpConfig;
    return parsed.acpProjectDirs ?? [];
  } catch {
    return [];
  }
}

export async function saveAcpProjectDirs(dirs: string[]): Promise<void> {
  const dir = resolveConfigDir();
  await fs.mkdir(dir, { recursive: true });
  const config: AcpConfig = { acpProjectDirs: dirs };
  await fs.writeFile(resolveConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}
