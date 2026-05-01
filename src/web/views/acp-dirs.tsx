import type { FC } from 'hono/jsx';
import { Hono } from 'hono';
import { loadAcpProjectDirs, saveAcpProjectDirs } from '../../acp-config/store.js';
import { scanProjectDirs } from '../../acp-config/scanner.js';

interface AcpDirsPageProps {
  dirs: string[];
  projects: Array<{ index: number; name: string; path: string }>;
  success?: boolean;
}

const AcpDirsPage: FC<AcpDirsPageProps> = (props) => {
  const dirList = props.dirs.join('\n');
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>OwnClaw - ACP 目录配置</title>
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
              .form-group textarea {
                width: 100%;
                padding: 0.5rem;
                border: 1px solid hsl(var(--border));
                border-radius: var(--radius);
                font-family: monospace;
                font-size: 0.875rem;
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
            `,
          }}
        />
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>ACP 目录配置</h1>
            <a href="/settings">返回设置</a>
          </div>

          {props.success ? (
            <div class="alert-success">保存成功！</div>
          ) : null}

          <div class="card">
            <h2 style={{ 'font-size': '1.25rem', 'margin-bottom': '1rem' }}>根目录列表</h2>
            <form method="post" action="/settings/acp-dirs">
              <div class="form-group">
                <label for="dirs">根目录（每行一个）</label>
                <textarea
                  id="dirs"
                  name="dirs"
                  placeholder={"例如：\n/home/kkito/proj\n/home/kkito/work"}
                >{dirList}</textarea>
                <p class="hint">每个根目录下的一级子目录将出现在 /acp 列表中。</p>
              </div>
              <button type="submit" class="btn btn-primary">保存</button>
            </form>
          </div>

          {props.projects.length > 0 && (
            <div class="card">
              <h2 style={{ 'font-size': '1.25rem', 'margin-bottom': '1rem' }}>
                可访问项目（{props.projects.length} 个）
              </h2>
              <table style={{ 'width': '100%', 'border-collapse': 'collapse', 'font-size': '0.875rem' }}>
                <thead>
                  <tr style={{ 'border-bottom': '1px solid hsl(var(--border))', 'text-align': 'left' }}>
                    <th style={{ 'padding': '0.5rem', 'font-weight': '600' }}>序号</th>
                    <th style={{ 'padding': '0.5rem', 'font-weight': '600' }}>项目路径</th>
                  </tr>
                </thead>
                <tbody>
                  {props.projects.map((p) => (
                    <tr style={{ 'border-bottom': '1px solid hsl(var(--border))' }}>
                      <td style={{ 'padding': '0.5rem', 'color': 'hsl(var(--muted-foreground))' }}>{p.index}</td>
                      <td style={{ 'padding': '0.5rem', 'font-family': 'monospace' }}>{p.path}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </body>
    </html>
  );
};

export function createAcpDirsRouter() {
  const app = new Hono();

  app.get('/', async (c) => {
    const dirs = await loadAcpProjectDirs();
    const scanned = await scanProjectDirs(dirs);
    const projects = scanned.map((d) => ({
      index: d.index,
      name: d.name,
      path: d.path,
    }));
    const saved = c.req.query('saved') === '1';
    return c.html(<AcpDirsPage dirs={dirs} projects={projects} success={saved} />);
  });

  app.post('/', async (c) => {
    const body = await c.req.parseBody();
    const raw = body['dirs'];
    const dirs =
      typeof raw === 'string'
        ? raw
            .split('\n')
            .map((d) => d.trim())
            .filter((d) => d.length > 0)
        : [];

    await saveAcpProjectDirs(dirs);
    return c.redirect('/settings/acp-dirs?saved=1', 302);
  });

  return app;
}
