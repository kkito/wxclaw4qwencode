/**
 * 绑定微信子命令
 * 直接实现登录 API 调用，避免依赖 openclaw-weixin 内部模块
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { resolveStateDir } from './config.js';

const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';
const FIXED_BASE_URL = 'https://ilinkai.weixin.qq.com';
const DEFAULT_BOT_TYPE = '3';
const QR_LONG_POLL_TIMEOUT_MS = 35_000;

/**
 * 调用微信 ilink API 获取二维码
 */
export async function fetchQRCode(apiBaseUrl: string, botType: string): Promise<{ qrcode: string; qrcode_img_content: string }> {
  const response = await fetch(`${apiBaseUrl}/ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(botType)}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`获取二维码失败: ${response.status} ${response.statusText}`);
  }

  const json = await response.json() as { qrcode: string; qrcode_img_content: string };
  return json;
}

/**
 * 轮询二维码状态
 */
export async function pollQRStatus(apiBaseUrl: string, qrcode: string): Promise<{
  status: 'wait' | 'scaned' | 'confirmed' | 'expired' | 'scaned_but_redirect';
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
  redirect_host?: string;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), QR_LONG_POLL_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${apiBaseUrl}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      return { status: 'wait' };
    }

    const json = await response.json() as {
      status: 'wait' | 'scaned' | 'confirmed' | 'expired' | 'scaned_but_redirect';
      bot_token?: string;
      ilink_bot_id?: string;
      baseurl?: string;
      ilink_user_id?: string;
      redirect_host?: string;
    };
    return json;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('轮询超时，继续等待...');
    }
    return { status: 'wait' };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 保存账户信息到 ~/.ownclaw
 */
export function saveAccount(accountId: string, data: {
  token?: string;
  baseUrl?: string;
  userId?: string;
}): void {
  const stateDir = resolveStateDir();
  const accountsDir = `${stateDir}/openclaw-weixin/accounts`;

  // 创建目录
  fs.mkdirSync(accountsDir, { recursive: true });

  const accountPath = `${accountsDir}/${accountId}.json`;

  // 读取现有数据
  let existing = {};
  try {
    existing = JSON.parse(fs.readFileSync(accountPath, 'utf-8'));
  } catch {
    // 文件不存在，使用空对象
  }

  const accountData = {
    ...existing,
    ...(data.token && { token: data.token, savedAt: new Date().toISOString() }),
    ...(data.baseUrl && { baseUrl: data.baseUrl }),
    ...(data.userId && { userId: data.userId }),
  };

  fs.writeFileSync(accountPath, JSON.stringify(accountData, null, 2), 'utf-8');

  // 更新索引
  const indexPath = `${stateDir}/openclaw-weixin/accounts.json`;
  let accountIds: string[] = [];
  try {
    accountIds = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  } catch {
    accountIds = [];
  }

  if (!accountIds.includes(accountId)) {
    accountIds.push(accountId);
    fs.writeFileSync(indexPath, JSON.stringify(accountIds, null, 2), 'utf-8');
  }
}

export async function bindCommand(): Promise<void> {
  const stateDir = resolveStateDir();
  
  console.log('=== 微信绑定 ===\n');
  console.log(`状态目录: ${stateDir}\n`);

  try {
    // 1. 获取二维码
    console.log('正在获取二维码...\n');

    const qrResult = await fetchQRCode(FIXED_BASE_URL, DEFAULT_BOT_TYPE);

    if (!qrResult.qrcode_img_content) {
      console.error('获取二维码失败');
      process.exit(1);
    }

    // 2. 显示二维码
    console.log('请使用微信扫描下方二维码登录:');
    console.log();

    // 如果是 URL 直接显示
    if (qrResult.qrcode_img_content.startsWith('http')) {
      console.log(qrResult.qrcode_img_content);
      console.log();
      console.log('或复制上方链接到浏览器打开');
    } else {
      console.log('[请查看上方的二维码]');
      console.log(`二维码内容: ${qrResult.qrcode.substring(0, 20)}...`);
    }

    console.log('\n等待扫码中... (按 Ctrl+C 取消)\n');

    // 3. 轮询等待登录
    const qrcode = qrResult.qrcode;
    let attempts = 0;
    const maxAttempts = 60; // 最多等待 5 分钟
    
    let lastStatus = 'wait';

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;

      const result = await pollQRStatus(FIXED_BASE_URL, qrcode);
      lastStatus = result.status;

      if (result.status === 'confirmed' || result.status === 'scaned') {
        console.log(`状态: ${result.status === 'scaned' ? '已扫码，等待确认...' : '已确认！'}`);
      }

      if (result.status === 'confirmed' && result.bot_token) {
        // 4. 登录成功，保存账户
        const accountId = result.ilink_bot_id || `bot_${Date.now()}`;
        
        saveAccount(accountId, {
          token: result.bot_token,
          baseUrl: result.baseurl || DEFAULT_BASE_URL,
          userId: result.ilink_user_id,
        });

        console.log('\n✅ 绑定成功！');
        console.log(`账号: ${accountId}`);
        if (result.ilink_user_id) {
          console.log(`用户: ${result.ilink_user_id}`);
        }
        return;
      }

      if (attempts % 6 === 0) {
        console.log(`等待确认中... (${Math.floor(attempts * 5 / 60)} 分 ${attempts * 5 % 60} 秒)`);
      }
    }

    console.log('\n绑定超时，请重试');

  } catch (error) {
    console.error('\n绑定失败:', error);
    process.exit(1);
  }
}