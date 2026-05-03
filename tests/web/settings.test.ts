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
  loadChannelConfig: () => Promise.resolve({
    weixin: { enabled: true },
    wecom: { enabled: false, botId: '', secret: '' },
  }),
  saveChannelConfig: () => Promise.resolve(),
}));

describe('Settings Web Pages', () => {
  let config: WebServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    config = { port: 0 };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /settings', () => {
    it('should render the settings page with current interval', async () => {
      const { app } = createWebServer(config);

      const res = await app.request('/settings');
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain('设置');
      expect(html).toContain('发送消息限流');
      expect(html).toContain('限流间隔');
      expect(html).toContain('5000');
      expect(html).toContain('type="number"');
    });

    it('should include ACP mode card with link', async () => {
      const { app } = createWebServer(config);

      const res = await app.request('/settings');
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain('ACP 模式');
      expect(html).toContain('/settings/acp-dirs');
      expect(html).toContain('配置 ACP 目录');
    });

    it('should have proper HTML structure', async () => {
      const { app } = createWebServer(config);

      const res = await app.request('/settings');
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain('<html lang="zh-CN">');
      expect(html).toContain('<meta charset="utf-8"');
      expect(html).toContain('</html>');
    });
  });

  describe('POST /settings', () => {
    it('should save interval and redirect', async () => {
      const writeSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const { app } = createWebServer(config);

      const formData = new FormData();
      formData.append('intervalMs', '3000');

      const res = await app.request('/settings', {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/settings?saved=1');
    });

    it('should reject invalid interval', async () => {
      const { app } = createWebServer(config);

      const formData = new FormData();
      formData.append('intervalMs', 'not-a-number');

      const res = await app.request('/settings', {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(400);
    });

    it('should reject interval below 100', async () => {
      const { app } = createWebServer(config);

      const formData = new FormData();
      formData.append('intervalMs', '50');

      const res = await app.request('/settings', {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(400);
    });
  });
});
