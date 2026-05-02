# Executor 进度可见性优化设计文档

**日期：** 2026-05-02
**状态：** 待实现
**分支：** dev

## 目标

优化长程任务执行器的进度可见性，解决两个问题：

1. **开始时间显示滞后**：任务执行完成后才显示开始时间，改为任务开始执行时立即显示
2. **缺少进展反馈**：执行过程中无法看到 AI 的中间输出，新增"最后更新时间"和"最新进展"字段

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 开始时间 | 任务开始时立即写入 `startedAt` | 页面实时反馈，避免用户等待 |
| 进展更新 | 每次 AI 输出时调用 `store.updateTask` | 频率低（几分钟一次），文件 I/O 无压力 |
| 进展内容 | 截取最后 200 字符 | 足够了解当前状态，不占用过多页面空间 |
| 方案 | 最小改动（方案 A） | 避免过度设计，代码改动最小 |

## 架构概览

```
任务开始 → manager.executeTask(task)
              ↓
    立即写入 startedAt + updatedAt  ←── 新增：不再等待 runner 返回
              ↓
    runner.run(task, config, onProgress)
              ↓
    AI 输出文本 → onProgress({ updatedAt, latestOutput })
              ↓                         ↓
    累积完整文本              store.updateTask 更新进展  ←── 新增
              ↓
    任务完成 → 写入 endedAt + result + confirmResponse
```

## 模块变更

### 1. 类型定义（`src/executor/types.ts`）

**新增字段**：

```ts
export interface LongTask {
  // 现有字段...
  startedAt: string | null;
  endedAt: string | null;
  result: string | null;
  confirmResponse: string | null;
  createdAt: string;

  // 新增字段
  updatedAt: string | null;      // 最后更新时间（状态变化或 AI 输出时更新）
  latestOutput: string | null;   // 最新 AI 输出摘要（最后 200 字符）
}
```

### 2. Schema 验证（`src/executor/schema.ts`）

**新增字段验证**：

```ts
export const LongTaskSchema = z.object({
  // 现有字段...
  updatedAt: z.string().nullable(),
  latestOutput: z.string().nullable(),
});
```

### 3. Runner 执行器（`src/executor/runner.ts`）

**变更**：`onOutput` 回调改为 `onProgress`，包含时间和内容

```ts
export interface TaskProgress {
  updatedAt: string;
  latestOutput: string;  // 最近一次 AI 输出片段（最后 200 字符）
}

// run() 签名变更：
async run(
  task: LongTask,
  config: ExecutorConfig,
  onProgress?: (progress: TaskProgress) => void,
): Promise<TaskResult>
```

**执行中触发进度更新**：

```ts
client.setSessionUpdateCallback((update: SessionUpdate) => {
  if (update.sessionUpdate === 'agent_message_chunk' && 'content' in update) {
    const content = update.content as { type: string; text?: string };
    if (content.type === 'text' && content.text) {
      if (stage === 'initial') {
        accumulatedText += content.text;
      } else {
        confirmAccumulatedText += content.text;
      }
      if (onProgress) {
        onProgress({
          updatedAt: new Date().toISOString(),
          latestOutput: accumulatedText.slice(-200),
        });
      }
    }
  }
});
```

### 4. Manager 管理器（`src/executor/manager.ts`）

**变更 1：任务开始时立即设置时间**

```ts
private async executeTask(task: LongTask): Promise<void> {
  this.isExecuting = true;

  const now = new Date().toISOString();
  this.store.updateTask(task.id, {
    status: 'running',
    startedAt: now,
    updatedAt: now,
    latestOutput: null,
  });

  const config = this.store.loadConfig();
  const result = await this.runner.run(task, config, (progress) => {
    this.store.updateTask(task.id, {
      updatedAt: progress.updatedAt,
      latestOutput: progress.latestOutput,
    });
  });

  this.store.updateTask(task.id, {
    status: result.status,
    startedAt: result.startedAt,  // runner 返回的也写入（保持一致）
    endedAt: result.endedAt,
    updatedAt: result.endedAt,     // 新增
    latestOutput: progress?.latestOutput ?? null,  // 保留最后进展
    result: result.result ?? null,
    confirmResponse: result.confirmResponse ?? null,
  });
}
```

**变更 2：`addTask` 和 `requeueTask` 初始化新字段**

```ts
// addTask 中：
{
  // ...
  updatedAt: null,
  latestOutput: null,
}

// requeueTask 中：
{
  status: 'pending',
  startedAt: null,
  endedAt: null,
  updatedAt: null,
  latestOutput: null,
  result: null,
  confirmResponse: null,
}
```

