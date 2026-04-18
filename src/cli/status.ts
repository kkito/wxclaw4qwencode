/**
 * 查看绑定状态子命令
 */
import { resolveStateDir } from './config.js';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

export async function statusCommand(): Promise<void> {
  console.log('=== 微信绑定状态 ===\n');

  const stateDir = resolveStateDir();
  const weixinDir = path.join(stateDir, 'openclaw-weixin');
  const indexPath = path.join(weixinDir, 'accounts.json');

  if (!existsSync(indexPath)) {
    console.log('尚未绑定微信账号');
    return;
  }

  try {
    const raw = readFileSync(indexPath, 'utf-8');
    const data = JSON.parse(raw);
    const accountIds = Array.isArray(data) ? data : data.accounts || [];

    if (accountIds.length === 0) {
      console.log('尚未绑定微信账号');
      return;
    }

    console.log(`已绑定账号数: ${accountIds.length}\n`);

    // 读取每个账号的详细信息
    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i];
      const accountPath = path.join(weixinDir, 'accounts', `${accountId}.json`);
      let info = `${i + 1}. ${accountId}`;

      if (existsSync(accountPath)) {
        const accountData = JSON.parse(readFileSync(accountPath, 'utf-8'));
        if (accountData.savedAt) {
          const date = new Date(accountData.savedAt).toLocaleString('zh-CN');
          info += ` - 绑定时间: ${date}`;
        }
        if (accountData.userId) {
          info += ` - 用户: ${accountData.userId}`;
        }
      }

      console.log(info);
    }

  } catch (error) {
    console.error('读取状态失败:', error);
    process.exit(1);
  }
}