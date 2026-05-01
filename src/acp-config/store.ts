import * as fs from 'node:fs/promises';
import { resolveConfigDir, resolveConfigPath } from '../config-store.js';

export interface AcpConfigEntry {
  acpProjectDirs?: string[];
}

export async function loadAcpProjectDirs(): Promise<string[]> {
  try {
    const raw = await fs.readFile(resolveConfigPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const acpEntry = parsed.acpProjectDirs;
    if (Array.isArray(acpEntry)) {
      return acpEntry.filter((d): d is string => typeof d === 'string' && d.length > 0);
    }
    return [];
  } catch {
    return [];
  }
}

export async function saveAcpProjectDirs(dirs: string[]): Promise<void> {
  const dir = resolveConfigDir();
  await fs.mkdir(dir, { recursive: true });

  // Load existing config to preserve other fields (e.g., sendThrottleIntervalMs)
  let existing: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(resolveConfigPath(), 'utf-8');
    existing = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // File doesn't exist yet, start fresh
  }

  existing.acpProjectDirs = dirs;
  await fs.writeFile(resolveConfigPath(), JSON.stringify(existing, null, 2), 'utf-8');
}
