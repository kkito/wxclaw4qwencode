import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWebServer, WebServerConfig } from '../../src/web/server.js';
import { CronManager } from '../../src/cron/manager.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Cron API Integration', () => {
  let cronManager: CronManager;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `ownclaw-api-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    cronManager = new CronManager({ stateDir: testDir });
    cronManager.initialize();
  });

  afterEach(() => {
    cronManager.shutdown();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  async function createApp() {
    const config: WebServerConfig = { port: 0, cronManager };
    const { app } = createWebServer(config);
    return app;
  }

  it('GET /api/cron/jobs returns empty list', async () => {
    const app = await createApp();
    const res = await app.request('/api/cron/jobs');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toEqual([]);
  });

  it('POST /api/cron/jobs creates a job', async () => {
    const app = await createApp();
    const res = await app.request('/api/cron/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Job',
        cron: '0 2 * * *',
        command: 'echo test',
        enabled: true,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.job.name).toBe('Test Job');
    expect(body.job.id).toBeDefined();
  });

  it('GET /api/cron/jobs/:id returns job', async () => {
    const app = await createApp();

    const createRes = await app.request('/api/cron/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test',
        cron: '0 2 * * *',
        command: 'echo test',
      }),
    });
    const { job } = await createRes.json();

    const res = await app.request(`/api/cron/jobs/${job.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.job.id).toBe(job.id);
  });

  it('DELETE /api/cron/jobs/:id deletes job', async () => {
    const app = await createApp();

    const createRes = await app.request('/api/cron/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'ToDelete',
        cron: '0 2 * * *',
        command: 'echo test',
      }),
    });
    const { job } = await createRes.json();

    const delRes = await app.request(`/api/cron/jobs/${job.id}`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);

    const getRes = await app.request(`/api/cron/jobs/${job.id}`);
    expect(getRes.status).toBe(404);
  });

  it('POST /api/cron/jobs/:id/run executes job', async () => {
    const app = await createApp();

    const createRes = await app.request('/api/cron/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'RunTest',
        cron: '0 2 * * *',
        command: 'echo hello_api',
      }),
    });
    const { job } = await createRes.json();

    const res = await app.request(`/api/cron/jobs/${job.id}/run`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.exitCode).toBe(0);
    expect(body.result.stdout).toContain('hello_api');
  });

  it('GET /api/cron/jobs/:id/logs returns logs after execution', async () => {
    const app = await createApp();

    const createRes = await app.request('/api/cron/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'LogTest',
        cron: '0 2 * * *',
        command: 'echo log_me',
      }),
    });
    const { job } = await createRes.json();

    await app.request(`/api/cron/jobs/${job.id}/run`, { method: 'POST' });

    const res = await app.request(`/api/cron/jobs/${job.id}/logs`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs.length).toBeGreaterThan(0);
    expect(body.logs[0].stdout).toContain('log_me');
  });

  it('GET /cron returns HTML page', async () => {
    const app = await createApp();
    const res = await app.request('/cron');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Cron 任务管理');
    expect(html).toContain('<html');
  });
});
