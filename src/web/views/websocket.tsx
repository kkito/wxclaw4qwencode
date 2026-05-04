import { html } from 'hono/html';

export function WebSocketClientPage() {
  return html`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WebSocket 测试 - OwnClaw</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { font-size: 24px; margin-bottom: 20px; color: #333; }
    .card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .form-group { margin-bottom: 12px; }
    label { display: block; margin-bottom: 4px; font-weight: 500; color: #555; }
    input[type="text"] { width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
    button { padding: 8px 16px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
    button:hover { background: #0052a3; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    button.secondary { background: #666; }
    button.secondary:hover { background: #555; }
    button.danger { background: #cc3333; }
    button.danger:hover { background: #a32929; }
    .status { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .status.connected { background: #d4edda; color: #155724; }
    .status.disconnected { background: #f8d7da; color: #721c24; }
    .status.connecting { background: #fff3cd; color: #856404; }
    #messages { height: 400px; overflow-y: auto; background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.5; }
    #messages .msg-in { color: #4ec9b0; }
    #messages .msg-out { color: #569cd6; }
    #messages .msg-sys { color: #dcdcaa; }
    #messages .msg-err { color: #f44747; }
    .btn-group { display: flex; gap: 8px; }
    .input-group { display: flex; gap: 8px; }
    .input-group input { flex: 1; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔌 WebSocket 测试</h1>

    <div class="card">
      <div class="form-group">
        <label>连接地址</label>
        <div class="input-group">
          <input type="text" id="wsUrl" value="ws://localhost:8765/default" placeholder="ws://localhost:8765/your-client-id">
          <button id="connectBtn" onclick="connect()">连接</button>
          <button id="disconnectBtn" class="danger" onclick="disconnect()" disabled>断开</button>
        </div>
      </div>
      <div>
        状态: <span id="status" class="status disconnected">未连接</span>
      </div>
    </div>

    <div class="card">
      <div class="form-group">
        <label>发送消息</label>
        <div class="input-group">
          <input type="text" id="msgInput" placeholder="输入消息内容..." onkeydown="if(event.key==='Enter')send()">
          <button id="sendBtn" onclick="send()" disabled>发送</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="form-group">
        <label>消息日志</label>
        <div id="messages"></div>
      </div>
      <div style="margin-top: 8px;">
        <button class="secondary" onclick="clearMessages()">清空</button>
      </div>
    </div>
  </div>

  <script>
    let ws = null;
    const statusEl = document.getElementById('status');
    const messagesEl = document.getElementById('messages');
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const sendBtn = document.getElementById('sendBtn');
    const msgInput = document.getElementById('msgInput');
    const wsUrlInput = document.getElementById('wsUrl');

    function log(text, type = 'sys') {
      const div = document.createElement('div');
      div.className = 'msg-' + type;
      const time = new Date().toLocaleTimeString();
      div.textContent = '[' + time + '] ' + text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function setStatus(status) {
      statusEl.className = 'status ' + status;
      statusEl.textContent = {
        connected: '已连接',
        disconnected: '未连接',
        connecting: '连接中...',
      }[status];
      connectBtn.disabled = status === 'connected' || status === 'connecting';
      disconnectBtn.disabled = status !== 'connected';
      sendBtn.disabled = status !== 'connected';
    }

    function connect() {
      const url = wsUrlInput.value.trim();
      if (!url) return;

      setStatus('connecting');
      log('正在连接 ' + url + '...', 'sys');

      try {
        ws = new WebSocket(url);

        ws.onopen = () => {
          setStatus('connected');
          log('连接成功!', 'sys');
        };

        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            log('← ' + (data.text || JSON.stringify(data)), 'in');
          } catch {
            log('← ' + e.data, 'in');
          }
        };

        ws.onclose = (e) => {
          setStatus('disconnected');
          log('连接已关闭 (code=' + e.code + ')', 'err');
          ws = null;
        };

        ws.onerror = (err) => {
          log('连接错误: ' + err.message, 'err');
        };
      } catch (err) {
        setStatus('disconnected');
        log('连接失败: ' + err.message, 'err');
      }
    }

    function disconnect() {
      if (ws) {
        ws.close();
        ws = null;
      }
    }

    function send() {
      const text = msgInput.value.trim();
      if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

      ws.send(JSON.stringify({ text }));
      log('→ ' + text, 'out');
      msgInput.value = '';
    }

    function clearMessages() {
      messagesEl.innerHTML = '';
    }

    setStatus('disconnected');
  </script>
</body>
</html>`;
}
