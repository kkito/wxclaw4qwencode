import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SkillsManager } from '../../src/skills/manager.js';
import { createWebServer, WebServerConfig } from '../../src/web/server.js';

describe('Skills Web Pages', () => {
  let testDir: string;
  let skillsManager: SkillsManager;
  let config: WebServerConfig;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `ownclaw-web-skills-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    skillsManager = new SkillsManager({ skillsDir: testDir });
    config = { port: 0, skillsManager };
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('GET /skills', () => {
    it('should render the skills page', async () => {
      const { app } = createWebServer(config);

      const res = await app.request('/skills');
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain('Skills');
      expect(html).toContain('Skills 管理');
    });

    it('should include proper HTML structure', async () => {
      const { app } = createWebServer(config);

      const res = await app.request('/skills');
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain('<html');
      expect(html).toContain('<meta charset="utf-8"');
      expect(html).toContain('</html>');
    });

    it('should include API interaction for skills', async () => {
      const { app } = createWebServer(config);

      const res = await app.request('/skills');
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toMatch(/\/api\/skills/);
    });
  });

  describe('Skills API routes via web server', () => {
    it('should list skills via GET /api/skills', async () => {
      const { app } = createWebServer(config);

      const res = await app.request('/api/skills');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('skills');
      expect(Array.isArray(body.skills)).toBe(true);
    });

    it('should return 400 for missing skillMd on create', async () => {
      const { app } = createWebServer(config);

      const res = await app.request('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'test' }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 404 for unknown skill', async () => {
      const { app } = createWebServer(config);

      const res = await app.request('/api/skills/nonexistent');
      expect(res.status).toBe(404);
    });
  });
});
