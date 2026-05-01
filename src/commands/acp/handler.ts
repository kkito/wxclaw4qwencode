import * as fs from 'node:fs';
import type { SlashCommandHandler, SlashCommandContext } from '../../slash-command/types.js';
import { loadAcpProjectDirs } from '../../acp-config/store.js';
import { scanProjectDirs } from '../../acp-config/scanner.js';
import { selectProjectByIndex } from '../../acp-config/selector.js';

interface FsDeps {
  existsSync: typeof fs.existsSync;
  statSync: typeof fs.statSync;
}

const defaultFs: FsDeps = {
  existsSync: fs.existsSync.bind(fs),
  statSync: fs.statSync.bind(fs),
};

/** Global sessionManager reference (set by start.ts on init) */
let _globalManager: import('../../acp-session/manager.js').AcpSessionManager | null = null;

export function getGlobalSessionManager() {
  return _globalManager;
}

export function setGlobalSessionManager(mgr: import('../../acp-session/manager.js').AcpSessionManager) {
  _globalManager = mgr;
}

/**
 * Create /acp command handler
 * @param sessionManager - injected for testability
 * @param fsDeps - injected fs functions for testability (ESM compatible)
 */
export default function createAcpHandler(
  sessionManager?: import('../../acp-session/manager.js').AcpSessionManager,
  fsDeps?: FsDeps,
): SlashCommandHandler {
  const { existsSync, statSync } = fsDeps ?? defaultFs;

  return async (args: string, context: SlashCommandContext) => {
    const trimmed = args.trim();

    // Already in ACP mode
    if (sessionManager?.hasActiveSession(context.userId)) {
      await context.sendMessage('⚠️ 您已经在 ACP 模式中，请先发送 exit 退出');
      return { handled: true };
    }

    // === Scan mode: /acp (no args) ===
    if (trimmed === '') {
      await handleScan(context);
      return { handled: true };
    }

    // === Select mode: /acp N ===
    if (/^\d+$/.test(trimmed)) {
      await handleSelect(Number(trimmed), context, sessionManager);
      return { handled: true };
    }

    // === Direct path mode (existing behavior) ===
    await handleDirectPath(trimmed, context, existsSync, statSync, sessionManager);
    return { handled: true };
  };
}

async function handleScan(context: SlashCommandContext): Promise<void> {
  const dirs = await loadAcpProjectDirs();
  if (dirs.length === 0) {
    await context.sendMessage('⚠️ 未配置 ACP 项目目录，请前往后台配置页面添加');
    return;
  }

  const scanned = await scanProjectDirs(dirs);
  if (scanned.length === 0) {
    await context.sendMessage('⚠️ 配置的目录下没有子项目');
    return;
  }

  const lines = scanned.map((d) => `${d.index}. ${d.name} (${d.root})`);
  await context.sendMessage('可选项目：\n' + lines.join('\n') + '\n\n发送 /acp <序号> 进入对应项目');
}

async function handleSelect(
  index: number,
  context: SlashCommandContext,
  sessionManager?: import('../../acp-session/manager.js').AcpSessionManager,
): Promise<void> {
  const dirs = await loadAcpProjectDirs();
  if (dirs.length === 0) {
    await context.sendMessage('⚠️ 未配置 ACP 项目目录');
    return;
  }

  const selected = await selectProjectByIndex(dirs, index);
  if (!selected) {
    await context.sendMessage(`❌ 序号 ${index} 无效或目录不存在`);
    return;
  }

  const mgr = sessionManager || getGlobalSessionManager();
  if (!mgr) {
    await context.sendMessage('❌ ACP 功能未初始化');
    return;
  }

  await mgr.createSession(context.userId, selected.path, context.sendMessage);
}

async function handleDirectPath(
  path: string,
  context: SlashCommandContext,
  existsSync: typeof fs.existsSync,
  statSync: typeof fs.statSync,
  sessionManager?: import('../../acp-session/manager.js').AcpSessionManager,
): Promise<void> {
  if (!existsSync(path)) {
    await context.sendMessage(`❌ 路径不存在: ${path}`);
    return;
  }

  if (!statSync(path).isDirectory()) {
    await context.sendMessage(`❌ 不是目录: ${path}`);
    return;
  }

  const mgr = sessionManager || getGlobalSessionManager();
  if (!mgr) {
    await context.sendMessage('❌ ACP 功能未初始化');
    return;
  }

  await mgr.createSession(context.userId, path, context.sendMessage);
}
