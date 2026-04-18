import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { unbindCommand } from '../../src/cli/unbind';
import path from 'node:path';
import fs from 'node:fs';

describe('cli/unbind', () => {
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

  it('should show "无需解绑" when accounts.json does not exist', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    
    await unbindCommand();

    expect(consoleSpy).toHaveBeenCalledWith('尚未绑定微信账号，无需解绑');
  });

  it('should show "无需解绑" when accounts.json is empty array', async () => {
    const weixinDir = path.join(tempDir, 'openclaw-weixin');
    fs.mkdirSync(weixinDir, { recursive: true });
    fs.writeFileSync(path.join(weixinDir, 'accounts.json'), '[]');

    const consoleSpy = vi.spyOn(console, 'log');
    
    await unbindCommand();

    expect(consoleSpy).toHaveBeenCalledWith('尚未绑定微信账号，无需解绑');
  });

  it('should unbind first account and update index', async () => {
    const weixinDir = path.join(tempDir, 'openclaw-weixin');
    const accountsDir = path.join(weixinDir, 'accounts');
    fs.mkdirSync(accountsDir, { recursive: true });

    const accountId = 'bot_123456';
    fs.writeFileSync(path.join(weixinDir, 'accounts.json'), JSON.stringify([accountId]));
    fs.writeFileSync(
      path.join(accountsDir, `${accountId}.json`),
      JSON.stringify({ savedAt: '2026-04-18T10:00:00.000Z', userId: 'test_user' })
    );

    const consoleSpy = vi.spyOn(console, 'log');
    
    await unbindCommand();

    // 验证解绑成功消息
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✅ 解绑成功'));

    // 验证账号文件已删除
    expect(fs.existsSync(path.join(accountsDir, `${accountId}.json`))).toBe(false);

    // 验证索引已更新
    const indexData = JSON.parse(fs.readFileSync(path.join(weixinDir, 'accounts.json'), 'utf-8'));
    expect(indexData).toEqual([]);
  });

  it('should delete sync and context-token files if exist', async () => {
    const weixinDir = path.join(tempDir, 'openclaw-weixin');
    const accountsDir = path.join(weixinDir, 'accounts');
    fs.mkdirSync(accountsDir, { recursive: true });

    const accountId = 'bot_123456';
    fs.writeFileSync(path.join(weixinDir, 'accounts.json'), JSON.stringify([accountId]));
    fs.writeFileSync(path.join(accountsDir, `${accountId}.json`), JSON.stringify({}));
    // 创建额外的文件
    fs.writeFileSync(path.join(accountsDir, `${accountId}.sync.json`), JSON.stringify({}));
    fs.writeFileSync(path.join(accountsDir, `${accountId}.context-tokens.json`), JSON.stringify({}));

    await unbindCommand();

    expect(fs.existsSync(path.join(accountsDir, `${accountId}.sync.json`))).toBe(false);
    expect(fs.existsSync(path.join(accountsDir, `${accountId}.context-tokens.json`))).toBe(false);
  });

  it('should unbind first account when multiple accounts exist', async () => {
    const weixinDir = path.join(tempDir, 'openclaw-weixin');
    const accountsDir = path.join(weixinDir, 'accounts');
    fs.mkdirSync(accountsDir, { recursive: true });

    const accounts = ['bot_first', 'bot_second', 'bot_third'];
    fs.writeFileSync(path.join(weixinDir, 'accounts.json'), JSON.stringify(accounts));
    accounts.forEach(id => {
      fs.writeFileSync(path.join(accountsDir, `${id}.json`), JSON.stringify({}));
    });

    const consoleSpy = vi.spyOn(console, 'log');
    
    await unbindCommand();

    // 验证第一个账号已删除
    expect(fs.existsSync(path.join(accountsDir, 'bot_first.json'))).toBe(false);
    // 验证其他账号仍存在
    expect(fs.existsSync(path.join(accountsDir, 'bot_second.json'))).toBe(true);
    expect(fs.existsSync(path.join(accountsDir, 'bot_third.json'))).toBe(true);

    // 验证索引已更新
    const indexData = JSON.parse(fs.readFileSync(path.join(weixinDir, 'accounts.json'), 'utf-8'));
    expect(indexData).toEqual(['bot_second', 'bot_third']);
  });

  it('should show warning when multiple accounts exist', async () => {
    const weixinDir = path.join(tempDir, 'openclaw-weixin');
    const accountsDir = path.join(weixinDir, 'accounts');
    fs.mkdirSync(accountsDir, { recursive: true });

    fs.writeFileSync(path.join(weixinDir, 'accounts.json'), JSON.stringify(['bot_1', 'bot_2']));
    fs.writeFileSync(path.join(accountsDir, 'bot_1.json'), JSON.stringify({}));
    fs.writeFileSync(path.join(accountsDir, 'bot_2.json'), JSON.stringify({}));

    const consoleSpy = vi.spyOn(console, 'log');
    
    await unbindCommand();

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('注意：多个账号'));
  });
});