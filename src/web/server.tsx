import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import { IndexPage } from './views/index.js';
import { CronPage } from './views/cron.js';
import { CronManager, CreateJobInput, UpdateJobInput } from '../cron/index.js';
import { SkillsManager, CreateSkillInput, UpdateSkillInput } from '../skills/index.js';

export interface WebServerConfig {
  port: number;
  host?: string;
  cronManager?: CronManager;
  skillsManager?: SkillsManager;
}

export function createWebServer(config: WebServerConfig): { app: Hono; server: ServerType } {
  const app = new Hono();

  // 全局请求日志中间件
  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    if (c.req.path !== '/health') {
      console.log(`[HTTP] ${c.req.method} ${c.req.path} - ${c.res.status} (${duration}ms)`);
    }
  });

  // 健康检查端点
  app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // ===== Cron API 路由 =====
  if (config.cronManager) {
    const cron = config.cronManager;

    // GET /api/cron/jobs - 列出所有任务
    app.get('/api/cron/jobs', (c) => {
      const jobs = cron.listJobs();
      return c.json({ jobs });
    });

    // POST /api/cron/jobs - 创建任务
    app.post('/api/cron/jobs', async (c) => {
      try {
        const body = await c.req.json<CreateJobInput>();
        const job = cron.createJob(body);
        return c.json({ job }, 201);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Invalid request';
        return c.json({ error: message }, 400);
      }
    });

    // GET /api/cron/jobs/:id - 获取单个任务
    app.get('/api/cron/jobs/:id', (c) => {
      const job = cron.getJob(c.req.param('id'));
      if (!job) {
        return c.json({ error: 'Job not found' }, 404);
      }
      return c.json({ job });
    });

    // PUT /api/cron/jobs/:id - 更新任务
    app.put('/api/cron/jobs/:id', async (c) => {
      try {
        const body = await c.req.json<UpdateJobInput>();
        const job = cron.updateJob(c.req.param('id'), body);
        return c.json({ job });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Invalid request';
        const isNotFound = error instanceof Error && error.message.includes('not found');
        return c.json({ error: message }, isNotFound ? 404 : 400);
      }
    });

    // DELETE /api/cron/jobs/:id - 删除任务
    app.delete('/api/cron/jobs/:id', (c) => {
      try {
        cron.deleteJob(c.req.param('id'));
        return c.json({ success: true });
      } catch (error: unknown) {
        return c.json({ error: 'Job not found' }, 404);
      }
    });

    // POST /api/cron/jobs/:id/run - 手动触发
    app.post('/api/cron/jobs/:id/run', async (c) => {
      try {
        const result = await cron.runJob(c.req.param('id'));
        return c.json({ result });
      } catch (error: unknown) {
        return c.json({ error: 'Job not found' }, 404);
      }
    });

    // GET /api/cron/jobs/:id/logs - 查看日志
    app.get('/api/cron/jobs/:id/logs', (c) => {
      const logs = cron.getLogs(c.req.param('id'));
      return c.json({ logs });
    });

    // DELETE /api/cron/jobs/:id/logs - 清空日志
    app.delete('/api/cron/jobs/:id/logs', (c) => {
      cron.clearLogs(c.req.param('id'));
      return c.json({ success: true });
    });
  }

  // ===== Skills API 路由 =====
  if (config.skillsManager) {
    const skills = config.skillsManager;

    // GET /api/skills - 列出所有 Skills
    app.get('/api/skills', (c) => {
      const skillList = skills.listSkills();
      return c.json({ skills: skillList });
    });

    // POST /api/skills - 创建 Skill
    app.post('/api/skills', async (c) => {
      try {
        const body = await c.req.json<CreateSkillInput>();
        if (!body.id || !body.skillMd) {
          return c.json({ error: 'id and skillMd are required' }, 400);
        }
        const skill = skills.createSkill(body.id, body.skillMd);
        return c.json({ skill }, 201);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Invalid request';
        return c.json({ error: message }, 400);
      }
    });

    // GET /api/skills/:id - 获取 Skill 详情
    app.get('/api/skills/:id', (c) => {
      const skill = skills.getSkill(c.req.param('id'));
      if (!skill) {
        return c.json({ error: 'Skill not found' }, 404);
      }
      return c.json({ skill });
    });

    // PUT /api/skills/:id - 更新 Skill
    app.put('/api/skills/:id', async (c) => {
      try {
        const body = await c.req.json<UpdateSkillInput>();
        if (!body.skillMd) {
          return c.json({ error: 'skillMd is required' }, 400);
        }
        const skill = skills.updateSkill(c.req.param('id'), body.skillMd);
        return c.json({ skill });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Invalid request';
        const isNotFound = error instanceof Error && error.message.includes('not found');
        return c.json({ error: message }, isNotFound ? 404 : 400);
      }
    });

    // DELETE /api/skills/:id - 删除 Skill
    app.delete('/api/skills/:id', (c) => {
      try {
        skills.deleteSkill(c.req.param('id'));
        return c.json({ success: true });
      } catch (error: unknown) {
        return c.json({ error: 'Skill not found' }, 404);
      }
    });

    // GET /api/skills/:id/files - 列出文件
    app.get('/api/skills/:id/files', (c) => {
      try {
        const files = skills.getSkillFiles(c.req.param('id'));
        return c.json({ files });
      } catch (error: unknown) {
        return c.json({ error: 'Skill not found' }, 404);
      }
    });

    // GET /api/skills/:id/files/:filename - 获取文件内容
    app.get('/api/skills/:id/files/:filename', (c) => {
      try {
        const content = skills.getSkillFile(c.req.param('id'), c.req.param('filename'));
        return c.json({ content });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Not found';
        return c.json({ error: message }, 404);
      }
    });

    // POST /api/skills/:id/files - 上传文件
    app.post('/api/skills/:id/files', async (c) => {
      try {
        const body = await c.req.json<{ filename: string; content: string }>();
        if (!body.filename || body.content === undefined) {
          return c.json({ error: 'filename and content are required' }, 400);
        }
        skills.uploadFile(c.req.param('id'), body.filename, body.content);
        return c.json({ success: true });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Invalid request';
        return c.json({ error: message }, 400);
      }
    });

    // DELETE /api/skills/:id/files/:filename - 删除文件
    app.delete('/api/skills/:id/files/:filename', (c) => {
      try {
        skills.deleteFile(c.req.param('id'), c.req.param('filename'));
        return c.json({ success: true });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Not found';
        return c.json({ error: message }, 404);
      }
    });
  }

  // 首页路由
  app.get('/', (c) => {
    return c.html(<IndexPage title="OwnClaw" version="1.0.0" />);
  });

  // Cron 页面路由
  app.get('/cron', (c) => {
    return c.html(<CronPage />);
  });

  // 启动服务器
  const server = serve({
    fetch: app.fetch,
    port: config.port,
    hostname: config.host || '0.0.0.0',
  });

  return { app, server };
}
