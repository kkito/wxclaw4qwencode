# Cron 定时任务功能设计

## 概述

为 OwnClaw 添加 cron 定时任务功能,支持通过 Web 界面和 API 管理 bash 脚本的定时执行,配置和日志存储在 `~/.ownclaw/cron/` 目录。

## 存储结构

```
~/.ownclaw/cron/
├── jobs.json              # 任务索引列表
└── logs/
    ├── {jobId}.json       # 执行历史(时间/退出码/耗时/输出)
    └── {jobId}.log        # 原始执行日志(可选)
```

### jobs.json 格式

```json
[
  {
    "id": "job_abc123",
    "name": "每日数据清理",
    "cron": "0 2 * * *",
    "command": "rm -rf /tmp/old_data",
    "enabled": true,
    "createdAt": "2026-04-26T10:00:00.000Z",
    "updatedAt": "2026-04-26T10:00:00.000Z"
  }
]
```

### logs/{jobId}.json 格式

```json
[
  {
    "executedAt": "2026-04-26T02:00:00.000Z",
    "exitCode": 0,
    "durationMs": 1234,
    "stdout": "清理完成\n",
    "stderr": ""
  }
]
```

## API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/cron/jobs` | 列出所有任务 |
| `POST` | `/api/cron/jobs` | 创建任务(name, cron, command, enabled) |
| `GET` | `/api/cron/jobs/:id` | 获取单个任务详情 |
| `PUT` | `/api/cron/jobs/:id` | 更新任务(部分或全部字段) |
| `DELETE` | `/api/cron/jobs/:id` | 删除任务 |
| `POST` | `/api/cron/jobs/:id/run` | 手动触发执行 |
| `GET` | `/api/cron/jobs/:id/logs` | 查看执行日志 |
| `DELETE` | `/api/cron/jobs/:id/logs` | 清空日志 |

## 运行时架构

1. Web 服务器启动时调用 `loadCronJobs()` 读取 `~/.ownclaw/cron/jobs.json`
2. 遍历 `enabled=true` 的任务,使用 `node-cron` 注册调度
3. 定时器触发时通过 `child_process.exec` 异步执行 bash 命令
4. 捕获 stdout/stderr/exitCode 后追加写入日志文件

```
Web 服务器启动
    ↓
loadCronJobs() 读取 jobs.json
    ↓
遍历 enabled=true 的任务 → node-cron.schedule()
    ↓
定时器触发 → execAsync(command)
    ↓
捕获输出 → 写入 logs/{jobId}.json
```

## Web 界面

### 页面路径

`/cron`

### 功能模块

1. **任务列表**: 表格展示
   - 列: name, cron 表达式, enabled 状态, 最后执行时间, 最后执行状态
   - 操作按钮: 启用/禁用、手动执行、编辑、删除、查看日志

2. **新增/编辑表单**: 
   - 字段: name(文本), cron(文本), command(多行文本), enabled(开关)
   - cron 表达式前端验证

3. **日志查看器**: 
   - 侧边栏或弹窗展示历史执行记录
   - 按时间倒序,显示 executedAt, exitCode, durationMs, stdout, stderr

## 技术选型

| 组件 | 选择 | 理由 |
|------|------|------|
| 调度库 | `node-cron` | 纯 JS,无原生依赖,支持 cron 表达式 |
| bash 执行 | `child_process.exec` | Node.js 内置,异步非阻塞 |
| 配置验证 | `zod` | 与项目现有风格一致 |
| Web 界面 | Hono JSX + 内联样式 | 与现有 `/` 页面技术栈一致 |

## 安全考虑

- cron 表达式使用 `cron.validate()` 验证语法
- bash 命令执行前验证非空
- 不向 Web 暴露敏感系统信息
- 可选: 限制命令最大执行时间(超时终止)

## 测试策略

### 单元测试

| 测试对象 | 内容 |
|----------|------|
| `CronJobManager` | 加载/保存/创建/更新/删除任务, 文件读写 |
| `CronExecutor` | 执行 bash 命令, 捕获输出, 日志写入 |
| API 路由 | 请求验证, 响应格式, 错误处理 |
| 配置验证 | zod schema 正确拒绝非法输入 |

### 集成测试

| 场景 | 内容 |
|------|------|
| API 端到端 | CRUD 完整流程, 手动触发, 日志查询 |
| 调度执行 | 定时触发后日志文件正确写入 |
| 重启恢复 | 服务器重启后 cron 任务自动重新注册 |

### Mock 策略

- 使用临时目录(非真实 `~/.ownclaw`)隔离测试环境
- `vi.mock` 模拟文件系统或使用 `memfs`
- `vi.useFakeTimers()` 测试调度逻辑

## 文件结构

```
src/
├── cron/
│   ├── index.ts              # 统一导出
│   ├── types.ts              # TypeScript 类型定义
│   ├── schema.ts             # Zod 验证 schema
│   ├── store.ts              # jobs.json 读写
│   ├── executor.ts           # bash 命令执行 + 日志记录
│   ├── scheduler.ts          # node-cron 调度管理
│   └── manager.ts            # 高层管理器(组合以上模块)
├── web/
│   ├── server.tsx            # 新增 /api/cron/* 路由
│   └── views/
│       ├── index.tsx         # 现有首页
│       └── cron.tsx          # /cron 页面
```

## 配置目录

独立于微信配置:

| 路径 | 说明 |
|------|------|
| `~/.ownclaw/cron/jobs.json` | 任务列表 |
| `~/.ownclaw/cron/logs/` | 执行日志 |
| `~/.ownclaw/openclaw-weixin/` | 微信配置(不受影响) |