### 5. Web 页面（`src/web/views/executor.tsx`）

**桌面端表格新增两列**：

```html
<thead>
  <tr>
    <!-- 现有列... -->
    <th>最后更新</th>
    <th>最新进展</th>
    <th>操作</th>
  </tr>
</thead>
<tbody>
  {tasks.map((task) => (
    <tr>
      <!-- 现有单元格... -->
      <td>{task.updatedAt ? new Date(task.updatedAt).toLocaleString('zh-CN') : '-'}</td>
      <td class="cell-ellipsis" title={task.latestOutput ?? ''}>
        {task.latestOutput ?? '-'}
      </td>
      <!-- 操作列... -->
    </tr>
  ))}
</tbody>
```

**移动端卡片新增两行**：

```html
<div class="task-row">
  <span class="label">更新</span>
  <span class="value">{task.updatedAt ? new Date(task.updatedAt).toLocaleString('zh-CN') : '-'}</span>
</div>
{task.latestOutput ? (
  <div class="task-row">
    <span class="label">进展</span>
    <span class="value">{task.latestOutput}</span>
  </div>
) : null}
```

## 测试策略

### 1. `tests/executor/runner.test.ts` — ExecutorRunner

| 测试用例 | 验证内容 |
|----------|----------|
| `onProgress 回调在 AI 输出时被调用` | 每次 `agent_message_chunk` 触发 `onProgress` |
| `latestOutput 截取最后 200 字符` | 累积文本超过 200 字符时只保留最后 200 |
| `startedAt 和 endedAt 正确记录（成功）` | 成功场景时间字段完整 |
| `startedAt 和 endedAt 正确记录（失败）` | 失败场景时间字段完整 |
| `startedAt 和 endedAt 正确记录（超时）` | 超时场景时间字段完整 |

### 2. `tests/executor/manager.test.ts` — ExecutorManager

| 测试用例 | 验证内容 |
|----------|----------|
| `任务开始时立即设置 startedAt 和 updatedAt` | `store.updateTask` 在 `runner.run` 调用前被调用 |
| `onProgress 回调触发 store.updateTask` | 每次 AI 输出时进展字段被更新 |
| `任务结束时写入 endedAt 和 updatedAt` | 完成状态下时间字段完整 |
| `异常情况下时间字段完整性` | 失败/超时时 startedAt 和 endedAt 均存在 |
| `addTask 初始化新字段` | 新任务的 updatedAt 和 latestOutput 为 null |
| `requeueTask 重置新字段` | 重新入队后 updatedAt 和 latestOutput 为 null |

### 3. `tests/executor/store.test.ts` — LongTaskStore

| 测试用例 | 验证内容 |
|----------|----------|
| `updateTask 合并新字段` | 更新部分字段时不丢失其他字段 |
| `saveTasks 验证新字段` | Zod schema 正确验证 updatedAt 和 latestOutput |

### 4. `tests/executor/schema.test.ts` — Schema 验证

| 测试用例 | 验证内容 |
|----------|----------|
| `LongTaskSchema 接受 null 值` | updatedAt 和 latestOutput 允许 null |
| `LongTaskSchema 接受有效字符串` | ISO 日期格式通过验证 |
| `LongTaskSchema 拒绝无效日期` | 非日期格式字符串被拒绝 |

### 测试策略

- 使用 Vitest
- Mock `AcpClient` 避免真实网络调用
- 用临时目录作为 `stateDir`，测试后清理

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/executor/types.ts` | 修改 | 新增 `updatedAt`、`latestOutput` 字段 |
| `src/executor/schema.ts` | 修改 | 新增字段验证 |
| `src/executor/runner.ts` | 修改 | `onOutput` → `onProgress`，触发进度更新 |
| `src/executor/manager.ts` | 修改 | 提前设置 `startedAt`，接收进度回调 |
| `src/web/views/executor.tsx` | 修改 | 表格和卡片新增两列 |
| `tests/executor/runner.test.ts` | 新建/修改 | Runner 相关测试 |
| `tests/executor/manager.test.ts` | 新建/修改 | Manager 相关测试 |
| `tests/executor/store.test.ts` | 新建/修改 | Store 相关测试 |
| `tests/executor/schema.test.ts` | 新建/修改 | Schema 相关测试 |

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 频繁文件写入影响性能 | AI 输出频率低（几分钟一次），每次写入无压力 |
| 崩溃丢失最新进展 | 最多丢失一次 AI 输出，不影响任务最终结果 |
| 200 字符不够用 | 页面 `title` 悬浮显示完整 200 字符，可后续调整 |
