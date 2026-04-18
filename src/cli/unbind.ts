/**
 * 解绑微信子命令
 */
import { resolveStateDir } from './config.js';
import { readFileSync, existsSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';

export async function unbindCommand(): Promise<void> {
  console.log('=== 微信解绑 ===\n');

  const stateDir = resolveStateDir();
  const weixinDir = path.join(stateDir, 'openclaw-weixin');
  const indexPath = path.join(weixinDir, 'accounts.json');

  if (!existsSync(indexPath)) {
    console.log('尚未绑定微信账号，无需解绑');
    return;
  }

  try {
    const raw = readFileSync(indexPath, 'utf-8');
    const data = JSON.parse(raw);
    const accountIds: string[] = Array.isArray(data) ? data : data.accounts || [];

    if (accountIds.length === 0) {
      console.log('尚未绑定微信账号，无需解绑');
      return;
    }

    console.log('已绑定的账号:\n');
    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i];
      const accountPath = path.join(weixinDir, 'accounts', `${accountId}.json`);
      let info = `${i + 1}. ${accountId}`;

      if (existsSync(accountPath)) {
        const accountData = JSON.parse(readFileSync(accountPath, 'utf-8'));
        if (accountData.userId) {
          info += ` (${accountData.userId})`;
        }
      }
      console.log(info);
    }

    // 默认解绑第一个账号
    const accountId = accountIds[0];
    
    if (accountIds.length > 1) {
      console.log(`\n注意：多个账号，仅解绑第一个 (${accountId})`);
      console.log('如需解绑其他账号，请手动删除 ~/.ownclaw/openclaw-weixin/accounts/ 下的文件');
    }

    // 删除账户文件
    const accountPath = path.join(weixinDir, 'accounts', `${accountId}.json`);
    if (existsSync(accountPath)) {
      unlinkSync(accountPath);
    }

    // 删除同步缓冲区（如果存在）
    const syncPath = path.join(weixinDir, 'accounts', `${accountId}.sync.json`);
    if (existsSync(syncPath)) {
      unlinkSync(syncPath);
    }

    // 删除上下文 token（如果存在）
    const contextPath = path.join(weixinDir, 'accounts', `${accountId}.context-tokens.json`);
    if (existsSync(contextPath)) {
      unlinkSync(contextPath);
    }

    // 更新索引
    const updatedAccountIds = accountIds.filter(id => id !== accountId);
    writeFileSync(indexPath, JSON.stringify(updatedAccountIds, null, 2), 'utf-8');

    console.log(`\n✅ 解绑成功: ${accountId}`);

  } catch (error) {
    console.error('解绑失败:', error);
    process.exit(1);
  }
}