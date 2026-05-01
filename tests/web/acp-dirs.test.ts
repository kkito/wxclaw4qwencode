import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { createWebServer, WebServerConfig } from '../../src/web/server.js';

vi.mock('node:fs/promises');
vi.mock('../../src/config-store.js', () => ({
  resolveConfigDir: () => '/tmp/test-ownclaw',
  resolveConfigPath: () => '/tmp/test-ownclaw/config.json',
  loadConfig: () => Promise.resolve({ sendThrottleIntervalMs: 5000 }),
  saveConfig: () => Promise.resolve(),
  loadSendThrottleInterval: () => Promise.resolve(5000),
  saveSendThrottleInterval: () => Promise.resolve(),
}));

describe('ACP Dirs Web Pages', () => {
  let config: WebServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    config = { port: 0 };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /settings/acp-dirs', () => {
    it('should render the ACP dirs page with empty list', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      const { app } = createWebServer(config);

      const res = await app.request('/settings/acp-dirs');
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain('ACP 目录配置');
      expect(html).toContain('根目录列表');
      expect(html).toContain('每行一个');
      // textarea value should be empty when no dirs configured
      const textareaMatch = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/);
      expect(textareaMatch).toBeTruthy();
      expect(textareaMatch![1].trim()).toBe('');
    });

    it('should render the ACP dirs page with existing dirs', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ acpProjectDirs: ['/home/kkito/proj', '/home/kkito/work'] }),
      );
      const { app } = createWebServer(config);

      const res = await app.request('/settings/acp-dirs');
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain('/home/kkito/proj');
      expect(html).toContain('/home/kkito/work');
    });
  });

  describe('POST /settings/acp-dirs', () => {
    it('should save dirs and redirect', async () => {
      const mkdirSpy = vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      const writeSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const { app } = createWebServer(config);

      const formData = new FormData();
      formData.append('dirs', '/home/kkito/proj\n/home/kkito/work');

      const res = await app.request('/settings/acp-dirs', {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/settings/acp-dirs?saved=1');
      expect(writeSpy).toHaveBeenCalled();

      const writtenData = writeSpy.mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenData);
      expect(parsed.acpProjectDirs).toEqual(['/home/kkito/proj', '/home/kkito/work']);
    });

    it('should handle empty input', async () => {
      const mkdirSpy = vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      const writeSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const { app } = createWebServer(config);

      const formData = new FormData();
      formData.append('dirs', '\n\n  \n');

      const res = await app.request('/settings/acp-dirs', {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(302);
      expect(writeSpy).toHaveBeenCalled();

      const writtenData = writeSpy.mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenData);
      expect(parsed.acpProjectDirs).toEqual([]);
    });
  });

  describe('GET /api/acp/dirs', () => {
    it('should return dirs as JSON', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ acpProjectDirs: ['/a', '/b'] }),
      );
      const { app } = createWebServer(config);

      const res = await app.request('/api/acp/dirs');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual({ dirs: ['/a', '/b'] });
    });

    it('should return empty array when no config', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      const { app } = createWebServer(config);

      const res = await app.request('/api/acp/dirs');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual({ dirs: [] });
    });
  });

  describe('PUT /api/acp/dirs', () => {
    it('should update dirs', async () => {
      const mkdirSpy = vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      const writeSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const { app } = createWebServer(config);

      const res = await app.request('/api/acp/dirs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dirs: ['/x', '/y'] }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual({ dirs: ['/x', '/y'] });
      expect(writeSpy).toHaveBeenCalled();
    });

    it('should reject invalid input', async () => {
      const { app } = createWebServer(config);

      const res = await app.request('/api/acp/dirs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dirs: 'not-an-array' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('Settings page has ACP link', () => {
    it('should render link to ACP dirs page', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      const { app } = createWebServer(config);

      const res = await app.request('/settings');
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain('/settings/acp-dirs');
      expect(html).toContain('配置 ACP 目录');
    });
  });
});
