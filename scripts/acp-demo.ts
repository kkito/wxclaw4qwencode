/**
 * ACP 客户端演示脚本
 * 交互式对话，流式输出 AI 回复，自动处理权限请求
 *
 * 使用方式:
 *   npx tsx scripts/acp-demo.ts
 *   npx tsx scripts/acp-demo.ts --model gpt-4o
 *   npx tsx scripts/acp-demo.ts --cwd /path/to/project
 */

import { createAcpClient } from '../src/acp/index.js';
import { createInterface } from 'node:readline';

// 解析命令行参数
function parseArgs(): { model?: string; cwd: string } {
  const args = process.argv.slice(2);
  let model: string | undefined;
  let cwd = process.cwd();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && args[i + 1]) {
      model = args[i + 1];
      i++;
    } else if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    }
  }

  return { model, cwd };
}

async function main(): Promise<void> {
  const { model, cwd } = parseArgs();

  console.error('╔═══════════════════════════════════════════════════════════╗');
  console.error('║           ACP 客户端演示 - Qwen Code                     ║');
  console.error('╚═══════════════════════════════════════════════════════════╝');
  console.error('');
  console.error(`[配置] 工作目录: ${cwd}`);
  console.error(`[配置] 模型: ${model ?? '(默认)'}`);
  console.error(`[配置] 权限: 自动同意`);
  console.error('');
  console.error('输入 "exit" 或 "quit" 结束对话');
  console.error('');

  // 创建 ACP 客户端
  const client = createAcpClient({
    cwd,
    model,
    autoApprove: true,
  });

  // 启动连接和会话
  try {
    await client.start();
  } catch (error) {
    console.error(`\n[错误] 连接失败: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // 创建交互式 readline
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question('\n你: ', async (input) => {
      const trimmed = input.trim();

      // 退出命令
      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        console.error('\n[结束] 正在关闭连接...');
        await client.close();
        rl.close();
        return;
      }

      // 空输入
      if (!trimmed) {
        prompt();
        return;
      }

      // 发送消息
      try {
        await client.sendMessage(trimmed);
      } catch (error) {
        console.error(`\n[错误] 发送失败: ${error instanceof Error ? error.message : String(error)}`);
      }

      // 继续下一轮
      prompt();
    });
  };

  // 开始交互
  prompt();

  // 监听 readline 关闭
  rl.on('close', () => {
    console.error('\n[结束] 再见！');
  });
}

// 运行主函数
main().catch((error) => {
  console.error(`\n[致命错误] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
