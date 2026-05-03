import type { FC } from 'hono/jsx';
import { Hono } from 'hono';
import { loadModelConfig, saveModelConfig } from '../../config-store.js';

interface ModelConfigPageProps {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  sysPrompt: string;
  success?: boolean;
  error?: string;
}

const ModelConfigPage: FC<ModelConfigPageProps> = (props) => {
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>OwnClaw - 模型配置</title>
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
                --destructive: 0 84.2% 60.2%;
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
              .form-group input,
              .form-group textarea {
                width: 100%;
                padding: 0.5rem;
                border: 1px solid hsl(var(--border));
                border-radius: var(--radius);
                font-family: inherit;
                font-size: 0.875rem;
              }
              .form-group textarea {
                min-height: 120px;
                resize: vertical;
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
              .alert-error {
                background: hsl(var(--destructive) / 0.1);
                color: hsl(var(--destructive));
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
            <h1>模型配置</h1>
            <a href="/settings">返回设置</a>
          </div>

          {props.success ? (
            <div class="alert-success">保存成功！重启后生效。</div>
          ) : null}

          {props.error ? (
            <div class="alert-error">{props.error}</div>
          ) : null}

          <div class="card">
            <form id="model-config-form">
              <div class="form-group">
                <label for="baseUrl">模型 API 地址 *</label>
                <input
                  type="text"
                  id="baseUrl"
                  name="baseUrl"
                  required
                  value={props.baseUrl}
                  placeholder="https://api.openai.com/v1"
                />
                <p class="hint">模型 API 的 Base URL，例如 OpenAI 兼容格式的 API 地址。</p>
              </div>

              <div class="form-group">
                <label for="apiKey">API Key</label>
                <input
                  type="password"
                  id="apiKey"
                  name="apiKey"
                  value={props.apiKey}
                  placeholder="sk-xxx"
                />
                <p class="hint">模型 API 的认证密钥，留空则不使用密钥。</p>
              </div>

              <div class="form-group">
                <label for="modelName">模型名称</label>
                <input
                  type="text"
                  id="modelName"
                  name="modelName"
                  value={props.modelName}
                  placeholder="gpt-4o"
                />
                <p class="hint">要使用的模型标识符，默认为 gpt-4o。</p>
              </div>

              <div class="form-group">
                <label for="sysPrompt">系统提示词</label>
                <textarea
                  id="sysPrompt"
                  name="sysPrompt"
                  placeholder="你是一个友好的 AI 助手。"
                >{props.sysPrompt}</textarea>
                <p class="hint">AI 助手的系统级提示词，用于定义其行为风格。</p>
              </div>

              <button type="submit" class="btn btn-primary">保存配置</button>
            </form>
          </div>
        </div>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const form = document.getElementById('model-config-form');
                form.addEventListener('submit', async (e) => {
                  e.preventDefault();
                  const btn = form.querySelector('button[type="submit"]');
                  btn.textContent = '保存中...';
                  btn.disabled = true;

                  try {
                    const res = await fetch('/api/model/config', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        baseUrl: form.baseUrl.value,
                        apiKey: form.apiKey.value || undefined,
                        modelName: form.modelName.value || 'gpt-4o',
                        sysPrompt: form.sysPrompt.value || '你是一个友好的 AI 助手。',
                      }),
                    });

                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.error || '保存失败');
                    }

                    // Reload to show success state
                    window.location.href = '/settings/model?saved=1';
                  } catch (err) {
                    alert(err.message);
                  } finally {
                    btn.textContent = '保存配置';
                    btn.disabled = false;
                  }
                });
              })();
            `,
          }}
        />
      </body>
    </html>
  );
};

export function createModelConfigRouter() {
  const app = new Hono();

  // GET /settings/model - 渲染模型配置页面
  app.get('/', async (c) => {
    const stored = await loadModelConfig();
    const success = c.req.query('saved') === '1';
    return c.html(
      <ModelConfigPage
        baseUrl={stored.baseUrl ?? ''}
        apiKey={stored.apiKey ?? ''}
        modelName={stored.modelName ?? 'gpt-4o'}
        sysPrompt={stored.sysPrompt ?? '你是一个友好的 AI 助手。'}
        success={success}
      />,
    );
  });

  return app;
}
