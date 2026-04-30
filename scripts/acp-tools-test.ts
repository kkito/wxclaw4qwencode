/**
 * ACP 客户端测试 - 测试工具调用和权限处理
 */

import { createAcpClient } from '../src/acp/index.js';

async function main(): Promise<void> {
  console.error('╔═══════════════════════════════════════════════════════════╗');
  console.error('║           ACP 工具调用测试                               ║');
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

  // 测试 1: 简单对话
  console.error('\n═══ 测试 1: 简单对话 ═══\n');
  try {
    await client.sendMessage('你好');
  } catch (error) {
    console.error(`[错误] 测试 1 失败: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 测试 2: 需要读取文件的操作（会触发工具调用）
  console.error('\n═══ 测试 2: 文件读取操作 ═══\n');
  try {
    await client.sendMessage('读取当前目录下的 package.json 文件并告诉我项目名称');
  } catch (error) {
    console.error(`[错误] 测试 2 失败: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 关闭连接
  console.error('\n[测试] 正在关闭连接...');
  await client.close();
  console.error('[测试] 所有测试完成');
}

main().catch((error) => {
  console.error(`\n[致命错误] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
