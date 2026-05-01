# 测试指南

## 概述

OwnClaw 使用 **Vitest** 作为测试框架，包含三个层次的测试，覆盖从单元测试到 Web 页面/路由的集成测试。所有测试通过 `pnpm run test` 一键运行。

```
pnpm run test          # 监听模式（watch），开发时推荐
pnpm run test:run      # 单次运行全部测试
npx vitest run tests/web/  # 只运行 Web 相关测试
npx vitest run tests/acp-config/store.test.ts  # 运行单个测试文件
```

## 测试层次

### 1. 单元测试（Unit Tests）

**位置**: `tests/` 目录下，与 `src/` 目录结构对应

**测什么**: 单个函数或类的输入输出行为，所有外部依赖通过 `vi.mock()` 隔离。

**典型模块**:

| 测试文件 | 覆盖模块 | 关键场景 |
|---|---|---|
| `tests/acp-config/store.test.ts` | `src/acp-config/store.ts` | ACP 目录配置的读取/保存，保留其他配置字段 |
| `tests/acp-config/scanner.test.ts` | `src/acp-config/scanner.ts` | 扫描文件系统目录 |
| `tests/acp-config/selector.test.ts` | `src/acp-config/selector.ts` | 按序号匹配目录 |
| `tests/config-store.test.ts` | `src/config-store.ts` | 配置文件读取/保存 |
| `tests/config.test.ts` | `src/config.ts` | Zod 配置验证 |
| `tests/bridge/weixin-bridge.test.ts` | `src/bridge/weixin-bridge.ts` | 微信消息转换 |
| `tests/bridge/weixin-bridge-acp.test.ts` | ACP 模式下的桥接 | ACP 模式消息转发 |
| `tests/acp/client-streaming.test.ts` | `src/acp/client.ts` | ACP 客户端流式响应 |
| `tests/acp-session/manager.test.ts` | `src/acp-session/manager.ts` | ACP 会话生命周期 |
| `tests/acp-session/output.test.ts` | `src/acp-session/output.ts` | ACP 输出缓冲与微信发送 |
| `tests/slash-command/registry.test.ts` | `src/slash-command/registry.ts` | 命令注册/查找 |
| `tests/slash-command/loader.test.ts` | `src/slash-command/loader.ts` | 从文件系统加载命令 |
| `tests/slash-command/schema.test.ts` | `src/slash-command/schema.ts` | 命令 Schema 验证 |
| `tests/commands/acp.test.ts` | `src/commands/acp/handler.ts` | `/acp` 命令处理逻辑 |
| `tests/commands/builtin.test.ts` | 内置命令 | 内置命令注册 |
| `tests/cron/store.test.ts` | `src/cron/store.ts` | Cron 任务文件存储 |
| `tests/cron/executor.test.ts` | `src/cron/executor.ts` | Bash 命令执行 |
| `tests/cron/manager.test.ts` | `src/cron/manager.ts` | Cron 调度管理 |
| `tests/cron/schema.test.ts` | `src/cron/schema.ts` | Cron Schema 验证 |
| `tests/model/custom-model.test.ts` | `src/model/custom-model.ts` | 自定义模型 API 调用 |
| `tests/runner/agent-runner.test.ts` | `src/runner/agent-runner.ts` | Agent 生命周期 |
| `tests/skills/manager.test.ts` | `src/skills/manager.ts` | Skills 管理 |
| `tests/skills/store.test.ts` | `src/skills/store.ts` | Skills 文件存储 |
| `tests/utils/send-throttle.test.ts` | `src/utils/send-throttle.ts` | 消息发送限流 |
| `tests/utils/retry.test.ts` | `src/utils/retry.ts` | 重试工具 |
| `tests/cli/bind.test.ts` | CLI bind 命令 | 微信绑定 |
| `tests/cli/status.test.ts` | CLI status 命令 | 状态查询 |
| `tests/cli/unbind.test.ts` | CLI unbind 命令 | 微信解绑 |

### 2. Web 路由测试（Route Tests）

**位置**: `tests/web/acp-dirs.test.ts`、`tests/web/settings.test.ts`、`tests/web/server.test.ts`

**测什么**: 通过 `createWebServer()` 创建完整 Hono 应用，使用 `app.request()` 模拟 HTTP 请求，验证**路由注册、handler 处理、HTTP 响应**（状态码、Header、Body）。同时覆盖 Web API 端点。

**典型场景**:

| 测试文件 | 覆盖路由 | 测试内容 |
|---|---|---|
| `tests/web/server.test.ts` | `/health`、`/`、`/nonexistent` | 健康检查、首页、404、中间件日志 |
| `tests/web/index.test.ts` | `/` | 首页 HTML 输出 |
| `tests/web/acp-dirs.test.ts` | `GET/POST /settings/acp-dirs`、`GET/PUT /api/acp/dirs` | ACP 目录页面渲染、表单提交、重定向、API 读写与校验 |
| `tests/web/settings.test.ts` | `GET/POST /settings` | 设置页面渲染、ACP 入口链接、限流间隔保存与校验 |
| `tests/web/cron.test.ts` | `GET /cron`、`GET/POST/PUT/DELETE /api/cron/jobs/*` | Cron 页面渲染、列表/404 API |
| `tests/web/skills.test.ts` | `GET /skills`、`GET/POST/PUT/DELETE /api/skills/*` | Skills 页面渲染、CRUD API 校验 |

**测试模式**:
```typescript
import { createWebServer, WebServerConfig } from '../../src/web/server.js';

const config: WebServerConfig = { port: 0 };
const { app } = createWebServer(config);

// 模拟 GET 请求
const res = await app.request('/settings');
expect(res.status).toBe(200);

// 模拟 POST 表单
const formData = new FormData();
formData.append('intervalMs', '3000');
const res = await app.request('/settings', { method: 'POST', body: formData });

// 模拟 PUT JSON
const res = await app.request('/api/acp/dirs', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ dirs: ['/a', '/b'] }),
});
```

### 3. TSX 组件测试（Component Tests）

**位置**: `tests/web/index.test.ts`

**测什么**: 直接使用 `jsx(Component, props)` 渲染单个 TSX 组件，验证其输出的 HTML 内容。不经过路由，只测试组件本身的输出。

**典型场景**:

```typescript
import { IndexPage } from '../../src/web/views/index.js';
import { jsx } from 'hono/jsx';

it('should render with correct title and version', () => {
  const html = jsx(IndexPage, { title: 'TestApp', version: '2.0.0' }).toString();
  expect(html).toContain('<title>TestApp</title>');
  expect(html).toContain('v2.0.0');
});
```

**覆盖组件**:

| 测试文件 | 组件 | 验证点 |
|---|---|---|
| `tests/web/index.test.ts` | `IndexPage` | 标题、版本号、HTML 结构、CSS 样式、页脚版权 |

## Web 页面与路由对照

| 页面 | 路由 | 对应测试文件 |
|---|---|---|
| 首页 | `GET /` | `tests/web/index.test.ts`, `tests/web/server.test.ts` |
| Cron 管理 | `GET /cron` + `GET/POST/PUT/DELETE /api/cron/*` | `tests/web/cron.test.ts` |
| Skills 管理 | `GET /skills` + `GET/POST/PUT/DELETE /api/skills/*` | `tests/web/skills.test.ts` |
| 设置 | `GET/POST /settings` | `tests/web/settings.test.ts` |
| ACP 目录配置 | `GET/POST /settings/acp-dirs` + `GET/PUT /api/acp/dirs` | `tests/web/acp-dirs.test.ts` |

## CI / 本地验证

```bash
# 完整测试套件
pnpm run test:run

# 类型检查（编译）
pnpm run typecheck

# 构建（确保编译无错误）
pnpm run build

# 推荐：CI 前完整验证流程
pnpm run build && pnpm run typecheck && pnpm run test:run
```

## 编写新测试的约定

1. **单元测试**: 使用 `vi.mock()` 隔离所有外部依赖（fs、path 等），测试文件放在 `tests/` 下对应 `src/` 的目录结构
2. **Web 路由测试**: 使用 `createWebServer()` 创建应用，通过 `app.request()` 发送请求，测试文件放在 `tests/web/`
3. **TSX 组件测试**: 使用 `jsx(Component, props)` 直接渲染，测试文件放在 `tests/web/`
4. Mock 时注意 class 的 mock 方式 — `vi.mock()` 需要用 `class` 关键字或真实类，不能只用箭头函数

## 当前测试状态

| 类别 | 文件数 | 用例数 |
|---|---|---|
| 单元测试 | 30 | 220 |
| Web 路由测试 | 5 | 33 |
| TSX 组件测试 | 1 | 6 |
| **合计** | **36** | **259** |
