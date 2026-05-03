# 模型配置 Web 管理与热加载实现计划

**日期**: 2026-05-04
**关联 Spec**: `docs/superpowers/specs/2026-05-04-model-config-web-management-design.md`

## 实现步骤

### 1. config-store.ts 扩展
- 在 `OwnClawConfig` 接口中新增 `model` 字段
- 新增 `loadModelConfig()` 函数
- 新增 `saveModelConfig()` 函数

### 2. config.ts 修改
- `AGENT_MODEL_BASE_URL` 从必填改为可选
- 配置优先级：config-store > 环境变量

### 3. agent-runner.ts 热加载
- 保存 `currentToolkit` 引用
- 新增 `updateModelConfig()` 方法
- 新增 `isValid()` 方法

### 4. weixin-bridge.ts 更新
- 新增 `setAgent()` 方法
- 消息处理增加配置检查

### 5. web/server.tsx 更新
- `WebServerConfig` 新增 `agentRunner` 字段
- 新增 `GET /api/model/config` 路由
- 新增 `PUT /api/model/config` 路由

### 6. web/views/model-config.tsx 新页面
- 创建配置表单页面
- 复用 Settings 页面样式

### 7. start.ts 启动流程调整
- 移除 `AGENT_MODEL_BASE_URL` 强制要求
- 从 config-store 读取模型配置
- 传入 AgentRunner 到 Web Server

### 8. 测试
- config-store 读写测试
- config 合并逻辑测试
- agent-runner 热更新测试
- weixin-bridge setAgent 测试
- web API 路由测试
