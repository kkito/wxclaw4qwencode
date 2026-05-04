import type { FC } from 'hono/jsx';

interface IndexPageProps {
  title: string;
  version: string;
}

export const IndexPage: FC<IndexPageProps> = (props) => {
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title}</title>
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
              }
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                background: hsl(var(--background));
                color: hsl(var(--foreground));
                line-height: 1.6;
              }
              .container {
                max-width: 800px;
                margin: 0 auto;
                padding: 2rem;
              }
              .header {
                text-align: center;
                padding: 4rem 0;
                border-bottom: 1px solid hsl(var(--border));
              }
              .header h1 {
                font-size: 3rem;
                font-weight: 700;
                margin-bottom: 0.5rem;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
              }
              .header .version {
                font-size: 1rem;
                color: hsl(var(--muted-foreground));
              }
              .content {
                padding: 2rem 0;
              }
              .card {
                background: hsl(var(--card));
                border: 1px solid hsl(var(--border));
                border-radius: var(--radius);
                padding: 1.5rem;
                margin-bottom: 1rem;
                box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
              }
              .card h2 {
                font-size: 1.5rem;
                margin-bottom: 0.5rem;
              }
              .card p {
                color: hsl(var(--muted-foreground));
              }
              .footer {
                text-align: center;
                padding: 2rem 0;
                color: hsl(var(--muted-foreground));
                font-size: 0.875rem;
              }
            `,
          }}
        />
      </head>
      <body>
        <div class="container">
          <header class="header">
            <h1>{props.title}</h1>
            <p class="version">v{props.version}</p>
          </header>
          <main class="content">
            <div class="card">
              <h2>欢迎使用 OwnClaw</h2>
              <p>
                OwnClaw 是一个微信消息通道与 AI Agent 框架的集成工具，
                支持将微信用户消息转换为 AI 可处理的格式，并返回智能回复。
              </p>
            </div>
            <div class="card">
              <h2>快速开始</h2>
              <p>
                通过 CLI 命令绑定微信通道，启动 AI Agent 服务。
                查看详细文档获取完整配置说明。
              </p>
            </div>
            <div class="card">
              <h2>管理</h2>
              <p style={{ 'margin-bottom': '0.75rem' }}>
                <a href="/cron" style={{ color: '#667eea', 'text-decoration': 'none' }}>Cron 任务管理</a> |{' '}
                <a href="/skills" style={{ color: '#667eea', 'text-decoration': 'none' }}>Skills 管理</a> |{' '}
                <a href="/executor" style={{ color: '#667eea', 'text-decoration': 'none' }}>任务管理器</a> |{' '}
                <a href="/settings" style={{ color: '#667eea', 'text-decoration': 'none' }}>设置</a> |{' '}
                <a href="/ws" style={{ color: '#667eea', 'text-decoration': 'none' }}>WebSocket 测试</a>
              </p>
            </div>
          </main>
          <footer class="footer">
            <p>OwnClaw &copy; 2026</p>
          </footer>
        </div>
      </body>
    </html>
  );
};
