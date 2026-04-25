import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWebServer, WebServerConfig } from '../../src/web/server.js';

describe('Web Server', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('createWebServer', () => {
    it('should create server with default host', () => {
      const config: WebServerConfig = { port: 0 };
      const { app, server } = createWebServer(config);

      expect(app).toBeDefined();
      expect(server).toBeDefined();
      expect(typeof app.fetch).toBe('function');

      server.close();
    });

    it('should create server with custom host', () => {
      const config: WebServerConfig = { port: 0, host: '127.0.0.1' };
      const { app, server } = createWebServer(config);

      expect(app).toBeDefined();
      expect(server).toBeDefined();

      server.close();
    });
  });

  describe('routes', () => {
    it('should return health check response', async () => {
      const config: WebServerConfig = { port: 0 };
      const { app } = createWebServer(config);

      const res = await app.request('/health');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('status', 'ok');
      expect(body).toHaveProperty('timestamp');
    });

    it('should return HTML for index page', async () => {
      const config: WebServerConfig = { port: 0 };
      const { app } = createWebServer(config);

      const res = await app.request('/');
      expect(res.status).toBe(200);

      const contentType = res.headers.get('content-type');
      expect(contentType).toContain('text/html');

      const html = await res.text();
      expect(html).toContain('<html');
      expect(html).toContain('OwnClaw');
      expect(html).toContain('v1.0.0');
    });

    it('should return 404 for unknown routes', async () => {
      const config: WebServerConfig = { port: 0 };
      const { app } = createWebServer(config);

      const res = await app.request('/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('middleware', () => {
    it('should log requests for non-health routes', async () => {
      const config: WebServerConfig = { port: 0 };
      const { app } = createWebServer(config);

      await app.request('/');

      expect(consoleLogSpy).toHaveBeenCalled();
      const logCall = consoleLogSpy.mock.calls[0][0];
      expect(logCall).toContain('[HTTP]');
      expect(logCall).toContain('GET');
      expect(logCall).toContain('/');
    });

    it('should not log health check requests', async () => {
      const config: WebServerConfig = { port: 0 };
      const { app } = createWebServer(config);

      consoleLogSpy.mockClear();
      await app.request('/health');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });
});
