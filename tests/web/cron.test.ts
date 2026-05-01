import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CronManager } from '../../src/cron/manager.js';
import { createWebServer, WebServerConfig } from '../../src/web/server.js';

describe('Cron Web Pages', () => {
  let testDir: string;
  let cronManager: CronManager;
  let config: WebServerConfig;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `ownclaw-web-cron-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    cronManager = new CronManager({ stateDir: testDir });
    config = { port: 0, cronManager };
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('GET /cron', () => {
    it('should render the cron page', async () => {
      const { app } = createWebServer(config);

      const res = await app.request('/cron');
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain('Cron');
      expect(html).toContain('Cron 管理');
    });

    it('should include proper HTML structure', async () => {
      const { app } = createWebServer(config);

      const res = await app.request('/cron');
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain('<html');
      expect(html).toContain('<meta charset="utf-8"');
      expect(html).toContain('</html>');
    });

    it('should include API interaction scripts', async () => {
      const { app } = createWebServer(config);

      const res = await app.request('/cron');
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toMatch(/\/api\/cron\/jobs/);
    });
  });

  describe('Cron API routes via web server', () => {
    it('should list jobs via GET /api/cron/jobs', async () => {
      const { app } = createWebServer(config);

      const res = await app.request('/api/cron/jobs');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('jobs');
      expect(Array.isArray(body.jobs)).toBe(true);
    });

    it('should return 404 for unknown job', async () => {
      const { app } = createWebServer(config);

      const res = await app.request('/api/cron/jobs/nonexistent');
      expect(res.status).toBe(404);
    });
  });
});
