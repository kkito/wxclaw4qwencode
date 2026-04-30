import * as fs from 'node:fs';
import type { SlashCommandHandler, SlashCommandContext } from '../../slash-command/types.js';

interface FsDeps {
  existsSync: typeof fs.existsSync;
  statSync: typeof fs.statSync;
}

const defaultFs: FsDeps = {
  existsSync: fs.existsSync.bind(fs),
  statSync: fs.statSync.bind(fs),
};

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

    // No path provided
    if (!trimmed) {
      await context.sendMessage('请提供项目路径，例如：\n/acp /home/kkito/proj/myapp');
      return { handled: true };
    }

    // Path doesn't exist
    if (!existsSync(trimmed)) {
      await context.sendMessage(`❌ 路径不存在: ${trimmed}`);
      return { handled: true };
    }

    // Not a directory
    if (!statSync(trimmed).isDirectory()) {
      await context.sendMessage(`❌ 不是目录: ${trimmed}`);
      return { handled: true };
    }

    // Get or create sessionManager
    const mgr = sessionManager || getGlobalSessionManager();
    if (!mgr) {
      await context.sendMessage('❌ ACP 功能未初始化');
      return { handled: true };
    }

    await mgr.createSession(context.userId, trimmed, context.sendMessage);
    return { handled: true };
  };
}

/** Global sessionManager reference (set by start.ts on init) */
let _globalManager: import('../../acp-session/manager.js').AcpSessionManager | null = null;

export function getGlobalSessionManager() {
  return _globalManager;
}

export function setGlobalSessionManager(mgr: import('../../acp-session/manager.js').AcpSessionManager) {
  _globalManager = mgr;
}
