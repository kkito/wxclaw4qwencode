import { describe, it, expect, vi } from 'vitest';
import { selectProjectByIndex } from '../../src/acp-config/selector.js';

describe('selectProjectByIndex', () => {
  it('returns null for empty root dirs', async () => {
    const result = await selectProjectByIndex([], 1);
    expect(result).toBeNull();
  });

  it('returns correct path for valid index', async () => {
    const mockFs = {
      readdir: vi.fn().mockResolvedValue(['alpha', 'beta']),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    };

    const result = await selectProjectByIndex(['/root'], 2, mockFs);

    expect(result).toEqual({ path: '/root/beta' });
  });

  it('returns null for index out of range', async () => {
    const mockFs = {
      readdir: vi.fn().mockResolvedValue(['only-one']),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    };

    const result = await selectProjectByIndex(['/root'], 5, mockFs);
    expect(result).toBeNull();
  });

  it('returns null for index 0', async () => {
    const mockFs = {
      readdir: vi.fn().mockResolvedValue(['project']),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    };

    const result = await selectProjectByIndex(['/root'], 0, mockFs);
    expect(result).toBeNull();
  });

  it('returns null for negative index', async () => {
    const mockFs = {
      readdir: vi.fn().mockResolvedValue(['project']),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    };

    const result = await selectProjectByIndex(['/root'], -1, mockFs);
    expect(result).toBeNull();
  });
});
