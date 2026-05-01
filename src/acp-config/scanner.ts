import * as fs from 'node:fs/promises';

export interface ScannedDir {
  index: number;
  name: string;
  path: string;
  root: string;
}

interface FsDeps {
  readdir: typeof fs.readdir;
  stat: typeof fs.stat;
}

const defaultFs: FsDeps = {
  readdir: fs.readdir.bind(fs),
  stat: fs.stat.bind(fs),
};

export async function scanProjectDirs(
  rootDirs: string[],
  fsDeps?: FsDeps,
): Promise<ScannedDir[]> {
  const { readdir, stat } = fsDeps ?? defaultFs;
  const results: ScannedDir[] = [];

  for (const root of rootDirs) {
    try {
      const entries = await readdir(root);
      for (const entry of entries) {
        const fullPath = `${root}/${entry}`;
        const st = await stat(fullPath);
        if (st.isDirectory()) {
          results.push({
            index: 0,
            name: entry,
            path: fullPath,
            root,
          });
        }
      }
    } catch {
      // skip nonexistent root dirs
    }
  }

  results.sort((a, b) => a.path.localeCompare(b.path));
  results.forEach((d, i) => {
    d.index = i + 1;
  });

  return results;
}
