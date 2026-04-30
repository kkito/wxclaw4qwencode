/**
 * ACP 客户端快速测试脚本
 * 非交互式，发送一条消息后退出
 */

import { createAcpClient } from '../src/acp/index.js';

async function main(): Promise<void> {
  console.error('╔═══════════════════════════════════════════════════════════╗');
  console.error('║           ACP 客户端快速测试                             ║');
  console.error('╚═══════════════════════════════════════════════════════════╝');
  console.error('');

  // 创建 ACP 客户端
  const client = createAcpClient({
    cwd: process.cwd(),
    autoApprove: true,
  });

  // 启动连接和会话
  try {
    await client.start();
  } catch (error) {
    console.error(`\n[错误] 连接失败: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // 发送测试消息
  try {
    await client.sendMessage('你好，请用简短的话介绍一下你自己');
  } catch (error) {
    console.error(`\n[错误] 发送失败: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 关闭连接
  console.error('\n[测试] 正在关闭连接...');
  await client.close();
  console.error('[测试] 测试完成');
}

main().catch((error) => {
  console.error(`\n[致命错误] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
