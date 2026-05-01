#!/usr/bin/env node

/**
 * OwnClaw 启动脚本
 *
 * 环境变量：
 *   AGENT_MODEL_BASE_URL  - 必需，模型 API 地址
 *   AGENT_MODEL_API_KEY   - 可选，API Key
 *   AGENT_MODEL_NAME      - 可选，模型名称，默认 gpt-4o
 *   AGENT_SYS_PROMPT      - 可选，系统提示词
 *   AGENT_LOG_LEVEL       - 可选，日志级别，默认 info
 *
 * 用法：
 *   pnpm run build
 *   pnpm start              # 前台运行
 *   pnpm start -- --detach  # 后台运行
 */

import { parseArgs } from 'util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig, Config } from './config.js';
import { createLogger, LogLevel, Logger } from './logger.js';
import { AgentRunner, createAgentRunner } from './runner/agent-runner.js';
import { withRetry } from './utils/retry.js';
import { SkillsManager } from './skills/index.js';
import { SlashCommandLoader, SlashCommandRegistry } from './slash-command/index.js';
import { AcpSessionManager } from './acp-session/index.js';
import { setGlobalSessionManager } from './commands/acp/handler.js';
import createAcpHandler from './commands/acp/handler.js';
import createStreamingHandler from './commands/streaming/handler.js';
import { createSendThrottle } from './utils/send-throttle.js';
import { loadSendThrottleInterval } from './config-store.js';

// ESM __dirname polyfill
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============== 微信 API 相关 ==============

interface WeixinAccount {
  token?: string;
  baseUrl?: string;
  userId?: string;
  savedAt?: string;
}

// 使用 any 避免与官方库类型冲突
type WeixinMessage = any;
type GetUpdatesResp = any;

function resolveStateDir(): string {
  const envPath = process.env.OWNCLAW_STATE_DIR?.trim();
  if (envPath) return path.resolve(envPath);
  return path.join(os.homedir(), '.ownclaw');
}

function loadWeixinAccount(): WeixinAccount | null {
  const stateDir = resolveStateDir();
  const indexPath = `${stateDir}/openclaw-weixin/accounts.json`;
  
  let accountIds: string[] = [];
  try {
    accountIds = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  } catch {
    console.error('未找到绑定账户，请先运行: pnpm run bind');
    return null;
  }
  
  if (accountIds.length === 0) {
    console.error('未找到绑定账户，请先运行: pnpm run bind');
    return null;
  }
  
  // 加载第一个账户
  const accountId = accountIds[0];
  const accountPath = `${stateDir}/openclaw-weixin/accounts/${accountId}.json`;
  
  try {
    return JSON.parse(fs.readFileSync(accountPath, 'utf-8'));
  } catch {
    console.error('无法加载账户信息，请重新绑定: pnpm run bind');
    return null;
  }
}

interface WeixinApiResponse {
  errcode?: number;
  errmsg?: string;
  messages?: WeixinMessage[];
}

// 手动实现 API 调用，使用官方库相同的 headers
async function getUpdatesLib(baseUrl: string, token: string, getUpdatesBuf: string = ''): Promise<{ messages: WeixinMessage[]; buf: string }> {
  const url = `${baseUrl}/ilink/bot/getupdates`;
  const requestBody = JSON.stringify({
    get_updates_buf: getUpdatesBuf,
  });

  const headers = {
    'Content-Type': 'application/json',
    'AuthorizationType': 'ilink_bot_token',
    'Authorization': `Bearer ${token}`,
    'X-WECHAT-UIN': String(Math.floor(Math.random() * 0xffffffff)),
    'iLink-App-Id': '',
    'iLink-App-ClientVersion': '65536',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: requestBody,
    signal: AbortSignal.timeout(35000),
  });

  if (!response.ok) {
    throw new Error(`getupdates failed: ${response.status}`);
  }

  const resp = await response.json() as any;

  if (resp.errcode !== undefined && resp.errcode !== 0) {
    const errorMessages: Record<number, string> = {
      [-14]: '会话已过期，请重新绑定: pnpm run bind',
      [-1]: '系统错误',
      [-2]: '参数错误',
    };
    const msg = errorMessages[resp.errcode] ?? resp.errmsg ?? `未知错误 (${resp.errcode})`;
    throw new Error(`Weixin API error: ${resp.errcode} - ${msg}`);
  }

  return {
    messages: resp.msgs || [],
    buf: resp.get_updates_buf || '',
  };
}

