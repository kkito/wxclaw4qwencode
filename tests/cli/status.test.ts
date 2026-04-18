import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { statusCommand } from '../../src/cli/status';
import path from 'node:path';
import fs from 'node:fs';

describe('cli/status', () => {
  const originalEnv = process.env;
  let tempDir: string;

  beforeEach(() => {
    process.env = { ...originalEnv };
    tempDir = fs.mkdtempSync('/tmp/ownclaw-test-');
    process.env.OWNCLAW_STATE_DIR = tempDir;
  });

  afterEach(() => {
    process.env = originalEnv;
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should show "尚未绑定微信账号" when accounts.json does not exist', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    
    await statusCommand();

    expect(consoleSpy).toHaveBeenCalledWith('尚未绑定微信账号');
  });

  it('should show "尚未绑定微信账号" when accounts.json is empty array', async () => {
    const weixinDir = path.join(tempDir, 'openclaw-weixin');
    fs.mkdirSync(weixinDir, { recursive: true });
    fs.writeFileSync(path.join(weixinDir, 'accounts.json'), '[]');

    const consoleSpy = vi.spyOn(console, 'log');
    
    await statusCommand();

    expect(consoleSpy).toHaveBeenCalledWith('尚未绑定微信账号');
  });

  it('should show "尚未绑定微信账号" when accounts.json has empty accounts field', async () => {
    const weixinDir = path.join(tempDir, 'openclaw-weixin');
    fs.mkdirSync(weixinDir, { recursive: true });
    fs.writeFileSync(path.join(weixinDir, 'accounts.json'), JSON.stringify({ accounts: [] }));

    const consoleSpy = vi.spyOn(console, 'log');
    
    await statusCommand();

    expect(consoleSpy).toHaveBeenCalledWith('尚未绑定微信账号');
  });

  it('should show account list with count when accounts exist', async () => {
    const weixinDir = path.join(tempDir, 'openclaw-weixin');
    const accountsDir = path.join(weixinDir, 'accounts');
    fs.mkdirSync(accountsDir, { recursive: true });

    const accountId = 'bot_123456';
    const accountData = {
      savedAt: '2026-04-18T10:00:00.000Z',
      userId: 'test_user',
    };

    fs.writeFileSync(path.join(weixinDir, 'accounts.json'), JSON.stringify([accountId]));
    fs.writeFileSync(path.join(accountsDir, `${accountId}.json`), JSON.stringify(accountData));

    const consoleSpy = vi.spyOn(console, 'log');
    
    await statusCommand();

    expect(consoleSpy).toHaveBeenCalledWith('已绑定账号数: 1\n');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1. bot_123456'));
  });

  it('should handle multiple accounts', async () => {
    const weixinDir = path.join(tempDir, 'openclaw-weixin');
    const accountsDir = path.join(weixinDir, 'accounts');
    fs.mkdirSync(accountsDir, { recursive: true });

    const accounts = ['bot_001', 'bot_002', 'bot_003'];
    accounts.forEach((id, i) => {
      fs.writeFileSync(
        path.join(accountsDir, `${id}.json`),
        JSON.stringify({ savedAt: '2026-04-18T10:00:00.000Z', userId: `user_${i}` })
      );
    });

    fs.writeFileSync(path.join(weixinDir, 'accounts.json'), JSON.stringify(accounts));

    const consoleSpy = vi.spyOn(console, 'log');
    
    await statusCommand();

    expect(consoleSpy).toHaveBeenCalledWith('已绑定账号数: 3\n');
  });

  it('should show account without detail file', async () => {
    const weixinDir = path.join(tempDir, 'openclaw-weixin');
    const accountsDir = path.join(weixinDir, 'accounts');
    fs.mkdirSync(accountsDir, { recursive: true });

    const accountId = 'bot_no_detail';
    // 只创建索引，不创建账号详情文件
    fs.writeFileSync(path.join(weixinDir, 'accounts.json'), JSON.stringify([accountId]));

    const consoleSpy = vi.spyOn(console, 'log');
    
    await statusCommand();

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1. bot_no_detail'));
  });
});