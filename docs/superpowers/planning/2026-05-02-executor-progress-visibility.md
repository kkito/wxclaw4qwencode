# Executor 进度可见性优化 - 实现计划

**日期：** 2026-05-02
**基于spec：** docs/superpowers/specs/2026-05-02-executor-progress-visibility-design.md

## 实现步骤

### 1. 类型定义和Schema（`src/executor/types.ts` + `src/executor/schema.ts`）
- 在 `LongTask` 接口新增 `updatedAt: string | null` 和 `latestOutput: string | null`
- 在 `LongTaskSchema` 新增对应字段验证
- 新增 `TaskProgress` 接口用于进度回调

### 2. Runner执行器（`src/executor/runner.ts`）
- 将 `onOutput` 回调改为 `onProgress`，包含 `updatedAt` 和 `latestOutput`
- 在 `agent_message_chunk` 触发时调用 `onProgress` 回调
- `latestOutput` 截取最后 200 字符

### 3. Manager管理器（`src/executor/manager.ts`）
- `executeTask` 方法在调用 `runner.run` 前立即设置 `startedAt` 和 `updatedAt`
- 传递 `onProgress` 回调给 runner，更新进展
- 任务完成时写入 `endedAt`、`updatedAt`、`latestOutput`
- `addTask` 和 `requeueTask` 初始化新字段为 null

### 4. Web页面（`src/web/views/executor.tsx`）
- 桌面端表格新增"最后更新"和"最新进展"两列
- 移动端卡片新增对应两行
- "最新进展"使用 `cell-ellipsis` 样式，`title` 显示完整内容

### 5. 单元测试
- `tests/executor/runner.test.ts`：测试 onProgress 回调、时间字段、latestOutput 截取
- `tests/executor/manager.test.ts`：测试 startedAt 提前设置、onProgress 触发、异常处理
- `tests/executor/store.test.ts`：测试 updateTask 合并、新字段保存
- `tests/executor/schema.test.ts`：测试 Schema 接受 null 和有效字符串、拒绝无效日期

## 文件变更清单

| 文件 | 操作 |
|------|------|
| `src/executor/types.ts` | 修改 |
| `src/executor/schema.ts` | 修改 |
| `src/executor/runner.ts` | 修改 |
| `src/executor/manager.ts` | 修改 |
| `src/web/views/executor.tsx` | 修改 |
| `tests/executor/runner.test.ts` | 新建/修改 |
| `tests/executor/manager.test.ts` | 新建/修改 |
| `tests/executor/store.test.ts` | 新建/修改 |
| `tests/executor/schema.test.ts` | 新建/修改 |
