import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { loadAcpProjectDirs, saveAcpProjectDirs } from '../../src/acp-config/store.js';

vi.mock('node:fs/promises');
vi.mock('../../src/config-store.js', () => ({
  resolveConfigDir: () => '/tmp/test-ownclaw',
  resolveConfigPath: () => '/tmp/test-ownclaw/config.json',
}));

describe('acp-config store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array when config file does not exist', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
    const dirs = await loadAcpProjectDirs();
    expect(dirs).toEqual([]);
  });

  it('returns empty array when JSON parse fails', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('not json');
    const dirs = await loadAcpProjectDirs();
    expect(dirs).toEqual([]);
  });

  it('returns acpProjectDirs from valid config', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({ acpProjectDirs: ['/a', '/b'] }),
    );
    const dirs = await loadAcpProjectDirs();
    expect(dirs).toEqual(['/a', '/b']);
  });

  it('saves acpProjectDirs to config.json', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
    const mkdirSpy = vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    const writeSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await saveAcpProjectDirs(['/x', '/y']);

    expect(mkdirSpy).toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(
      '/tmp/test-ownclaw/config.json',
      JSON.stringify({ acpProjectDirs: ['/x', '/y'] }, null, 2),
      'utf-8',
    );
  });

  it('preserves other config fields when saving acpProjectDirs', async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      JSON.stringify({ sendThrottleIntervalMs: 3000 }),
    );
    const writeSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await saveAcpProjectDirs(['/proj1']);

    expect(writeSpy).toHaveBeenCalledWith(
      '/tmp/test-ownclaw/config.json',
      JSON.stringify(
        { sendThrottleIntervalMs: 3000, acpProjectDirs: ['/proj1'] },
        null,
        2,
      ),
      'utf-8',
    );
  });
});