async function sendMessageLib(baseUrl: string, token: string, toUserId: string, text: string): Promise<void> {
  const headers = {
    'Content-Type': 'application/json',
    'AuthorizationType': 'ilink_bot_token',
    'Authorization': `Bearer ${token}`,
    'X-WECHAT-UIN': String(Math.floor(Math.random() * 0xffffffff)),
    'iLink-App-Id': '',
    'iLink-App-ClientVersion': '65536',
  };

  const response = await fetch(`${baseUrl}/ilink/bot/sendmessage`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      msg: {
        from_user_id: '',
        to_user_id: toUserId,
        client_id: `ownclaw-${Date.now()}`,
        message_type: 2,
        message_state: 2,
        item_list: [{ type: 1, text_item: { text } }],
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`sendmessage failed: ${response.status}`);
  }
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
    console.error('请设置以下环境变量:');
    console.error('  AGENT_MODEL_BASE_URL  模型 API 地址 (如 https://api.openai.com/v1)');
    console.error('  AGENT_MODEL_API_KEY   API Key');
    console.error('  AGENT_MODEL_NAME      模型名称 (如 gpt-4o)');
    console.error('  AGENT_SYS_PROMPT      系统提示词 (可选，默认 你是一个友好的 AI 助手。)');
    console.error('');
    console.error('示例:');
    console.error('  export AGENT_MODEL_BASE_URL=https://api.openai.com/v1');
    console.error('  export AGENT_MODEL_API_KEY=sk-xxx');
    console.error('  export AGENT_MODEL_NAME=gpt-4o\n');
    process.exit(1);
  }
  
  console.log('✓ 环境变量检查通过');
}

// ============== 主逻辑 ==============

