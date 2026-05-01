import type { FC } from 'hono/jsx';
import { Hono } from 'hono';
import { loadSendThrottleInterval, saveSendThrottleInterval } from '../../config-store.js';

interface SettingsPageProps {
  intervalMs: number;
  success?: boolean;
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
            <a href="/settings/acp-dirs" class="btn btn-primary" style={{ 'text-decoration': 'none', 'display': 'inline-block' }}>配置 ACP 目录</a>
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
    const saved = c.req.query('saved') === '1';
    return c.html(<SettingsPage intervalMs={intervalMs} success={saved} />);
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

  return app;
}
