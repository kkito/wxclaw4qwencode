/**
 * ACP 客户端脚本
 *
 * 交互模式（默认）：
 *   npx tsx scripts/acp-demo.ts
 *
 * 快速验证模式（发送一条消息后退出）：
 *   npx tsx scripts/acp-demo.ts --message "你好"
 *
 * 选项：
 *   --model <name>   指定模型
 *   --cwd <path>     指定工作目录
 *   --message <text> 非交互模式，发送单条消息后退出
 */

import { createAcpClient } from '../src/acp/index.js';
import { createInterface } from 'node:readline';

interface CliArgs {
  model?: string;
  cwd: string;
  message?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = { cwd: process.cwd() };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--model':
        result.model = args[++i];
        break;
      case '--cwd':
        result.cwd = args[++i];
        break;
      case '--message':
        result.message = args[++i];
        break;
    }
  }

  return result;
}

async function runInteractive(client: ReturnType<typeof createAcpClient>): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = () => {
    rl.question('\n你: ', async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        ask();
        return;
      }

      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        console.error('\n[结束] 正在关闭连接...');
        await client.close();
        rl.close();
        return;
      }

      try {
        await client.sendMessage(trimmed);
      } catch (error) {
        console.error(`\n[错误] ${error instanceof Error ? error.message : String(error)}`);
      }

      ask();
    });
  };

  ask();

  rl.on('close', () => {
    console.error('\n[结束] 再见！');
  });
}

async function runSingle(client: ReturnType<typeof createAcpClient>, message: string): Promise<void> {
  await client.sendMessage(message);
  await client.close();
}

async function main(): Promise<void> {
  const { model, cwd, message } = parseArgs();
  const isSingleMode = !!message;

  if (!isSingleMode) {
    console.error('╔═══════════════════════════════════════════════════════════╗');
    console.error('║           ACP 客户端 - 交互式对话                        ║');
    console.error('╚═══════════════════════════════════════════════════════════╝');
  } else {
    console.error('[ACP] 快速验证模式');
  }

  console.error(`[配置] 工作目录: ${cwd}`);
  console.error(`[配置] 模型: ${model ?? '(默认)'}`);
  console.error(`[配置] 权限: 自动同意`);
  console.error('');

  const client = createAcpClient({
    cwd,
    model,
    autoApprove: true,
  });

  try {
    await client.start();
  } catch (error) {
    console.error(`\n[错误] 连接失败: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  if (isSingleMode) {
    await runSingle(client, message);
  } else {
    console.error('输入 "exit" 或 "quit" 结束对话');
    console.error('');
    await runInteractive(client);
  }
}

main().catch((error) => {
  console.error(`\n[致命错误] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