async function startMain(): Promise<void> {
  // 检查环境变量
  checkRequiredEnvVars();
  
  // 加载配置
  let config: Config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error('配置加载失败:', error);
    process.exit(1);
  }
  
  // 加载微信账户
  const account = loadWeixinAccount();
  if (!account || !account.token || !account.baseUrl) {
    console.error('微信未绑定，请先运行: pnpm run bind');
    process.exit(1);
  }
  
  // 创建日志器
  const logger: Logger = createLogger({
    level: config.log.level,
    prefix: '[OwnClaw] ',
  });
  
  logger.info('🚀 正在启动 OwnClaw...');
  logger.info(`📡 模型: ${config.agentscope.model.modelName}`);
  logger.info(`🌐 API: ${config.agentscope.model.baseUrl}`);
  logger.info(`👤 微信: ${account.userId || account.token.substring(0, 10)}...`);

  // 创建 SkillsManager
  const skillsManager = new SkillsManager();
  const skillsCount = skillsManager.listSkills().length;
  if (skillsCount > 0) {
    logger.info(`🎯 Skills: ${skillsCount} 个已加载`);
  }

  // === 斜杠命令 + ACP 初始化 ===
  const slashRegistry = new SlashCommandRegistry();
  const stateDir = resolveStateDir();
  const commandsDir = path.join(stateDir, 'commands');

  // 初始化内置命令
  const builtinCommands = [
    {
      name: 'echo',
      description: '回显消息，直接返回 /echo 后面的内容',
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
      // 创建简单的 handler 文件
      const handlerCode = `export default ${cmd.handler};\n`;
      fs.writeFileSync(handlerPath, handlerCode);
    }

    logger.info(`📦 初始化内置命令: ${cmd.name}`);
  }

  const slashLoader = new SlashCommandLoader(commandsDir);
  await slashLoader.loadCommands(slashRegistry);

  // 手动注册 /acp 命令（需要注入 sessionManager）
  const acpManager = new AcpSessionManager();
  setGlobalSessionManager(acpManager);
  slashRegistry.register('acp', {
    name: 'acp',
    description: '进入 ACP (Agent Client Protocol) 模式',
    usage: '/acp <项目路径>',
    handler: createAcpHandler(acpManager),
    dirPath: path.join(__dirname, 'commands', 'acp'),
  });

  // 手动注册 /streaming 命令（流式发送 demo）
  if (account.baseUrl && account.token) {
    slashRegistry.register('streaming', {
      name: 'streaming',
      description: '流式发送 Demo，演示 message_state 的 GENERATING → FINISH 流程',
      usage: '/streaming',
      handler: createStreamingHandler({ baseUrl: account.baseUrl, token: account.token }),
      dirPath: path.join(__dirname, 'commands', 'streaming'),
    });
  }

  if (slashRegistry.listNames().length > 0) {
    logger.info(`📢 Slash Commands: ${slashRegistry.listNames().join(', ')} 已加载`);
  }

  // 定时检查 ACP 超时（每分钟），超时后发消息通知用户
  const acpTimeoutCheck = setInterval(() =>
    acpManager.checkTimeouts(async (userId, msg) => {
      await sendMessageLib(account.baseUrl!, account.token!, userId, msg);
    }),
    60000,
  );

  // 初始化消息发送节流器
  const throttleInterval = await loadSendThrottleInterval();
  const throttle = createSendThrottle(
    async (to: string, text: string) => {
      await sendMessageLib(account.baseUrl!, account.token!, to, text);
    },
    throttleInterval,
  );

  // 创建 AgentRunner
  let runner: AgentRunner;
  try {
    runner = await createAgentRunner({
      config,
      logger,
      weixin: {
        sendMessage: async (to: string, text: string) => {
          await throttle.enqueue(to, text);
        },
      },
      skillsManager,
      slashRegistry,
      acpManager,
    });
  } catch (error) {
    logger.error('创建 AgentRunner 失败:', error);
    process.exit(1);
  }
  
  const bridge = runner.getBridge();

  // 消息监控循环
  let running = true;
  let lastEventTime = Date.now();
  let getUpdatesBuf = '';

  logger.info('👂 开始监听微信消息...');

  const pollMessage = async () => {
    if (!running) return;

    const result = await withRetry(
      async () => {
        return await getUpdatesLib(account.baseUrl!, account.token!, getUpdatesBuf);
      },
      {
        timeout: 35000,
        initialRetries: 3,
        initialInterval: 30000,
        waitTimes: [60000, 120000, 180000],
        constantWait: 300000,
        maxTotalTime: 1800000,
        onRetry: (attempt, error, waitTime) => {
          const mins = Math.floor(waitTime / 60000);
          logger.warn(`获取消息失败 (第 ${attempt} 次)，${mins} 分钟后重试: ${error.message}`);
        },
        shouldRetry: (error, _attempt) => {
          // 会话过期错误不重试，需要用户重新绑定
          const errMsg = String(error);
          if (errMsg.includes('-14') || errMsg.includes('会话已过期')) {
            return false;
          }
          return true;
        },
      }
    );

    if (!result.success) {
      logger.error(`获取消息失败: ${result.error?.message}`);
      logger.error(`已重试 ${result.attempts} 次，总耗时 ${Math.floor(result.totalTime / 1000)}s`);
      logger.error('请检查网络连接后重试运行');
      process.exit(1);
    }

    const { messages, buf } = result.data!;
    getUpdatesBuf = buf;

    if (messages && messages.length > 0) {
      lastEventTime = Date.now();
      logger.debug(`收到 ${messages.length} 条消息`);

      for (const msg of messages) {
        try {
          await bridge.handleMessage(msg);
        } catch (error) {
          logger.error('处理消息失败:', error);
        }
      }
    }

    // 5 秒后继续轮询
    if (running) {
      setTimeout(pollMessage, 5000);
    }
  };

  // 启动轮询
  pollMessage();
  
  // 定期心跳日志
  const heartbeat = setInterval(() => {
    if (running) {
      logger.debug(`❤️ 心跳 (${Math.floor((Date.now() - lastEventTime) / 1000)}s 无新消息)`);
    }
  }, 60000);
  
  // 优雅退出
  const shutdown = async (signal: string) => {
    logger.info(`收到 ${signal}，正在关闭...`);
    running = false;
    clearInterval(heartbeat);
    clearInterval(acpTimeoutCheck);
    await throttle.flush();
    await runner.stop();
    logger.info('👋 已退出');
    process.exit(0);
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// ============== 后台运行 ==============

function startDetached(): void {
  const nodePath = process.execPath;
  const scriptPath = path.resolve(process.cwd(), 'dist/start.js');
  
  // 分离进程
  const child = spawn(nodePath, [scriptPath], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
    env: process.env,
  });
  
  child.unref();
  
  console.log(`\n✅ 后台进程已启动 (PID: ${child.pid})\n`);
  process.exit(0);
}

// ============== 入口 ==============

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
    await startMain();
  }
}

main().catch((error) => {
  console.error('启动失败:', error);
  process.exit(1);
});