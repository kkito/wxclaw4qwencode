import type { FC } from 'hono/jsx';

export const CronPage: FC = () => {
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>OwnClaw - Cron 管理</title>
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
                --danger: 0 84% 60%;
              }
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background: hsl(var(--background));
                color: hsl(var(--foreground));
                line-height: 1.6;
              }
              .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
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
              .btn-success { background: hsl(var(--success)); color: white; }
              .btn-danger { background: hsl(var(--danger)); color: white; }
              .btn-muted { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
              .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
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
              .form-group input, .form-group textarea {
                width: 100%;
                padding: 0.5rem;
                border: 1px solid hsl(var(--border));
                border-radius: var(--radius);
                font-family: inherit;
              }
              .form-group textarea { min-height: 80px; resize: vertical; }
              .checkbox { display: flex; align-items: center; gap: 0.5rem; }
              table {
                width: 100%;
                border-collapse: collapse;
              }
              th, td {
                padding: 0.75rem;
                text-align: left;
                border-bottom: 1px solid hsl(var(--border));
              }
              th { font-weight: 600; font-size: 0.875rem; }
              td { font-size: 0.875rem; }
              .badge {
                display: inline-block;
                padding: 0.125rem 0.5rem;
                border-radius: 9999px;
                font-size: 0.75rem;
                font-weight: 500;
              }
              .badge-success { background: hsl(var(--success) / 0.1); color: hsl(var(--success)); }
              .badge-muted { background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }
              .modal {
                display: none;
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.5);
                align-items: center;
                justify-content: center;
                z-index: 100;
              }
              .modal.active { display: flex; }
              .modal-content {
                background: white;
                padding: 2rem;
                border-radius: var(--radius);
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
              }
              .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 1rem;
              }
              .close-btn {
                background: none;
                border: none;
                font-size: 1.5rem;
                cursor: pointer;
              }
              .log-entry {
                padding: 0.5rem;
                margin-bottom: 0.5rem;
                background: hsl(var(--muted));
                border-radius: var(--radius);
                font-family: monospace;
                font-size: 0.75rem;
                white-space: pre-wrap;
                word-break: break-all;
              }
              .actions { display: flex; gap: 0.25rem; flex-wrap: wrap; }
              .command-cell {
                max-width: 200px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              }
            `,
          }}
        />
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🕐 Cron 任务管理</h1>
            <button class="btn btn-primary" onclick="showCreateModal()">+ 新建任务</button>
          </div>

          <div class="card">
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>Cron</th>
                  <th>命令</th>
                  <th>状态</th>
                  <th>最后执行</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody id="jobs-table">
                <tr><td colspan={6}>加载中...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Create/Edit Modal */}
        <div class="modal" id="job-modal">
          <div class="modal-content">
            <div class="modal-header">
              <h2 id="modal-title">新建任务</h2>
              <button class="close-btn" onclick="closeModal()">&times;</button>
            </div>
            <form id="job-form" onsubmit="handleSubmit(event)">
              <input type="hidden" id="job-id" />
              <div class="form-group">
                <label for="job-name">名称</label>
                <input type="text" id="job-name" required placeholder="例如: 每日数据清理" />
              </div>
              <div class="form-group">
                <label for="job-cron">Cron 表达式</label>
                <input type="text" id="job-cron" required placeholder="0 2 * * *" />
              </div>
              <div class="form-group">
                <label for="job-command">Bash 命令</label>
                <textarea id="job-command" required placeholder="echo hello"></textarea>
              </div>
              <div class="form-group checkbox">
                <input type="checkbox" id="job-enabled" checked />
                <label for="job-enabled">启用</label>
              </div>
              <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                <button type="button" class="btn btn-muted" onclick="closeModal()">取消</button>
                <button type="submit" class="btn btn-primary">保存</button>
              </div>
            </form>
          </div>
        </div>

        {/* Log Modal */}
        <div class="modal" id="log-modal">
          <div class="modal-content">
            <div class="modal-header">
              <h2>执行日志</h2>
              <button class="close-btn" onclick="closeLogModal()">&times;</button>
            </div>
            <div id="log-content">加载中...</div>
          </div>
        </div>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              let jobs = [];

              async function loadJobs() {
                const res = await fetch('/api/cron/jobs');
                const data = await res.json();
                jobs = data.jobs || [];
                renderJobs();
              }

              function renderJobs() {
                const tbody = document.getElementById('jobs-table');
                if (jobs.length === 0) {
                  tbody.innerHTML = '<tr><td colspan="6">暂无任务</td></tr>';
                  return;
                }
                tbody.innerHTML = jobs.map(job => {
                  const lastLog = job._lastLog;
                  return '<tr>' +
                    '<td>' + escapeHtml(job.name) + '</td>' +
                    '<td><code>' + escapeHtml(job.cron) + '</code></td>' +
                    '<td class="command-cell" title="' + escapeHtml(job.command) + '">' + escapeHtml(job.command) + '</td>' +
                    '<td>' + (job.enabled ? '<span class="badge badge-success">启用</span>' : '<span class="badge badge-muted">禁用</span>') + '</td>' +
                    '<td>' + (lastLog ? formatTime(lastLog.executedAt) + (lastLog.exitCode === 0 ? ' ✅' : ' ❌') : '-') + '</td>' +
                    '<td class="actions">' +
                      '<button class="btn btn-sm btn-success" onclick="runJob(\\'' + job.id + '\\')">▶ 执行</button> ' +
                      '<button class="btn btn-sm btn-muted" onclick="showEditModal(\\'' + job.id + '\\')">✏ 编辑</button> ' +
                      '<button class="btn btn-sm btn-muted" onclick="showLogs(\\'' + job.id + '\\')">📋 日志</button> ' +
                      '<button class="btn btn-sm btn-danger" onclick="deleteJob(\\'' + job.id + '\\')">🗑 删除</button>' +
                    '</td>' +
                  '</tr>';
                }).join('');
              }

              function showCreateModal() {
                document.getElementById('modal-title').textContent = '新建任务';
                document.getElementById('job-id').value = '';
                document.getElementById('job-name').value = '';
                document.getElementById('job-cron').value = '';
                document.getElementById('job-command').value = '';
                document.getElementById('job-enabled').checked = true;
                document.getElementById('job-modal').classList.add('active');
              }

              async function showEditModal(jobId) {
                const job = jobs.find(j => j.id === jobId);
                if (!job) return;
                document.getElementById('modal-title').textContent = '编辑任务';
                document.getElementById('job-id').value = job.id;
                document.getElementById('job-name').value = job.name;
                document.getElementById('job-cron').value = job.cron;
                document.getElementById('job-command').value = job.command;
                document.getElementById('job-enabled').checked = job.enabled;
                document.getElementById('job-modal').classList.add('active');
              }

              function closeModal() {
                document.getElementById('job-modal').classList.remove('active');
              }

              async function handleSubmit(e) {
                e.preventDefault();
                const id = document.getElementById('job-id').value;
                const data = {
                  name: document.getElementById('job-name').value,
                  cron: document.getElementById('job-cron').value,
                  command: document.getElementById('job-command').value,
                  enabled: document.getElementById('job-enabled').checked,
                };

                const url = id ? '/api/cron/jobs/' + id : '/api/cron/jobs';
                const method = id ? 'PUT' : 'POST';

                const res = await fetch(url, {
                  method,
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(data),
                });

                if (res.ok) {
                  closeModal();
                  loadJobs();
                } else {
                  const err = await res.json();
                  alert('保存失败: ' + err.error);
                }
              }

              async function runJob(jobId) {
                const res = await fetch('/api/cron/jobs/' + jobId + '/run', { method: 'POST' });
                const data = await res.json();
                if (res.ok) {
                  alert('执行完成 (退出码: ' + data.result.exitCode + ')');
                  loadJobs();
                } else {
                  alert('执行失败: ' + data.error);
                }
              }

              async function deleteJob(jobId) {
                if (!confirm('确定删除此任务?')) return;
                const res = await fetch('/api/cron/jobs/' + jobId, { method: 'DELETE' });
                if (res.ok) {
                  loadJobs();
                }
              }

              async function showLogs(jobId) {
                document.getElementById('log-modal').classList.add('active');
                document.getElementById('log-content').textContent = '加载中...';

                const res = await fetch('/api/cron/jobs/' + jobId + '/logs');
                const data = await res.json();

                if (!data.logs || data.logs.length === 0) {
                  document.getElementById('log-content').innerHTML = '<p>暂无日志</p>';
                  return;
                }

                document.getElementById('log-content').innerHTML = data.logs.reverse().map(log =>
                  '<div class="log-entry">' +
                    '<div><strong>时间:</strong> ' + formatTime(log.executedAt) + ' | <strong>退出码:</strong> ' + log.exitCode + ' | <strong>耗时:</strong> ' + log.durationMs + 'ms</div>' +
                    (log.stdout ? '<pre>STDOUT: ' + escapeHtml(log.stdout) + '</pre>' : '') +
                    (log.stderr ? '<pre style="color: red;">STDERR: ' + escapeHtml(log.stderr) + '</pre>' : '') +
                  '</div>'
                ).join('');
              }

              function closeLogModal() {
                document.getElementById('log-modal').classList.remove('active');
              }

              function formatTime(iso) {
                return new Date(iso).toLocaleString('zh-CN');
              }

              function escapeHtml(str) {
                const div = document.createElement('div');
                div.textContent = str || '';
                return div.innerHTML;
              }

              loadJobs();
            `,
          }}
        />
      </body>
    </html>
  );
};
