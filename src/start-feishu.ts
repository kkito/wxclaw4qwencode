#!/usr/bin/env node

/**
 * OwnClaw 飞书通道启动脚本
 *
 * 环境变量：
 *   AGENT_MODEL_BASE_URL  - 必需，模型 API 地址
 *   AGENT_MODEL_API_KEY   - 可选，API Key
 *   AGENT_MODEL_NAME      - 可选，模型名称，默认 gpt-4o
 *   AGENT_SYS_PROMPT      - 可选，系统提示词
 *   AGENT_LOG_LEVEL       - 可选，日志级别，默认 info
 *
 * 配置：
 *   ~/.ownclaw/config.json → channel.feishu.appId / appSecret
 *
 * 用法：
 *   pnpm run build
 *   node dist/start-feishu.js
 */

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, Config } from './config.js';
import { createLogger, LogLevel, Logger } from './logger.js';
import { CustomModel } from './model/custom-model.js';
import { Agent } from '@agentscope-ai/agentscope/agent';
import { Toolkit } from '@agentscope-ai/agentscope/tool';
import { SkillsManager } from './skills/index.js';
import { SlashCommandLoader, SlashCommandRegistry } from './slash-command/index.js';
import { AcpSessionManager } from './acp-session/index.js';
import { setGlobalSessionManager } from './commands/acp/handler.js';
import createAcpHandler from './commands/acp/handler.js';
import createStreamingHandler from './commands/streaming/handler.js';
import { FeishuBridge } from './channel/feishu-bridge.js';
import { isFeishuEnabled, loadChannelConfig } from './config-store.js';

// ESM __dirname polyfill
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveStateDir(): string {
  const envPath = process.env.OWNCLAW_STATE_DIR?.trim();
  if (envPath) return path.resolve(envPath);
  return path.join(os.homedir(), '.ownclaw');
}

// ============== 环境变量检查 ==============

function checkRequiredEnvVars(): void {
  const required = ['AGENT_MODEL_BASE_URL', 'AGENT_MODEL_API_KEY', 'AGENT_MODEL_NAME'];
  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error(`\n❌ 错误: 缺少必需的环境变量: ${missing.join(', ')}\n`);
    process.exit(1);
  }
}

// ============== 主逻辑 ==============

async function startFeishu(): Promise<void> {
  checkRequiredEnvVars();

  // 加载配置
  let config: Config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error('配置加载失败:', error);
    process.exit(1);
  }

  // 读取飞书配置
  const channelConfig = await loadChannelConfig();
  const feishuConfig = channelConfig.feishu;
  if (!feishuConfig?.enabled || !feishuConfig.appId || !feishuConfig.appSecret) {
    console.error('飞书通道未启用或缺少配置');
    process.exit(1);
  }

  const logger: Logger = createLogger({
    level: config.log.level,
    prefix: '[Feishu] ',
  });

  logger.info('🚀 正在启动飞书通道...');
  logger.info(`📡 模型: ${config.agentscope.model.modelName}`);
  logger.info(`🤖 App ID: ${feishuConfig.appId}`);

  // === 斜杠命令 + ACP 初始化 ===
  const slashRegistry = new SlashCommandRegistry();
  const stateDir = resolveStateDir();
  const commandsDir = path.join(stateDir, 'commands');

  // 初始化内置命令
  const builtinCommands = [
    {
      name: 'echo',
      description: '回显消息，直接返回 /echo 前面的内容',
      usage: '/echo <内容>',
      handler: 'async (args, ctx) => { await ctx.sendMessage(args || "用法: /echo <内容>"); return { handled: true }; }',
    },
  ];

  for (const cmd of builtinCommands) {
    const cmdDir = path.join(commandsDir, cmd.name);
    const manifestPath = path.join(cmdDir, 'COMMAND.md');
    const handlerPath = path.join(cmdDir, 'handler.js');

    if (!fs.existsSync(cmdDir)) {
      fs.mkdirSync(cmdDir, { recursive: true });
    }

    if (!fs.existsSync(manifestPath)) {
      const manifest = `---
name: ${cmd.name}
description: ${cmd.description}
usage: ${cmd.usage}
handler: ./handler.js
---
`;
      fs.writeFileSync(manifestPath, manifest);
    }

    if (!fs.existsSync(handlerPath)) {
      const handlerCode = `export default ${cmd.handler};\n`;
      fs.writeFileSync(handlerPath, handlerCode);
    }
  }

  const slashLoader = new SlashCommandLoader(commandsDir);
  await slashLoader.loadCommands(slashRegistry);

  // ACP 管理器（与微信共享）
  const acpManager = new AcpSessionManager();
  setGlobalSessionManager(acpManager);
  slashRegistry.register('acp', {
    name: 'acp',
    description: '进入 ACP (Agent Client Protocol) 模式',
    usage: '/acp <项目路径>',
    handler: createAcpHandler(acpManager),
    dirPath: path.join(__dirname, 'commands', 'acp'),
  });

  if (slashRegistry.listNames().length > 0) {
    logger.info(`📢 Slash Commands: ${slashRegistry.listNames().join(', ')} 已加载`);
  }

  // 创建 Agent（独立实例，与微信隔离）
  const model = new CustomModel({
    baseUrl: config.agentscope.model.baseUrl,
    apiKey: config.agentscope.model.apiKey,
    modelName: config.agentscope.model.modelName,
  });

  const skillsManager = new SkillsManager();
  const toolkit = skillsManager.createToolkit();

  const agent = new Agent({
    name: 'feishu-assistant',
    sysPrompt: config.agentscope.sysPrompt,
    model,
    toolkit,
    maxIters: 10,
  });

  // 创建飞书 Bridge
  const bridge = new FeishuBridge({
    appId: feishuConfig.appId,
    appSecret: feishuConfig.appSecret,
    agent,
    logger,
    slashRegistry,
    acpManager,
  });

  // 启动 Bridge
  try {
    await bridge.start();
  } catch (error) {
    logger.error('飞书 Bridge 启动失败:', error);
    process.exit(1);
  }

  // 定时检查 ACP 超时
  const acpTimeoutCheck = setInterval(() =>
    acpManager.checkTimeouts(async (_userId, _msg) => {
      // 飞书超时通知通过 bridge 发送
    }),
    60000,
  );

  logger.info('✅ 飞书通道已就绪');

  // 优雅退出
  const shutdown = async (signal: string) => {
    logger.info(`收到 ${signal}，正在关闭...`);
    clearInterval(acpTimeoutCheck);
    await bridge.stop();
    logger.info('👋 飞书通道已退出');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// ============== 入口 ==============

startFeishu().catch((error) => {
  console.error('启动失败:', error);
  process.exit(1);
});
