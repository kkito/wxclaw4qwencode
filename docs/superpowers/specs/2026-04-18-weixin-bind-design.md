# 微信绑定/解绑 CLI 设计文档

## 概述

为 OwnClaw 项目实现微信绑定的命令行工具，支持绑定、解绑和状态查询功能。

## 存储位置

- 基础目录：`~/.ownclaw`
- 账户文件：`~/.ownclaw/accounts/{accountId}.json`
- 账户索引：`~/.ownclaw/accounts.json`

## CLI 命令

| 命令 | 说明 |
|------|------|
| `node dist/cli.js bind` | 绑定微信 |
| `node dist/cli.js unbind` | 解绑微信 |
| `node dist/cli.js status` | 查看绑定状态 |

## 详细设计

### 1. bind 子命令

1. 调用 `startWeixinLoginWithQr()` 获取二维码 URL
2. 在终端显示二维码 URL，提示用户用微信扫码
3. 轮询 `pollQRStatus()` 等待用户确认（超时 35 秒，可刷新重试 3 次）
4. 登录成功后：
   - 更新 openclaw-weixin 的 stateDir 配置指向 `~/.ownclaw`
   - 调用 `saveWeixinAccount()` 保存账户凭证
5. 输出绑定成功信息，包含 accountId

**二维码状态处理：**
- `wait`: 继续轮询
- `scaned`: 用户已扫码，等待确认
- `confirmed`: 登录成功
- `expired`: 二维码过期，自动刷新（最多 3 次）

### 2. unbind 子命令

1. 读取 `~/.ownclaw/accounts.json` 获取已绑定账户列表
2. 显示账户列表，让用户选择要解绑的账户
3. 用户确认后删除对应的账户文件
4. 更新 `accounts.json` 索引

### 3. status 子命令

1. 读取 `~/.ownclaw/accounts.json`
2. 显示已绑定账户列表，包括：
   - accountId
   - 绑定时间（savedAt）
   - 用户 ID（userId）

## 错误处理

- 网络错误：显示错误信息并提示重试
- 超时：提示用户可以重新发起绑定
- 账户不存在：提示用户尚未绑定

## 配置

通过环境变量配置：

| 环境变量 | 说明 |
|----------|------|
| `OWNCLAW_STATE_DIR` | 自定义状态目录（默认 `~/.ownclaw`）|