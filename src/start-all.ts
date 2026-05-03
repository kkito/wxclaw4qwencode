#!/usr/bin/env node

/**
 * OwnClaw 统一启动脚本
 *
 * 同时启动微信服务和 Web 服务，所有日志统一输出。
 *
 * 用法：
 *   pnpm run build
 *   pnpm start:all              # 前台运行（日志直接输出）
 *   pnpm start:all -- --detach  # 后台运行
 */

import { parseArgs } from 'util';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChannelConfig } from './config-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname);

// 颜色前缀（终端输出区分）
const WX_PREFIX = '\x1b[32m[WeChat]\x1b[0m ';   // 绿色
const WEB_PREFIX = '\x1b[36m[Web]   \x1b[0m ';   // 青色
const WECOM_PREFIX = '\x1b[35m[WeCom] \x1b[0m '; // 紫色

function prefixStream(prefix: string, stream: NodeJS.ReadableStream | null): void {
  if (!stream) return;
  stream.on('data', (chunk: Buffer) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (line.trim() === '') continue;
      process.stdout.write(`${prefix}${line}\n`);
    }
  });
}

function startAll(): void {
  const nodePath = process.execPath;
  const weixinScript = path.join(distDir, 'start.js');
  const webScript = path.join(distDir, 'start-web.js');
  const wecomScript = path.join(distDir, 'start-wecom.js');

  console.log('\n🚀 正在启动 OwnClaw（微信 + Web）...\n');

  const processes: ChildProcess[] = [];

  // 启动微信服务
  const weixinProc = spawn(nodePath, [weixinScript], {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
  });
  processes.push(weixinProc);

  // 启动 Web 服务
  const webProc = spawn(nodePath, [webScript], {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
  });
  processes.push(webProc);

  // 统一日志输出
  prefixStream(WX_PREFIX, weixinProc.stdout);
  prefixStream(WX_PREFIX, weixinProc.stderr);
  prefixStream(WEB_PREFIX, webProc.stdout);
  prefixStream(WEB_PREFIX, webProc.stderr);

  // 启动企业微信（如果已启用）
  let wecomProc: ChildProcess | null = null;
  loadChannelConfig().then((channelConfig) => {
    if (channelConfig.wecom?.enabled && channelConfig.wecom.botId && channelConfig.wecom.secret) {
      console.log('🤖 企业微信通道已启用，正在启动...\n');
      wecomProc = spawn(nodePath, [wecomScript], {
        stdio: ['inherit', 'pipe', 'pipe'],
        env: process.env,
      });
      processes.push(wecomProc);
      prefixStream(WECOM_PREFIX, wecomProc.stdout);
      prefixStream(WECOM_PREFIX, wecomProc.stderr);

      wecomProc.on('exit', (code) => {
        if (!shuttingDown) {
          shutdownAll('SIGTERM', code, '企业微信服务');
        }
      });
    }
  }).catch((err) => {
    console.error('加载企业微信配置失败:', err);
  });

  // 任一子进程退出时，关闭所有进程
  let shuttingDown = false;
  const shutdownAll = (signal: string, exitCode: number | null, fromProcess: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\n${fromProcess} 已退出 (code: ${exitCode})，正在关闭所有进程...`);
    for (const proc of processes) {
      try {
        proc.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
    setTimeout(() => process.exit(exitCode ?? 1), 2000);
  };

  weixinProc.on('exit', (code) => shutdownAll('SIGTERM', code, '微信服务'));
  webProc.on('exit', (code) => shutdownAll('SIGTERM', code, 'Web 服务'));

  // 处理父进程的 SIGINT / SIGTERM，传递给子进程
  const gracefulShutdown = (signal: string) => {
    console.log(`\n收到 ${signal}，正在关闭所有进程...`);
    for (const proc of processes) {
      try {
        proc.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
    setTimeout(() => process.exit(0), 2000);
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

function startDetached(): void {
  const nodePath = process.execPath;
  const scriptPath = path.resolve(process.cwd(), 'dist/start-all.js');

  const child = spawn(nodePath, [scriptPath], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
    env: process.env,
  });

  child.unref();

  console.log(`\n✅ OwnClaw 后台进程已启动 (PID: ${child.pid})\n`);
  console.log('微信和 Web 服务已在后台运行');
  console.log('Web 界面: http://localhost:3525');
  console.log('查看日志: tail -f <日志路径>\n');
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
    startAll();
  }
}

main().catch((error) => {
  console.error('启动失败:', error);
  process.exit(1);
});
