import * as fs from 'node:fs/promises';
import { scanProjectDirs } from './scanner.js';

interface FsDeps {
  readdir: typeof fs.readdir;
  stat: typeof fs.stat;
}

export async function selectProjectByIndex(
  rootDirs: string[],
  index: number,
  fsDeps?: FsDeps,
): Promise<{ path: string } | null> {
  if (index < 1) return null;

  const scanned = await scanProjectDirs(rootDirs, fsDeps);
  const found = scanned.find((d) => d.index === index);
  return found ? { path: found.path } : null;
}
