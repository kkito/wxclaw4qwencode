import type { FC } from 'hono/jsx';
import { Hono } from 'hono';
import {
  loadSendThrottleInterval,
  saveSendThrottleInterval,
  loadChannelConfig,
  saveChannelConfig,
  type ChannelConfig,
} from '../../config-store.js';
import { loadAcpProjectDirs } from '../../acp-config/store.js';

interface SettingsPageProps {
  intervalMs: number;
  acpDirs: string[];
  channelConfig: ChannelConfig;
  success?: boolean;
  wecomSaved?: boolean;
  feishuSaved?: boolean;
}

const SettingsPage: FC<SettingsPageProps> = (props) => {
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>OwnClaw - 设置</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              :root {
                --background: 0 0% 100%;
                --foreground: 222.2 84% 4.9%;
                --card: 0 0% 100%;
                --card-foreground: 222.2 84% 4.9%;
                --primary: 222.2 47.4% 11.2%;
                --primary-foreground: 210 40% 98%;
                --muted: 210 40% 96.1%;
                --muted-foreground: 215.4 16.3% 46.9%;
                --border: 214.3 31.8% 91.4%;
                --radius: 0.5rem;
                --success: 142 76% 36%;
              }
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background: hsl(var(--background));
                color: hsl(var(--foreground));
                line-height: 1.6;
              }
              .container { max-width: 600px; margin: 0 auto; padding: 2rem; }
              .header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 2rem;
                padding-bottom: 1rem;
                border-bottom: 1px solid hsl(var(--border));
              }
              .header h1 {
                font-size: 2rem;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
              }
              .header a {
                color: hsl(var(--muted-foreground));
                text-decoration: none;
                font-size: 0.875rem;
              }
              .header a:hover { text-decoration: underline; }
              .card {
                background: hsl(var(--card));
                border: 1px solid hsl(var(--border));
                border-radius: var(--radius);
                padding: 1.5rem;
                margin-bottom: 1rem;
              }
              .form-group { margin-bottom: 1rem; }
              .form-group label {
                display: block;
                margin-bottom: 0.25rem;
                font-weight: 500;
                font-size: 0.875rem;
              }
              .form-group input {
                width: 100%;
                padding: 0.5rem;
                border: 1px solid hsl(var(--border));
                border-radius: var(--radius);
                font-family: inherit;
              }
              .form-group .hint {
                margin-top: 0.25rem;
                font-size: 0.75rem;
                color: hsl(var(--muted-foreground));
              }
              .btn {
                padding: 0.5rem 1rem;
                border: none;
                border-radius: var(--radius);
                cursor: pointer;
                font-size: 0.875rem;
                transition: opacity 0.2s;
              }
              .btn:hover { opacity: 0.8; }
              .btn-primary { background: #667eea; color: white; }
              .alert-success {
                background: hsl(var(--success) / 0.1);
                color: hsl(var(--success));
                padding: 0.75rem 1rem;
                border-radius: var(--radius);
                margin-bottom: 1rem;
                font-size: 0.875rem;
              }
            `,
          }}
        />
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>设置</h1>
            <a href="/">返回首页</a>
          </div>

          {props.success ? (
            <div class="alert-success">保存成功！</div>
          ) : null}

          <div class="card">
            <h2 style={{ 'font-size': '1.25rem', 'margin-bottom': '1rem' }}>发送消息限流</h2>
            <form method="post" action="/settings">
              <div class="form-group">
                <label for="intervalMs">限流间隔（毫秒）</label>
                <input
                  type="number"
                  id="intervalMs"
                  name="intervalMs"
                  min="100"
                  step="100"
                  required
                  value={String(props.intervalMs)}
                />
                <p class="hint">两次发送消息之间的最小间隔时间，默认 5000 毫秒。</p>
              </div>
              <button type="submit" class="btn btn-primary">保存</button>
            </form>
          </div>

          <div class="card">
            <h2 style={{ 'font-size': '1.25rem', 'margin-bottom': '1rem' }}>ACP 模式</h2>
            <p style={{ 'font-size': '0.875rem', 'color': 'hsl(var(--muted-foreground))', 'margin-bottom': '0.75rem' }}>
              配置 ACP 模式的根目录列表，用于 <code style={{ 'background': 'hsl(var(--muted))', 'padding': '0.125rem 0.375rem', 'border-radius': 'var(--radius)' }}>/acp</code> 命令扫描项目。
            </p>
            {props.acpDirs.length > 0 ? (
              <div style={{ 'margin-bottom': '1rem' }}>
                <p style={{ 'font-size': '0.875rem', 'margin-bottom': '0.5rem' }}>已配置的根目录：</p>
                <ul style={{ 'list-style': 'none', 'padding': 0, 'margin': 0 }}>
                  {props.acpDirs.map((dir) => (
                    <li style={{ 'font-family': 'monospace', 'font-size': '0.875rem', 'padding': '0.25rem 0', 'border-bottom': '1px solid hsl(var(--border))' }}>
                      {dir}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p style={{ 'font-size': '0.875rem', 'color': 'hsl(var(--muted-foreground))', 'margin-bottom': '1rem' }}>
                尚未配置根目录，请前往配置页面添加。
              </p>
            )}
            <a href="/settings/acp-dirs" class="btn btn-primary" style={{ 'text-decoration': 'none', 'display': 'inline-block' }}>配置 ACP 目录</a>
          </div>

          <div class="card">
            <h2 style={{ 'font-size': '1.25rem', 'margin-bottom': '1rem' }}>企业微信通道</h2>
            {props.wecomSaved ? (
              <div class="alert-success">企业微信配置已保存！</div>
            ) : null}
            <form method="post" action="/settings/wecom">
              <div class="form-group">
                <label>
                  <input
                    type="checkbox"
                    name="enabled"
                    checked={!!props.channelConfig.wecom?.enabled}
                    style={{ 'margin-right': '0.5rem' }}
                  />
                  启用企业微信
                </label>
                <p class="hint">启用后，OwnClaw 将通过企业微信 WebSocket 连接接收和发送消息。</p>
              </div>
              <div class="form-group">
                <label for="botId">Bot ID</label>
                <input
                  type="text"
                  id="botId"
                  name="botId"
                  value={props.channelConfig.wecom?.botId || ''}
                  placeholder="请输入企业微信 Bot ID"
                />
                <p class="hint">企业微信机器人的唯一标识。</p>
              </div>
              <div class="form-group">
                <label for="secret">Secret</label>
                <input
                  type="password"
                  id="secret"
                  name="secret"
                  value={props.channelConfig.wecom?.secret || ''}
                  placeholder="请输入企业微信 Bot Secret"
                />
                <p class="hint">企业微信机器人的密钥。</p>
              </div>
              <button type="submit" class="btn btn-primary">保存</button>
            </form>
            <div style={{ 'margin-top': '1rem', 'font-size': '0.875rem', 'color': 'hsl(var(--muted-foreground))' }}>
              状态：{props.channelConfig.wecom?.enabled && props.channelConfig.wecom.botId && props.channelConfig.wecom.secret
                ? '🟢 已配置（重启后生效）'
                : '⚪ 未启用'}
            </div>
          </div>

          <div class="card">
            <h2 style={{ 'font-size': '1.25rem', 'margin-bottom': '1rem' }}>飞书通道</h2>
            {props.feishuSaved ? (
              <div class="alert-success">飞书配置已保存！</div>
            ) : null}
            <form method="post" action="/settings/feishu">
              <div class="form-group">
                <label>
                  <input
                    type="checkbox"
                    name="enabled"
                    checked={!!props.channelConfig.feishu?.enabled}
                    style={{ 'margin-right': '0.5rem' }}
                  />
                  启用飞书
                </label>
                <p class="hint">启用后，OwnClaw 将通过飞书 WebSocket 连接接收和发送消息。</p>
              </div>
              <div class="form-group">
                <label for="appId">App ID</label>
                <input
                  type="text"
                  id="appId"
                  name="appId"
                  value={props.channelConfig.feishu?.appId || ''}
                  placeholder="请输入飞书 App ID"
                />
                <p class="hint">飞书企业自建应用的 App ID。</p>
              </div>
              <div class="form-group">
                <label for="appSecret">App Secret</label>
                <input
                  type="password"
                  id="appSecret"
                  name="appSecret"
                  value={props.channelConfig.feishu?.appSecret || ''}
                  placeholder="请输入飞书 App Secret"
                />
                <p class="hint">飞书企业自建应用的 App Secret。</p>
              </div>
              <button type="submit" class="btn btn-primary">保存</button>
            </form>
            <div style={{ 'margin-top': '1rem', 'font-size': '0.875rem', 'color': 'hsl(var(--muted-foreground))' }}>
              状态：{props.channelConfig.feishu?.enabled && props.channelConfig.feishu.appId && props.channelConfig.feishu.appSecret
                ? '🟢 已配置（重启后生效）'
                : '⚪ 未启用'}
            </div>
          </div>
        </div>
      </body>
    </html>
  );
};

export function createSettingsRouter() {
  const app = new Hono();

  app.get('/', async (c) => {
    const intervalMs = await loadSendThrottleInterval();
    const acpDirs = await loadAcpProjectDirs();
    const channelConfig = await loadChannelConfig();
    const saved = c.req.query('saved') === '1';
    const wecomSaved = c.req.query('wecom') === '1';
    const feishuSaved = c.req.query('feishu') === '1';
    return c.html(<SettingsPage intervalMs={intervalMs} acpDirs={acpDirs} channelConfig={channelConfig} success={saved} wecomSaved={wecomSaved} feishuSaved={feishuSaved} />);
  });

  app.post('/', async (c) => {
    const body = await c.req.parseBody();
    const raw = body['intervalMs'];
    const intervalMs = typeof raw === 'string' ? parseInt(raw, 10) : NaN;

    if (Number.isNaN(intervalMs) || intervalMs < 100) {
      return c.text('限流间隔必须是大于等于 100 的整数', 400);
    }

    await saveSendThrottleInterval(intervalMs);
    return c.redirect('/settings?saved=1', 302);
  });

  // 企业微信配置提交
  app.post('/wecom', async (c) => {
    const body = await c.req.parseBody();
    const channel = await loadChannelConfig();
    channel.wecom = {
      enabled: body['enabled'] === 'on',
      botId: (body['botId'] as string) || '',
      secret: (body['secret'] as string) || '',
    };
    await saveChannelConfig(channel);
    return c.redirect('/settings?wecom=1', 302);
  });

  // 飞书配置提交
  app.post('/feishu', async (c) => {
    const body = await c.req.parseBody();
    const channel = await loadChannelConfig();
    channel.feishu = {
      enabled: body['enabled'] === 'on',
      appId: (body['appId'] as string) || '',
      appSecret: (body['appSecret'] as string) || '',
    };
    await saveChannelConfig(channel);
    return c.redirect('/settings?feishu=1', 302);
  });

  return app;
}
