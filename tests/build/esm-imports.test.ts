import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const distDir = join(__dirname, '../../dist');

/**
 * Recursively collect all .js files under a directory.
 */
function collectJsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const st = statSync(fullPath);
    if (st.isDirectory()) {
      results.push(...collectJsFiles(fullPath));
    } else if (extname(entry) === '.js') {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Regex to match relative import paths in ESM:
 *   from './something'
 *   from '../something'
 *   from "./something.js"
 *   from '../something.js'
 *
 * We capture the path inside the quotes to check for .js extension.
 */
const importRegex = /from\s+['"](\.{1,2}\/[^'"]+)['"]/g;

describe('dist/ ESM imports', () => {
  it('all relative imports in dist/ must have .js extension (Node.js ESM requirement)', () => {
    const jsFiles = collectJsFiles(distDir);
    expect(jsFiles.length).toBeGreaterThan(0);

    const violations: string[] = [];

    for (const filePath of jsFiles) {
      const content = readFileSync(filePath, 'utf-8');
      let match: RegExpExecArray | null;

      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        // Skip external modules (don't start with .)
        if (!importPath.startsWith('.')) continue;
        // Check if the path ends with .js, .json, .node, or has a query/hash, or is a directory import ending with /
        const hasExtension = /\.(js|json|node|mjs)(\?|#|$)/.test(importPath) || importPath.endsWith('/');
        if (!hasExtension) {
          // Calculate relative path from dist root for cleaner error message
          const relFile = filePath.replace(distDir, '').replace(/^\//, '');
          violations.push(`${relFile}: ${importPath}`);
        }
      }
    }

    if (violations.length > 0) {
      const msg = violations.join('\n');
      expect.fail(
        `Found relative imports without .js extension in dist/ (Node.js ESM requires explicit extensions):\n${msg}\n\n` +
        `Fix: Add '.js' extension to the import in the corresponding src/ .ts file.`,
      );
    }
  });
});
