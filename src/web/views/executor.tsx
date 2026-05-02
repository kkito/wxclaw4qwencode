import type { FC } from 'hono/jsx';
import type { LongTask, TaskStatus, ExecutorConfig } from '../../executor/types.js';

export interface ExecutorPageProps {
  tasks: LongTask[];
  config: ExecutorConfig;
  isEnabled: boolean;
  isExecuting: boolean;
  currentTask: LongTask | null;
  projectDirs: string[];
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: '等待中',
  running: '执行中',
  success: '成功',
  failed: '失败',
  timeout: '超时',
};

const STATUS_CLASS: Record<TaskStatus, string> = {
  pending: 'badge-muted',
  running: 'badge-run',
  success: 'badge-success',
  failed: 'badge-danger',
  timeout: 'badge-warn',
};

export const ExecutorPage: FC<ExecutorPageProps> = ({
  tasks,
  config,
  isEnabled,
  isExecuting,
  currentTask,
  projectDirs,
}) => {
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>OwnClaw - 长程任务执行器</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              :root {
                --background: 0 0% 100%;
                --foreground: 222.2 84% 4.9%;
                --card: 0 0% 100%;
                --muted: 210 40% 96.1%;
                --muted-foreground: 215.4 16.3% 46.9%;
                --border: 214.3 31.8% 91.4%;
                --radius: 0.5rem;
                --success: 142 76% 36%;
                --danger: 0 84% 60%;
                --warn: 38 92% 50%;
                --run: 217 91% 60%;
              }
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: hsl(var(--background)); color: hsl(var(--foreground)); line-height: 1.6; }
              .container { max-width: 1400px; margin: 0 auto; padding: 2rem; }
              .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid hsl(var(--border)); }
              .header h1 { font-size: 2rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
              .btn { padding: 0.5rem 1rem; border: none; border-radius: var(--radius); cursor: pointer; font-size: 0.875rem; }
              .btn:hover { opacity: 0.8; }
              .btn-primary { background: #667eea; color: white; }
              .btn-success { background: hsl(var(--success)); color: white; }
              .btn-danger { background: hsl(var(--danger)); color: white; }
              .btn-warn { background: hsl(var(--warn)); color: white; }
              .btn-muted { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
              .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
              .card { background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: var(--radius); padding: 1.5rem; margin-bottom: 1rem; }
              .card h2 { margin-bottom: 1rem; font-size: 1.25rem; }
              .form-group { margin-bottom: 1rem; }
              .form-group label { display: block; margin-bottom: 0.25rem; font-weight: 500; font-size: 0.875rem; }
              .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 0.5rem; border: 1px solid hsl(var(--border)); border-radius: var(--radius); font-family: inherit; }
              .form-group textarea { min-height: 60px; resize: vertical; }
              table { width: 100%; border-collapse: collapse; }
              th, td { padding: 0.5rem; text-align: left; border-bottom: 1px solid hsl(var(--border)); font-size: 0.8rem; }
              th { font-weight: 600; }
              .badge { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.7rem; font-weight: 500; }
              .badge-success { background: hsl(var(--success) / 0.1); color: hsl(var(--success)); }
              .badge-muted { background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }
              .badge-danger { background: hsl(var(--danger) / 0.1); color: hsl(var(--danger)); }
              .badge-warn { background: hsl(var(--warn) / 0.1); color: hsl(var(--warn)); }
              .badge-run { background: hsl(var(--run) / 0.1); color: hsl(var(--run)); }
              .actions { display: flex; gap: 0.25rem; flex-wrap: wrap; }
              .status-bar { display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem; }
              .status-indicator { padding: 0.5rem 1rem; border-radius: var(--radius); font-weight: 500; }
              .status-on { background: hsl(var(--run) / 0.1); color: hsl(var(--run)); }
              .status-off { background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }
              .flow-desc { font-size: 0.85rem; color: hsl(var(--muted-foreground)); line-height: 1.8; }
              .flow-desc code { background: hsl(var(--muted)); padding: 0.1rem 0.3rem; border-radius: 0.25rem; font-size: 0.8rem; }
              .cell-ellipsis { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
              .cell-result { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
              .task-card { background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: var(--radius); padding: 1rem; margin-bottom: 0.75rem; }
              .task-row { display: flex; justify-content: space-between; align-items: flex-start; padding: 0.3rem 0; font-size: 0.85rem; }
              .task-row .label { color: hsl(var(--muted-foreground)); flex-shrink: 0; width: 70px; }
              .task-row .value { flex: 1; word-break: break-all; }
              .task-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid hsl(var(--border)); }
              .task-actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid hsl(var(--border)); }
              @media (min-width: 768px) {
                .task-cards-mobile { display: none; }
                .task-table-wrap { display: block; }
              }
              @media (max-width: 767px) {
                .task-cards-mobile { display: block; }
                .task-table-wrap { display: none; }
              }
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              async function loadSpecs(projectPath) {
                const select = document.getElementById('specPath');
                if (!projectPath) {
                  select.innerHTML = '<option value="">请先选择项目...</option>';
                  return;
                }
                select.innerHTML = '<option value="">加载中...</option>';
                try {
                  const res = await fetch('/api/executor/specs?project=' + encodeURIComponent(projectPath));
                  const data = await res.json();
                  if (data.specs && data.specs.length > 0) {
                    select.innerHTML = '<option value="">选择 Spec...</option>' +
                      data.specs.map(s => '<option value="' + s.fullPath + '">' + s.filename + '</option>').join('');
                  } else {
                    select.innerHTML = '<option value="">该项目无 Spec 文件</option>';
                  }
                } catch (e) {
                  select.innerHTML = '<option value="">加载失败</option>';
                }
              }
            `,
          }}
        />
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚀 长程任务执行器</h1>
          </div>

          {/* 流程说明 */}
          <div class="card">
            <h2>执行流程</h2>
            <div class="flow-desc">
              <p>1. 添加任务：指定 <code>项目目录</code> + <code>Spec 文件</code>，填写提示词（可选，留空使用全局默认）</p>
              <p>2. 开启执行器：执行器按顺序逐个执行 <code>pending</code> 状态的任务</p>
              <p>3. 任务执行：启动 <code>qwen --acp</code> → 发送 <code>Spec路径 + 初始提示词</code> → 等待 AI 自主完成</p>
              <p>4. 完成确认：正常结束后发送 <code>确认提示词</code>，用 AI 的回复作为最终结果</p>
              <p>5. 异常处理：30 分钟无响应标记 <code>超时</code>；非正常退出标记 <code>失败</code></p>
            </div>
          </div>

          {/* 全局配置 */}
          <div class="card">
            <h2>全局配置</h2>
            <form action="/executor/config" method="post">
              <div class="form-group">
                <label>默认初始提示词</label>
                <textarea name="defaultInitialPrompt">{config.defaultInitialPrompt}</textarea>
              </div>
              <div class="form-group">
                <label>默认确认提示词</label>
                <textarea name="defaultConfirmPrompt">{config.defaultConfirmPrompt}</textarea>
              </div>
              <button type="submit" class="btn btn-primary">保存配置</button>
            </form>
          </div>

          {/* 执行器控制 */}
          <div class="card">
            <div class="status-bar">
              <span>执行器状态：</span>
              {isEnabled ? (
                isExecuting ? (
                  <span class="status-indicator status-on">
                    执行中 {currentTask ? `— ${currentTask.specPath}` : ''}
                  </span>
                ) : (
                  <span class="status-indicator status-on">已开启 (空闲)</span>
                )
              ) : (
                <span class="status-indicator status-off">已关闭</span>
              )}
            </div>
            {isEnabled ? (
              <form action="/executor/stop" method="post" style="display:inline;">
                <button type="submit" class="btn btn-warn" disabled={isExecuting}>关闭执行器</button>
              </form>
            ) : (
              <form action="/executor/start" method="post" style="display:inline;">
                <button type="submit" class="btn btn-success">开启执行器</button>
              </form>
            )}
          </div>

          {/* 添加任务 */}
          <div class="card">
            <h2>添加任务</h2>
            <form action="/executor/tasks" method="post">
              <div class="form-group">
                <label>项目目录</label>
                <select name="projectId" id="projectId" required onchange="loadSpecs(this.value)">
                  <option value="">选择项目...</option>
                  {projectDirs.map((d) => <option value={d}>{d}</option>)}
                </select>
              </div>
              <div class="form-group">
                <label>Spec 文件</label>
                <select name="specPath" id="specPath" required>
                  <option value="">请先选择项目...</option>
                </select>
              </div>
              <div class="form-group">
                <label>初始提示词（可选，留空使用全局默认）</label>
                <textarea name="initialPrompt" placeholder="留空使用全局默认"></textarea>
              </div>
              <div class="form-group">
                <label>确认提示词（可选，留空使用全局默认）</label>
                <textarea name="confirmPrompt" placeholder="留空使用全局默认"></textarea>
              </div>
              <button type="submit" class="btn btn-primary">添加任务</button>
            </form>
          </div>

          {/* 任务列表 */}
          <div class="card">
            <h2>任务列表</h2>
            {tasks.length === 0 ? (
              <p style={{ color: 'hsl(var(--muted-foreground))' }}>暂无任务</p>
            ) : (
              <>
                {/* 移动端卡片视图 */}
                <div class="task-cards-mobile">
                  {tasks.map((task) => (
                    <div class="task-card">
                      <div class="task-header">
                        <code style={{ fontSize: '0.8rem' }}>{task.id}</code>
                        <span class={`badge badge-${STATUS_CLASS[task.status]}`}>{STATUS_LABELS[task.status]}</span>
                      </div>
                      <div class="task-row"><span class="label">项目</span><span class="value">{task.projectId}</span></div>
                      <div class="task-row"><span class="label">Spec</span><span class="value">{task.specPath}</span></div>
                      <div class="task-row"><span class="label">开始</span><span class="value">{task.startedAt ? new Date(task.startedAt).toLocaleString('zh-CN') : '-'}</span></div>
                      <div class="task-row"><span class="label">结束</span><span class="value">{task.endedAt ? new Date(task.endedAt).toLocaleString('zh-CN') : '-'}</span></div>
                      <div class="task-row"><span class="label">更新</span><span class="value">{task.updatedAt ? new Date(task.updatedAt).toLocaleString('zh-CN') : '-'}</span></div>
                      {task.result ? <div class="task-row"><span class="label">结果</span><span class="value">{task.result}</span></div> : null}
                      {task.confirmResponse ? <div class="task-row"><span class="label">确认</span><span class="value">{task.confirmResponse}</span></div> : null}
                      {task.latestOutput ? (
                        <div class="task-row"><span class="label">进展</span><span class="value">{task.latestOutput}</span></div>
                      ) : null}
                      <div class="task-actions">
                        {task.status !== 'pending' && task.status !== 'running' ? (
                          <form action={`/executor/tasks/${task.id}/requeue`} method="post" style="display:inline;">
                            <button type="submit" class="btn btn-sm btn-muted">重新入队</button>
                          </form>
                        ) : null}
                        <form action={`/executor/tasks/${task.id}/delete`} method="post" style="display:inline;" onsubmit="return confirm('确定删除?')">
                          <button type="submit" class="btn btn-sm btn-danger">删除</button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 桌面端表格视图 */}
                <div class="task-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>项目</th>
                        <th>Spec</th>
                        <th>状态</th>
                        <th>开始</th>
                        <th>结束</th>
                        <th>最后更新</th>
                        <th>结果</th>
                        <th>确认回复</th>
                        <th>最新进展</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((task) => (
                        <tr>
                          <td><code>{task.id}</code></td>
                          <td class="cell-ellipsis" title={task.projectId}>{task.projectId}</td>
                          <td class="cell-ellipsis" title={task.specPath}>{task.specPath}</td>
                          <td><span class={`badge badge-${STATUS_CLASS[task.status]}`}>{STATUS_LABELS[task.status]}</span></td>
                          <td>{task.startedAt ? new Date(task.startedAt).toLocaleString('zh-CN') : '-'}</td>
                          <td>{task.endedAt ? new Date(task.endedAt).toLocaleString('zh-CN') : '-'}</td>
                          <td>{task.updatedAt ? new Date(task.updatedAt).toLocaleString('zh-CN') : '-'}</td>
                          <td class="cell-result" title={task.result ?? ''}>{task.result ?? '-'}</td>
                          <td class="cell-result" title={task.confirmResponse ?? ''}>{task.confirmResponse ?? '-'}</td>
                          <td class="cell-ellipsis" title={task.latestOutput ?? ''}>{task.latestOutput ?? '-'}</td>
                          <td class="actions">
                            {task.status !== 'pending' && task.status !== 'running' ? (
                              <form action={`/executor/tasks/${task.id}/requeue`} method="post" style="display:inline;">
                                <button type="submit" class="btn btn-sm btn-muted">重新入队</button>
                              </form>
                            ) : null}
                            <form action={`/executor/tasks/${task.id}/delete`} method="post" style="display:inline;" onsubmit="return confirm('确定删除?')">
                              <button type="submit" class="btn btn-sm btn-danger">删除</button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </body>
    </html>
  );
};
