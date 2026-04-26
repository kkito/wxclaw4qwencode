// src/web/views/skills.tsx

import type { FC } from 'hono/jsx';

export const SkillsPage: FC = () => {
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>OwnClaw - Skills 管理</title>
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
                max-width: 700px;
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
              .actions { display: flex; gap: 0.25rem; flex-wrap: wrap; }
              .desc-cell {
                max-width: 300px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              }
              .nav-links {
                display: flex;
                gap: 1rem;
                margin-bottom: 1rem;
              }
              .nav-links a {
                color: #667eea;
                text-decoration: none;
              }
              .nav-links a:hover { text-decoration: underline; }
            `,
          }}
        />
      </head>
      <body>
        <div class="container">
          <div class="nav-links">
            <a href="/">🏠 首页</a>
            <a href="/cron">🕐 Cron</a>
            <a href="/skills">🎯 Skills</a>
          </div>
          <div class="header">
            <h1>🎯 Skills 管理</h1>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-success" onclick="showInstallModal()">📦 从 GitHub 安装</button>
              <button class="btn btn-primary" onclick="showCreateModal()">+ 新建 Skill</button>
            </div>
          </div>

          <div class="card">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>名称</th>
                  <th>描述</th>
                  <th>文件数</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody id="skills-table">
                <tr><td colspan={5}>加载中...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Create/Edit Modal */}
        <div class="modal" id="skill-modal">
          <div class="modal-content">
            <div class="modal-header">
              <h2 id="modal-title">新建 Skill</h2>
              <button class="close-btn" onclick="closeModal()">&times;</button>
            </div>
            <form id="skill-form" onsubmit="handleSubmit(event)">
              <input type="hidden" id="skill-id" />
              <div class="form-group">
                <label for="skill-id-input">ID（唯一，仅创建时设置）</label>
                <input type="text" id="skill-id-input" placeholder="例如: data-analyst" />
              </div>
              <div class="form-group">
                <label for="skill-md">SKILL.md 内容（YAML frontmatter + 正文）</label>
                <textarea id="skill-md" required placeholder={'---\nname: My Skill\ndescription: Description\n---\n\n# My Skill\n\nInstructions...'} style={{ minHeight: '200px', fontFamily: 'monospace' }} />
              </div>
              <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                <button type="button" class="btn btn-muted" onclick="closeModal()">取消</button>
                <button type="submit" class="btn btn-primary">保存</button>
              </div>
            </form>
          </div>
        </div>

        {/* Files Modal */}
        <div class="modal" id="files-modal">
          <div class="modal-content">
            <div class="modal-header">
              <h2 id="files-modal-title">文件列表</h2>
              <button class="close-btn" onclick="closeFilesModal()">&times;</button>
            </div>
            <div id="files-list">加载中...</div>
            <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
              <button class="btn btn-sm btn-primary" onclick="showUploadForm()">+ 上传文件</button>
            </div>
          </div>
        </div>

        {/* File Content Modal */}
        <div class="modal" id="file-content-modal">
          <div class="modal-content">
            <div class="modal-header">
              <h2 id="file-content-title">文件内容</h2>
              <button class="close-btn" onclick="closeFileContentModal()">&times;</button>
            </div>
            <pre id="file-content" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '60vh', overflow: 'auto' }}></pre>
          </div>
        </div>

        {/* Install Modal */}
        <div class="modal" id="install-modal">
          <div class="modal-content">
            <div class="modal-header">
              <h2>从 GitHub 安装 Skills</h2>
              <button class="close-btn" onclick="closeInstallModal()">&times;</button>
            </div>
            <form id="install-form" onsubmit="handleInstall(event)">
              <div class="form-group">
                <label for="install-repo">GitHub 仓库地址（格式：owner/repo）</label>
                <input type="text" id="install-repo" required placeholder="例如: anthropics/skills" />
              </div>
              <div class="form-group">
                <label for="install-branch">分支名（可选）</label>
                <input type="text" id="install-branch" placeholder="默认: main" />
              </div>
              <div id="install-result" style="display: none; margin-top: 1rem;"></div>
              <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem;">
                <button type="button" class="btn btn-muted" onclick="closeInstallModal()">取消</button>
                <button type="submit" class="btn btn-success" id="install-btn">安装</button>
              </div>
            </form>
          </div>
        </div>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              let skills = [];
              let currentSkillId = null;

              async function loadSkills() {
                const res = await fetch('/api/skills');
                const data = await res.json();
                skills = data.skills || [];
                renderSkills();
              }

              function renderSkills() {
                const tbody = document.getElementById('skills-table');
                if (skills.length === 0) {
                  tbody.innerHTML = '<tr><td colspan="5">暂无 Skills，点击上方按钮创建</td></tr>';
                  return;
                }
                tbody.innerHTML = skills.map(skill => {
                  return '<tr>' +
                    '<td><code>' + escapeHtml(skill.id) + '</code></td>' +
                    '<td>' + escapeHtml(skill.name || skill.id) + '</td>' +
                    '<td class="desc-cell" title="' + escapeHtml(skill.description) + '">' + escapeHtml(skill.description || '-') + '</td>' +
                    '<td>' + (skill.files ? skill.files.length : 0) + '</td>' +
                    '<td class="actions">' +
                      '<button class="btn btn-sm btn-muted" onclick="showFiles(\\'' + skill.id + '\\')">📁 文件</button> ' +
                      '<button class="btn btn-sm btn-muted" onclick="showEditModal(\\'' + skill.id + '\\')">✏ 编辑</button> ' +
                      '<button class="btn btn-sm btn-danger" onclick="deleteSkill(\\'' + skill.id + '\\')">🗑 删除</button>' +
                    '</td>' +
                  '</tr>';
                }).join('');
              }

              function showCreateModal() {
                currentSkillId = null;
                document.getElementById('modal-title').textContent = '新建 Skill';
                document.getElementById('skill-id').value = '';
                document.getElementById('skill-id-input').value = '';
                document.getElementById('skill-id-input').disabled = false;
                document.getElementById('skill-md').value = '';
                document.getElementById('skill-modal').classList.add('active');
              }

              async function showEditModal(skillId) {
                currentSkillId = skillId;
                const res = await fetch('/api/skills/' + skillId);
                const data = await res.json();
                const skill = data.skill;
                if (!skill) return;

                document.getElementById('modal-title').textContent = '编辑 Skill';
                document.getElementById('skill-id').value = skill.id;
                document.getElementById('skill-id-input').value = skill.id;
                document.getElementById('skill-id-input').disabled = true;
                document.getElementById('skill-md').value = skill.content || '';
                document.getElementById('skill-modal').classList.add('active');
              }

              function closeModal() {
                document.getElementById('skill-modal').classList.remove('active');
              }

              async function handleSubmit(e) {
                e.preventDefault();
                const id = document.getElementById('skill-id').value;
                const skillMd = document.getElementById('skill-md').value;

                const url = id ? '/api/skills/' + id : '/api/skills';
                const method = id ? 'PUT' : 'POST';
                const body = id ? { skillMd } : { id: document.getElementById('skill-id-input').value, skillMd };

                const res = await fetch(url, {
                  method,
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                });

                if (res.ok) {
                  closeModal();
                  loadSkills();
                } else {
                  const err = await res.json();
                  alert('保存失败: ' + err.error);
                }
              }

              async function deleteSkill(skillId) {
                if (!confirm('确定删除此 Skill? 其目录下所有文件都将被删除。')) return;
                const res = await fetch('/api/skills/' + skillId, { method: 'DELETE' });
                if (res.ok) {
                  loadSkills();
                } else {
                  alert('删除失败: ' + (await res.json()).error);
                }
              }

              async function showFiles(skillId) {
                currentSkillId = skillId;
                document.getElementById('files-modal-title').textContent = '文件 - ' + skillId;
                document.getElementById('files-list').innerHTML = '加载中...';
                document.getElementById('files-modal').classList.add('active');

                const res = await fetch('/api/skills/' + skillId + '/files');
                const data = await res.json();

                if (!data.files || data.files.length === 0) {
                  document.getElementById('files-list').innerHTML = '<p>暂无附加文件</p>';
                  return;
                }

                document.getElementById('files-list').innerHTML = data.files.map(f =>
                  '<div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem;margin-bottom:0.5rem;background:hsl(var(--muted));border-radius:var(--radius);">' +
                    '<span>' + escapeHtml(f) + '</span>' +
                    '<div style="display:flex;gap:0.25rem;">' +
                      '<button class="btn btn-sm btn-muted" onclick="viewFile(\\'' + skillId + '\\', \\'' + f + '\\')">查看</button>' +
                      '<button class="btn btn-sm btn-danger" onclick="deleteFile(\\'' + skillId + '\\', \\'' + f + '\\')">删除</button>' +
                    '</div>' +
                  '</div>'
                ).join('');
              }

              function closeFilesModal() {
                document.getElementById('files-modal').classList.remove('active');
              }

              async function viewFile(skillId, filename) {
                const res = await fetch('/api/skills/' + skillId + '/files/' + filename);
                const data = await res.json();

                document.getElementById('file-content-title').textContent = filename;
                document.getElementById('file-content').textContent = data.content || '(空文件)';
                document.getElementById('file-content-modal').classList.add('active');
              }

              function closeFileContentModal() {
                document.getElementById('file-content-modal').classList.remove('active');
              }

              async function showUploadForm() {
                const filename = prompt('文件名（如 schema.sql）:');
                if (!filename) return;
                const content = prompt('文件内容:');
                if (content === null) return;

                const res = await fetch('/api/skills/' + currentSkillId + '/files', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ filename, content }),
                });

                if (res.ok) {
                  showFiles(currentSkillId);
                } else {
                  const err = await res.json();
                  alert('上传失败: ' + err.error);
                }
              }

              async function deleteFile(skillId, filename) {
                if (!confirm('确定删除文件 ' + filename + '?')) return;
                const res = await fetch('/api/skills/' + skillId + '/files/' + filename, { method: 'DELETE' });
                if (res.ok) {
                  showFiles(skillId);
                } else {
                  alert('删除失败: ' + (await res.json()).error);
                }
              }

              function escapeHtml(str) {
                const div = document.createElement('div');
                div.textContent = str || '';
                return div.innerHTML;
              }

              function showInstallModal() {
                document.getElementById('install-repo').value = '';
                document.getElementById('install-branch').value = '';
                document.getElementById('install-result').style.display = 'none';
                document.getElementById('install-btn').disabled = false;
                document.getElementById('install-modal').classList.add('active');
              }

              function closeInstallModal() {
                document.getElementById('install-modal').classList.remove('active');
              }

              async function handleInstall(e) {
                e.preventDefault();
                const repo = document.getElementById('install-repo').value.trim();
                const branch = document.getElementById('install-branch').value.trim() || undefined;

                const btn = document.getElementById('install-btn');
                const resultDiv = document.getElementById('install-result');
                btn.disabled = true;
                btn.textContent = '安装中...';
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = '<p>正在从 GitHub 下载...</p>';

                try {
                  const res = await fetch('/api/skills/install', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ repo, branch }),
                  });

                  const data = await res.json();

                  if (!res.ok) {
                    resultDiv.innerHTML = '<p style="color: hsl(var(--danger));">安装失败: ' + escapeHtml(data.error) + '</p>';
                    btn.disabled = false;
                    btn.textContent = '安装';
                    return;
                  }

                  let html = '<div style="padding: 1rem; background: hsl(var(--success) / 0.1); border-radius: var(--radius);">';
                  html += '<p style="color: hsl(var(--success)); font-weight: 600;">✅ 安装成功</p>';
                  html += '<p>成功安装: ' + data.installed.length + ' 个 Skills</p>';
                  if (data.installed.length > 0) {
                    html += '<ul>' + data.installed.map(s => '<li><strong>' + escapeHtml(s.name || s.id) + '</strong> - ' + escapeHtml(s.description || '') + '</li>').join('') + '</ul>';
                  }
                  if (data.skipped.length > 0) {
                    html += '<p style="color: hsl(var(--muted-foreground)); margin-top: 0.5rem;">跳过 (已存在): ' + data.skipped.join(', ') + '</p>';
                  }
                  html += '</div>';
                  resultDiv.innerHTML = html;
                  btn.textContent = '完成';

                  // 延迟关闭并刷新列表
                  setTimeout(() => {
                    closeInstallModal();
                    loadSkills();
                  }, 2000);
                } catch (err) {
                  resultDiv.innerHTML = '<p style="color: hsl(var(--danger));">安装失败: ' + escapeHtml(err.message || '网络错误') + '</p>';
                  btn.disabled = false;
                  btn.textContent = '安装';
                }
              }

              loadSkills();
            `,
          }}
        />
      </body>
    </html>
  );
};
