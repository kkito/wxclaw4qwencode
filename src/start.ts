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
import { loadConfig, Config } from './config.js';
import { createLogger, LogLevel, Logger } from './logger.js';
import { AgentRunner, createAgentRunner } from './runner/agent-runner.js';

// ============== 微信 API 相关 ==============

interface WeixinAccount {
  token?: string;
  baseUrl?: string;
  userId?: string;
  savedAt?: string;
}

interface WeixinMessage {
  from_user_id: string;
  to_user_id: string;
  item_list: Array<{
    type: number;
    content?: string;
    media_id?: string;
  }>;
  create_time: number;
}

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

async function getUpdates(baseUrl: string, token: string): Promise<WeixinMessage[]> {
  const response = await fetch(`${baseUrl}/ilink/bot/get_updates?bot_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`get_updates failed: ${response.status}`);
  }

  const json = await response.json() as WeixinApiResponse;

  // 检查业务层错误码
  if (json.errcode !== undefined && json.errcode !== 0) {
    const errorMessages: Record<number, string> = {
      [-14]: '会话已过期，请重新绑定: pnpm run bind',
      [-1]: '系统错误',
      [-2]: '参数错误',
    };
    const msg = errorMessages[json.errcode] ?? json.errmsg ?? `未知错误 (${json.errcode})`;
    throw new Error(`Weixin API error: ${json.errcode} - ${msg}`);
  }

  return json.messages || [];
}

async function sendMessage(baseUrl: string, token: string, toUserId: string, text: string): Promise<void> {
  const response = await fetch(`${baseUrl}/ilink/bot/sendmessage?bot_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to_user_id: toUserId,
      msg: {
        message_type: 2,
        item_list: [{ type: 1, content: text }],
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
  
  // 创建 AgentRunner
  let runner: AgentRunner;
  try {
    runner = await createAgentRunner({
      config,
      logger,
      weixin: {
        sendMessage: async (to: string, text: string) => {
          await sendMessage(account.baseUrl!, account.token!, to, text);
        },
      },
    });
  } catch (error) {
    logger.error('创建 AgentRunner 失败:', error);
    process.exit(1);
  }
  
  const bridge = runner.getBridge();
  
  // 消息监控循环
  let running = true;
  let lastEventTime = Date.now();
  
  logger.info('👂 开始监听微信消息...');
  
  const pollMessage = async () => {
    if (!running) return;
    
    try {
      const messages = await getUpdates(account.baseUrl!, account.token!);
      
      if (messages.length > 0) {
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
    } catch (error) {
      const errMsg = String(error);
      // 会话过期错误需要用户重新绑定
      if (errMsg.includes('-14') || errMsg.includes('会话已过期')) {
        logger.error(`❌ ${error}`);
        logger.error('请重新绑定微信: pnpm run bind');
        process.exit(1);
      }
      // 其他错误也直接退出
      logger.error(`获取消息失败: ${error}`);
      process.exit(1);
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