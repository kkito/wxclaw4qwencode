import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { IndexPage } from './views/index.js';
import { CronPage } from './views/cron.js';
import { SkillsPage } from './views/skills.js';
import { ExecutorPage } from './views/executor.js';
import { WebSocketClientPage } from './views/websocket.js';
import { createSettingsRouter } from './views/settings.js';
import { createAcpDirsRouter } from './views/acp-dirs.js';
import { createModelConfigRouter } from './views/model-config.js';
import { CronManager, CreateJobInput, UpdateJobInput } from '../cron/index.js';
import { SkillsManager, CreateSkillInput, UpdateSkillInput } from '../skills/index.js';
import { ExecutorManager } from '../executor/manager.js';
import { loadAcpProjectDirs, saveAcpProjectDirs } from '../acp-config/store.js';
import { loadChannelConfig, saveChannelConfig, type ChannelConfig, loadModelConfig, saveModelConfig } from '../config-store.js';
import type { AgentRunner } from '../runner/agent-runner.js';

export interface WebServerConfig {
  port: number;
  host?: string;
  cronManager?: CronManager;
  skillsManager?: SkillsManager;
  executorManager?: ExecutorManager;
  agentRunner?: AgentRunner;
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

    // POST /api/skills/install - 从 GitHub 安装 Skills
    app.post('/api/skills/install', async (c) => {
      try {
        const body = await c.req.json<{ repo: string; branch?: string }>();
        if (!body.repo) {
          return c.json({ error: 'repo is required (format: owner/repo)' }, 400);
        }
        const result = await skills.installFromGitHub(body.repo, body.branch);
        return c.json(result, 201);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Invalid request';
        return c.json({ error: message }, 400);
      }
    });
  }

  // ===== ACP Dirs API 路由 =====
  app.get('/api/acp/dirs', async (c) => {
    const dirs = await loadAcpProjectDirs();
    return c.json({ dirs });
  });

  app.put('/api/acp/dirs', async (c) => {
    try {
      const body = await c.req.json<{ dirs: string[] }>();
      if (!Array.isArray(body.dirs)) {
        return c.json({ error: 'dirs must be an array' }, 400);
      }
      await saveAcpProjectDirs(body.dirs);
      return c.json({ dirs: body.dirs });
    } catch (error: unknown) {
      return c.json({ error: 'Invalid request' }, 400);
    }
  });

  // ===== Channel Config API =====
  app.get('/api/settings/channel', async (c) => {
    const channel = await loadChannelConfig();
    return c.json({ channel });
  });

  app.put('/api/settings/channel', async (c) => {
    try {
      const body = await c.req.json<{ channel: ChannelConfig }>();
      await saveChannelConfig(body.channel);
      return c.json({ channel: body.channel });
    } catch (error: unknown) {
      return c.json({ error: 'Invalid request' }, 400);
    }
  });

  // ===== Model Config API =====
  app.get('/api/model/config', async (c) => {
    const model = await loadModelConfig();
    // DO NOT include apiKey in response
    const { apiKey, ...safeConfig } = model;
    return c.json({ config: safeConfig });
  });

  app.put('/api/model/config', async (c) => {
    try {
      const body = await c.req.json<{ baseUrl?: string; apiKey?: string; modelName?: string; sysPrompt?: string }>();
      if (!body.baseUrl) {
        return c.json({ error: 'baseUrl is required' }, 400);
      }
      await saveModelConfig(body);
      // Trigger hot reload if agentRunner is provided
      if (config.agentRunner) {
        await config.agentRunner.updateModelConfig(
          { baseUrl: body.baseUrl, apiKey: body.apiKey, modelName: body.modelName ?? 'gpt-4o' },
          body.sysPrompt,
        );
      }
      const { apiKey, ...safeConfig } = body;
      return c.json({ config: safeConfig });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      return c.json({ error: message }, 500);
    }
  });

  // ===== ACP Dirs Settings Page =====
  app.route('/settings/acp-dirs', createAcpDirsRouter());

  // ===== Executor API =====

  // GET /api/executor/specs?project=xxx - 按 mtime 倒序返回前 5 个 spec 文件
  app.get('/api/executor/specs', async (c) => {
    const project = c.req.query('project');
    if (!project) {
      return c.json({ error: 'project parameter is required' }, 400);
    }

    const specDir = path.join(project, 'docs', 'superpowers', 'specs');
    try {
      const files = fs.readdirSync(specDir);
      const mdFiles = files.filter((f) => f.endsWith('.md'));

      // 获取每个文件的 mtime
      const filesWithMtime = mdFiles.map((f) => {
        const fullPath = path.join(specDir, f);
        const stat = fs.statSync(fullPath);
        return {
          filename: f,
          fullPath: path.join('docs', 'superpowers', 'specs', f),
          mtime: stat.mtimeMs,
        };
      });

      // 按 mtime 倒序，取前 5 个
      const sorted = filesWithMtime.sort((a, b) => b.mtime - a.mtime).slice(0, 5);
      return c.json({ specs: sorted });
    } catch {
      return c.json({ specs: [] });
    }
  });

  // ===== Executor routes =====
  if (config.executorManager) {
    const execMgr = config.executorManager;

    // GET /executor - page
    app.get('/executor', async (c) => {
      const tasks = execMgr.getTasks();
      const configData = execMgr.getStore().loadConfig();
      const projectDirs = await loadAcpProjectDirs();
      const currentTask = tasks.find((t) => t.status === 'running') ?? null;

      // 扫描项目目录下的实际项目
      const projects: string[] = [];
      for (const dir of projectDirs) {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const fullPath = path.join(dir, entry.name);
              // 判断是否为项目目录：包含 package.json 或 .git 或 tsconfig.json
              const hasPackageJson = fs.existsSync(path.join(fullPath, 'package.json'));
              const hasGit = fs.existsSync(path.join(fullPath, '.git'));
              const hasTsConfig = fs.existsSync(path.join(fullPath, 'tsconfig.json'));
              if (hasPackageJson || hasGit || hasTsConfig) {
                projects.push(fullPath);
              }
            }
          }
        } catch {
          // 目录不存在或无法读取，跳过
        }
      }

      return c.html(
        <ExecutorPage
          tasks={tasks}
          config={configData}
          isEnabled={execMgr.isEnabled}
          isExecuting={execMgr.isExecuting}
          currentTask={currentTask}
          projectDirs={projects}
        />,
      );
    });

    // POST /executor/tasks - create
    app.post('/executor/tasks', async (c) => {
      const form = await c.req.formData();
      const projectId = form.get('projectId') as string;
      const specPath = form.get('specPath') as string;
      const initialPrompt = (form.get('initialPrompt') as string) || null;
      const confirmPrompt = (form.get('confirmPrompt') as string) || null;
      const task = execMgr.addTask(projectId, specPath);
      if (initialPrompt || confirmPrompt) {
        execMgr.updateTask(task.id, { initialPrompt, confirmPrompt });
      }
      return c.redirect('/executor');
    });

    // POST /executor/tasks/:id/delete
    app.post('/executor/tasks/:id/delete', async (c) => {
      try {
        execMgr.removeTask(c.req.param('id'));
      } catch {
        // ignore if not found
      }
      return c.redirect('/executor');
    });

    // POST /executor/tasks/:id/requeue
    app.post('/executor/tasks/:id/requeue', async (c) => {
      try {
        execMgr.requeueTask(c.req.param('id'));
      } catch {
        // ignore
      }
      return c.redirect('/executor');
    });

    // POST /executor/start
    app.post('/executor/start', async (c) => {
      // Don't await - start() runs the process queue loop indefinitely
      execMgr.start().catch(console.error);
      return c.redirect('/executor');
    });

    // POST /executor/stop
    app.post('/executor/stop', async (c) => {
      execMgr.stop();
      return c.redirect('/executor');
    });

    // POST /executor/config
    app.post('/executor/config', async (c) => {
      const form = await c.req.formData();
      execMgr.updateConfig({
        defaultInitialPrompt: (form.get('defaultInitialPrompt') as string) || '',
        defaultConfirmPrompt: (form.get('defaultConfirmPrompt') as string) || '',
      });
      return c.redirect('/executor');
    });
  }

  // 首页路由
  app.get('/', (c) => {
    return c.html(<IndexPage title="OwnClaw" version="1.0.0" />);
  });

  // WebSocket 测试页面
  app.get('/ws', (c) => {
    return c.html(<WebSocketClientPage />);
  });

  // Cron 页面路由
  app.get('/cron', (c) => {
    return c.html(<CronPage />);
  });

  // Skills 页面路由
  app.get('/skills', (c) => {
    return c.html(<SkillsPage />);
  });

  // 设置页面路由
  app.route('/settings', createSettingsRouter());

  // 模型配置页面路由
  app.route('/settings/model', createModelConfigRouter());

  // 启动服务器
  const server = serve({
    fetch: app.fetch,
    port: config.port,
    hostname: config.host || '0.0.0.0',
  });

  return { app, server };
}
