# 模型配置 Web 管理与热加载设计

**日期**: 2026-05-04
**状态**: 待实现
**关联**: `docs/superpowers/specs/2026-04-26-sysprompt-web-management-design.md`

## 概述

将模型配置（baseUrl、apiKey、modelName、sysPrompt）从环境变量迁移到 `config.json` 文件存储，提供 Web 后台配置页面，支持热加载生效。

## 架构

### 整体数据流

```
启动时
  → config.ts 不再强制要求环境变量存在
  → AgentRunner 尝试从 config-store 加载模型配置
  → 如果未配置：服务正常启动，微信消息到达时返回"配置未完成"提示

用户访问 /settings/model
  → GET 从 config-store 读取当前配置 → 渲染表单

用户点击保存
  → PUT /api/model/config
  → 写入 config.json
  → 调用 agentRunner.updateModelConfig() 触发热更新
  → 重建 Agent 实例 → 更新 WeixinBridge 引用
```

### 配置存储

**文件**: `src/config-store.ts`

在 `OwnClawConfig` 接口中新增 `model` 字段：

```typescript
interface OwnClawConfig {
  sendThrottleIntervalMs?: number;
  channel?: ChannelConfig;
  model?: {
    baseUrl?: string;
    apiKey?: string;
    modelName?: string;
    sysPrompt?: string;
  };
}
```

新增函数：
- `loadModelConfig(): Promise<Partial<ModelConfig>>` — 返回模型配置（未设置时返回空对象）
- `saveModelConfig(config: Partial<ModelConfig>): Promise<void>` — 合并现有配置后保存

**存储路径**: `~/.ownclaw/config.json`（可通过 `OWNCLAW_STATE_DIR` 覆盖）

**ApiKey 安全**: 明文存储，与现有 `channel` 配置策略一致。

### 配置验证

**文件**: `src/config.ts`

修改 `loadConfig()`：
- `AGENT_MODEL_BASE_URL` 从必填改为可选
- 配置优先级：config-store 文件配置 > 环境变量（如果环境变量存在则覆盖）
- 如果两者都未提供 `baseUrl`，则 `baseUrl` 为空（启动时不报错，由业务逻辑处理）

### Web 配置页面

**文件**: `src/web/views/model-config.tsx`

**路由**:
- `GET /settings/model` — 渲染配置页面
- `GET /api/model/config` — 返回当前模型配置（**不包含 apiKey**，安全考虑）
- `PUT /api/model/config` — 保存新配置，JSON body: `{ baseUrl, apiKey?, modelName?, sysPrompt? }`

**表单字段**:
| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `baseUrl` | text | ✅ | - | 模型 API 地址 |
| `apiKey` | password | 否 | - | API Key |
| `modelName` | text | 否 | `gpt-4o` | 模型名称 |
| `sysPrompt` | textarea | 否 | `你是一个友好的 AI 助手。` | 系统提示词 |

**样式**: 复用 Settings 页面的 CSS 变量和组件样式

### AgentRunner 热加载

**文件**: `src/runner/agent-runner.ts`

`AgentRunner` 类新增方法：

```typescript
class AgentRunner {
  private currentToolkit: Toolkit;  // 新增：保存 toolkit 引用

  async updateModelConfig(config: CustomModelConfig): Promise<void> {
    // 1. 重建 CustomModel
    const model = new CustomModel(config);
    
    // 2. 重建 Agent（用新 model 和新 sysPrompt，保留 toolkit）
    this.agent = new Agent({
      name: 'weixin-assistant',
      sysPrompt: config.sysPrompt,
      model,
      toolkit: this.currentToolkit,
      maxIters: 10,
    });
    
    // 3. 更新 WeixinBridge 的 Agent 引用
    this.bridge.setAgent(this.agent);
  }
}
```

构造函数中需要添加 `this.currentToolkit = toolkit;`。

**文件**: `src/bridge/weixin-bridge.ts`

`WeixinBridge` 类新增方法：

```typescript
setAgent(agent: Agent): void {
  this.agent = agent;
}
```

### Web Server 与 AgentRunner 连接

**文件**: `src/web/server.tsx`

`WebServerConfig` 新增可选字段：

```typescript
interface WebServerConfig {
  port: number;
  host?: string;
  cronManager?: CronManager;
  skillsManager?: SkillsManager;
  executorManager?: ExecutorManager;
  agentRunner?: AgentRunner;  // 新增
}
```

在 `PUT /api/model/config` 路由中：

```typescript
if (config.agentRunner) {
  await config.agentRunner.updateModelConfig(savedConfig);
}
```

**如果 `agentRunner` 未传入**: 仅保存文件配置，不触发热更新（兼容 API 调用场景）。

### 启动时未配置的处理

**文件**: `src/runner/agent-runner.ts`

AgentRunner 新增 `isValid()` 方法：

```typescript
isValid(): boolean {
  return !!this.modelConfig?.baseUrl;
}
```

**文件**: `src/bridge/weixin-bridge.ts`

在 `handleMessage()` 开头增加配置检查，通过 Agent 状态间接判断：

```typescript
async handleMessage(weixinMsg: WeixinMessage): Promise<void> {
  if (!this.agentRunner?.isValid()) {
    await this.sendMessageFn(weixinMsg.from_user_id!, 
      '模型配置未完成，请前往设置页面配置。');
    return;
  }
  // ... 后续正常处理
}
```

或者更简单的方式：WeixinBridge 持有 `isConfigured: boolean` 标志，由 AgentRunner 在启动/热更新时设置。

### start.ts 启动流程调整

**文件**: `src/start.ts`

- 移除 `checkRequiredEnvVars()` 中对 `AGENT_MODEL_BASE_URL` 的强制要求
- 创建 AgentRunner 时从 config-store 读取模型配置
- 创建 Web Server 时将 AgentRunner 实例传入

## 错误处理

| 场景 | 处理 |
|------|------|
| 保存时 baseUrl 为空 | API 返回 400，提示必填 |
| config.json 读取失败 | 返回空配置，不报错 |
| config.json 写入失败 | API 返回 500，提示"保存失败" |
| 热更新时 Agent 创建失败 | 回滚到旧 Agent，日志记录错误 |
| 微信消息到达但未配置 | 返回配置提示消息 |

## 依赖关系

```
config-store.ts (model 字段扩展)
  ↓
config.ts (环境变量改为可选)
  ↓
agent-runner.ts (updateModelConfig 方法)
  ↓
weixin-bridge.ts (setAgent 方法 + 配置检查)
  ↓
web/server.tsx (agentRunner 连接 + API 路由)
  ↓
web/views/model-config.tsx (新页面)
  ↓
start.ts (启动流程调整)
```

## 测试要点

- `config-store`: `loadModelConfig`/`saveModelConfig` 读写正确性
- `config.ts`: 环境变量与文件配置的合并逻辑
- `agent-runner.ts`: `updateModelConfig` 后 Agent 实例是否正确替换
- `weixin-bridge.ts`: `setAgent` 后新消息是否路由到新 Agent
- `web/server.tsx`: API 保存配置后是否触发热更新
- 配置未设置时微信消息返回提示
