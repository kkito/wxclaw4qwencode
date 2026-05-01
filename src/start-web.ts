#!/usr/bin/env node

import { parseArgs } from 'util';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createWebServer, WebServerConfig } from './web/index.js';
import { CronManager } from './cron/index.js';
import { SkillsManager } from './skills/index.js';
import { ExecutorManager } from './executor/index.js';

function resolveWebConfig(): WebServerConfig {
  return {
    port: parseInt(process.env.OWNCLAW_WEB_PORT || '3525', 10),
    host: process.env.OWNCLAW_WEB_HOST || '0.0.0.0',
  };
}

function startWebMain(): void {
  const config = resolveWebConfig();

  // 初始化 CronManager
  const cronManager = new CronManager();
  cronManager.initialize();

  // 初始化 SkillsManager
  const skillsManager = new SkillsManager();

  // 初始化 ExecutorManager
  const executorManager = new ExecutorManager();
  executorManager.start().catch(console.error);

  const skillsCount = skillsManager.listSkills().length;

  console.log(`\n🚀 正在启动 OwnClaw Web 服务器...`);
  console.log(`🌐 地址: http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
  console.log(`📡 端口: ${config.port}`);
  console.log(`🕐 Cron 任务: ${cronManager.scheduledCount} 个已调度`);
  console.log(`🎯 Skills: ${skillsCount} 个已加载`);
  console.log(`📂 Skills 目录: ~/.ownclaw/skills/`);
  console.log(`🔧 Executor: 已启动\n`);

  const { app, server } = createWebServer({ ...config, cronManager, skillsManager, executorManager });

  const shutdown = (signal: string) => {
    console.log(`\n收到 ${signal}，正在关闭...`);
    cronManager.shutdown();
    executorManager.stop();
    server.close(() => {
      console.log('👋 已关闭');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

function startDetached(): void {
  const nodePath = process.execPath;
  const scriptPath = path.resolve(process.cwd(), 'dist/start-web.js');

  const child = spawn(nodePath, [scriptPath], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
    env: process.env,
  });

  child.unref();

  console.log(`\n✅ Web 后台进程已启动 (PID: ${child.pid})\n`);
  process.exit(0);
}

async function main() {
  const { values } = parseArgs({
    options: {
      detach: {
        type: 'boolean',
        default: false,
        short: 'd',
      },
    },
  });

  if (values.detach) {
    startDetached();
  } else {
    startWebMain();
  }
}

main().catch((error) => {
  console.error('Web 启动失败:', error);
  process.exit(1);
});
