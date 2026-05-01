import { describe, it, expect, vi } from 'vitest';
import { scanProjectDirs, type ScannedDir } from '../../src/acp-config/scanner.js';

describe('scanProjectDirs', () => {
  it('returns empty array for no root dirs', async () => {
    const result = await scanProjectDirs([]);
    expect(result).toEqual([]);
  });

  it('scans and sorts single root with subdirs', async () => {
    const mockFs = {
      readdir: vi.fn().mockResolvedValue(['zebra', 'alpha', 'middle']),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    };

    const result = await scanProjectDirs(['/root'], mockFs);

    expect(result.map((d) => d.name)).toEqual(['alpha', 'middle', 'zebra']);
    expect(result.map((d) => d.index)).toEqual([1, 2, 3]);
    expect(result[0].root).toBe('/root');
    expect(result[0].path).toBe('/root/alpha');
  });

  it('filters out non-directories', async () => {
    const mockFs = {
      readdir: vi.fn().mockResolvedValue(['project-a', 'readme.txt']),
      stat: vi.fn().mockImplementation(async (p: string) => ({
        isDirectory: () => !p.endsWith('.txt'),
      })),
    };

    const result = await scanProjectDirs(['/root'], mockFs);
    expect(result.map((d) => d.name)).toEqual(['project-a']);
  });

  it('handles multiple root dirs', async () => {
    const mockFs = {
      readdir: vi.fn().mockImplementation(async (p: string) => {
        if (p === '/root1') return ['bbb', 'aaa'];
        if (p === '/root2') return ['ccc'];
        return [];
      }),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    };

    const result = await scanProjectDirs(['/root1', '/root2'], mockFs);

    expect(result.map((d) => d.name)).toEqual(['aaa', 'bbb', 'ccc']);
    expect(result[0].root).toBe('/root1');
    expect(result[2].root).toBe('/root2');
  });

  it('skips root dirs that do not exist', async () => {
    const mockFs = {
      readdir: vi.fn().mockRejectedValue(new Error('ENOENT')),
      stat: vi.fn(),
    };

    const result = await scanProjectDirs(['/nonexistent'], mockFs);
    expect(result).toEqual([]);
  });
});
