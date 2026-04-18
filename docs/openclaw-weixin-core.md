# OpenClaw 微信通道插件核心功能文档

## 概述

`@tencent-weixin/openclaw-weixin` 是 OpenClaw 框架的微信通道插件（iLink API），实现消息的接收和发送功能。

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户扫码登录                             │
│  startWeixinLoginWithQr → pollQRStatus → saveWeixinAccount     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       消息接收 (长轮询)                          │
│  monitorWeixinProvider → getUpdates → 消息列表                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       消息处理流程                               │
│  1. downloadMediaFromItem (媒体下载+解密)                       │
│  2. resolveAgentRoute (路由解析)                                 │
│  3. dispatchReplyFromConfig (AI 回复)                           │
│  4. deliver (发送回复)                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
      sendMessageWeixin  sendWeixinMediaFile  sendTyping
      (文本消息)          (媒体消息)           (正在输入)
            │                 │                 │
            └─────────────────┼─────────────────┘
                              ▼
                   POST ilink/bot/sendmessage
```

---

## 1. 认证登录模块 (src/auth/)

### 1.1 二维码扫码登录 (login-qr.ts)

**核心功能：** 实现微信扫码登录流程

**主要函数：**

| 函数 | 说明 |
|------|------|
| `startWeixinLoginWithQr()` | 发起登录，获取二维码 |
| `waitForWeixinLogin()` | 轮询二维码状态，等待用户确认 |
| `fetchQRCode()` | 获取二维码图片 |
| `pollQRStatus()` | 长轮询二维码扫描状态 |

**登录流程：**
1. 调用 `fetchQRCode()` 从固定 URL (`https://ilinkai.weixin.qq.com`) 获取二维码
2. 返回二维码内容 (`qrcode_img_content`) 给用户扫描
3. 进入 `pollQRStatus()` 长轮询（超时 35 秒）
4. 根据状态处理：
   - `wait`: 继续轮询
   - `scaned`: 用户已扫码，等待确认
   - `confirmed`: 登录成功，返回 bot_token
   - `expired`: 二维码过期，自动刷新（最多 3 次）
   - `scaned_but_redirect`: IDC 切换，更新轮询 URL

**API 端点：**
```
GET ilink/bot/get_bot_qrcode?bot_type=3
GET ilink/bot/get_qrcode_status?qrcode=<qrcode>
```

### 1.2 账户管理 (accounts.ts)

**核心数据结构：**

```typescript
type WeixinAccountData = {
  token?: string;        // Bot Token
  savedAt?: string;      // 保存时间
  baseUrl?: string;      // API 基础 URL
  userId?: string;       // 微信用户 ID
};
```

**主要函数：**

| 函数 | 说明 |
|------|------|
| `saveWeixinAccount()` | 保存账户凭证到文件 |
| `loadWeixinAccount()` | 加载账户凭证 |
| `listWeixinAccountIds()` | 列出所有已注册账户 |
| `resolveWeixinAccount()` | 解析账户，合并配置和凭证 |
| `clearStaleAccountsForUserId()` | 清理同一用户的旧账户 |

**存储路径：**
- 账户索引：`{stateDir}/openclaw-weixin/accounts.json`
- 账户数据：`{stateDir}/openclaw-weixin/accounts/{accountId}.json`

### 1.3 配对/授权管理 (pairing.ts)

**核心功能：** 管理已授权用户列表

```typescript
type AllowFromFileContent = {
  version: number;
  allowFrom: string[];  // 允许发送命令的用户 ID 列表
};
```

---

## 2. API 模块 (src/api/)

### 2.1 微信 API 调用封装 (api.ts)

**核心 API 函数：**

| 函数 | API 端点 | 说明 |
|------|----------|------|
| `getUpdates()` | POST ilink/bot/getupdates | 长轮询获取新消息 |
| `sendMessage()` | POST ilink/bot/sendmessage | 发送消息 |
| `getUploadUrl()` | POST ilink/bot/getuploadurl | 获取媒体上传 URL |
| `getConfig()` | POST ilink/bot/getconfig | 获取 bot 配置（含 typing_ticket） |
| `sendTyping()` | POST ilink/bot/sendtyping | 发送正在输入状态 |

**通用请求头：**
```typescript
{
  "iLink-App-Id": "从 package.json 读取",
  "iLink-App-ClientVersion": "0x00MMNNPP 格式",
  "SKRouteTag": "从 openclaw.json 读取",
  "Authorization": "Bearer {token}",
  "X-WECHAT-UIN": "随机 base64 编码的 uint32"
}
```

**超时配置：**
- Long-poll getUpdates: 35 秒
- 普通 API 请求: 15 秒
- 轻量级请求 (getConfig, sendTyping): 10 秒

### 2.2 类型定义 (types.ts)

**消息类型定义：**

```typescript
// 媒体类型
const UploadMediaType = {
  IMAGE: 1,
  VIDEO: 2,
  FILE: 3,
  VOICE: 4,
};

// 消息项类型
const MessageItemType = {
  NONE: 0,
  TEXT: 1,
  IMAGE: 2,
  VOICE: 3,
  FILE: 4,
  VIDEO: 5,
};

// WeixinMessage 结构
interface WeixinMessage {
  seq?: number;
  message_id?: number;
  from_user_id?: string;
  to_user_id?: string;
  message_type?: number;      // 1=USER, 2=BOT
  item_list?: MessageItem[];
  context_token?: string;     // 必须回传的上下文 token
}
```

### 2.3 会话保护 (session-guard.ts)

**功能：** 当会话过期时（errcode -14），自动暂停所有请求 1 小时

---

## 3. 消息收发模块 (src/messaging/)

### 3.1 消息接收与上下文管理 (inbound.ts)

**Context Token 管理：**
- 存储结构：`Map<string, string>` (key: `accountId:userId`)
- 持久化：每个账户一个 JSON 文件

**核心函数：**

| 函数 | 说明 |
|------|------|
| `setContextToken()` | 存储 context token |
| `getContextToken()` | 获取 context token |
| `restoreContextTokens()` | 从磁盘恢复 token |
| `findAccountIdsByContextToken()` | 通过 token 查找账户 |
| `weixinMessageToMsgContext()` | 将微信消息转换为框架消息 |
| `bodyFromItemList()` | 从消息项提取文本 |

### 3.2 消息发送 (send.ts)

**发送流程：**

```typescript
// 发送文本
sendMessageWeixin({ to, text, opts })

// 发送图片/视频/文件
sendImageMessageWeixin() / sendVideoMessageWeixin() / sendFileMessageWeixin()
```

**消息结构：**
```typescript
{
  msg: {
    from_user_id: "",           // 发信人（空）
    to_user_id: to,             // 收信人
    client_id: "<uuid>",        // 客户端消息 ID
    message_type: 2,            // BOT 消息
    message_state: 2,           // FINISH
    item_list: [MessageItem],   // 消息项列表
    context_token: "..."        // 上下文 token
  }
}
```

### 3.3 媒体文件发送 (send-media.ts)

**发送流程：**

```
1. 根据 MIME 类型选择上传方式：
   - video/* → uploadVideoToWeixin + sendVideoMessageWeixin
   - image/* → uploadFileToWeixin + sendImageMessageWeixin
   - 其他   → uploadFileAttachmentToWeixin + sendFileMessageWeixin

2. 上传媒体到微信 CDN（AES-128-ECB 加密）

3. 发送包含媒体引用的消息
```

### 3.4 消息处理核心 (process-message.ts)

**处理流程：**

```
1. 检查斜杠命令 (/开头的消息)
   └─ handleSlashCommand() 处理

2. 消息授权检查
   └─ resolveSenderCommandAuthorizationWithRuntime()

3. 媒体下载 (优先级: IMAGE > VIDEO > FILE > VOICE)
   └─ downloadMediaFromItem() → CDN 下载 + AES 解密

4. 路由解析
   └─ channelRuntime.routing.resolveAgentRoute()

5. 上下文记录
   └─ channelRuntime.session.recordInboundSession()

6. 构建回复调度器
   └─ createReplyDispatcherWithTyping()

7. 触发 AI 回复
   └─ dispatchReplyFromConfig()
```

---

## 4. 媒体处理模块 (src/media/)

### 4.1 媒体下载 (media-download.ts)

**支持的媒体类型：**

| 类型 | 处理方式 |
|------|----------|
| IMAGE | CDN 下载 → AES-128-ECB 解密 → 保存 |
| VOICE | CDN 下载 → AES 解密 → SILK 转 WAV → 保存 |
| FILE | CDN 下载 → AES 解密 → 根据扩展名确定 MIME |
| VIDEO | CDN 下载 → AES 解密 → MP4 保存 |

**解密方式：** AES-128-ECB

### 4.2 语音转码 (silk-transcode.ts)

**功能：** 将微信 SILK 编码转换为 WAV 格式

```typescript
silkToWav(silkBuf: Buffer): Promise<Buffer | null>
```

- 使用 `silk-wasm` 库解码
- 采样率：24000 Hz
- 失败时返回原始 SILK 数据

---

## 5. CDN 模块 (src/cdn/)

### 5.1 媒体上传 (upload.ts)

**上传流程：**

```
1. 计算文件哈希 (MD5)
2. 生成 AES-128 密钥
3. 计算加密后大小 (PKCS7 填充)
4. 调用 getUploadUrl() 获取上传 URL
5. 上传加密文件到 CDN
6. 返回: filekey, downloadEncryptedQueryParam, aeskey
```

**API 端点：**
```
POST ilink/bot/getuploadurl
Body: {
  filekey, media_type, to_user_id,
  rawsize, rawfilemd5, filesize, aeskey
}
```

### 5.2 图片解密 (pic-decrypt.ts)

```typescript
// AES-128-ECB 解密
downloadAndDecryptBuffer(encryptQueryParam, aesKey, cdnBaseUrl)
```

---

## 6. 通道定义 (src/channel.ts)

**weixinPlugin 对象核心配置：**

```typescript
{
  id: "openclaw-weixin",
  meta: { label: "openclaw-weixin (long-poll)" },
  capabilities: {
    chatTypes: ["direct"],
    media: true,
    blockStreaming: true
  },
  messaging: { targetResolver: { looksLikeId: (raw) => raw.endsWith("@im.wechat") } },
  outbound: {
    sendText, sendMedia  // 发送消息的入口
  },
  auth: { login }        // 扫码登录入口
}
```

---

## 7. 监控模块 (src/monitor/monitor.ts)

**monitorWeixinProvider() - 消息接收主循环：**

```
1. 初始化运行时和同步缓冲区
2. 进入主循环 (while !aborted):
   a. 调用 getUpdates() 长轮询
   b. 处理错误：
      - session expired (-14): 暂停 1 小时
      - 连续失败 3 次: 退避 30 秒
   c. 保存 get_updates_buf 到磁盘
   d. 逐条处理消息
   e. 更新状态 (lastEventAt)
```

**容错机制：**
- 最大连续失败：3 次
- 失败退避：30 秒
- 会话过期暂停：60 分钟
- 同步缓冲区持久化：防止消息丢失

---

## 文件结构汇总

```
@tencent-weixin/openclaw-weixin/
├── src/
│   ├── api/                     # 微信 API 调用封装
│   │   ├── api.ts              # 核心 API (getUpdates, sendMessage 等)
│   │   ├── types.ts            # 类型定义
│   │   ├── config-cache.ts     # 配置缓存
│   │   └── session-guard.ts    # 会话保护
│   ├── auth/                    # 认证登录
│   │   ├── login-qr.ts         # 二维码扫码登录
│   │   ├── accounts.ts         # 账户管理
│   │   └── pairing.ts          # 配对/授权管理
│   ├── cdn/                     # CDN 相关
│   │   ├── upload.ts           # 媒体上传
│   │   ├── cdn-upload.ts       # CDN 上传实现
│   │   └── pic-decrypt.ts      # 图片解密
│   ├── config/                  # 配置
│   ├── media/                   # 媒体处理
│   │   ├── media-download.ts   # 媒体下载
│   │   └── silk-transcode.ts   # 语音转码
│   ├── messaging/               # 消息处理
│   │   ├── inbound.ts          # 消息接收与上下文
│   │   ├── send.ts             # 消息发送
│   │   ├── send-media.ts       # 媒体发送
│   │   ├── process-message.ts  # 消息处理核心
│   │   ├── slash-commands.ts   # 斜杠命令
│   │   └── markdown-filter.ts  # Markdown 过滤
│   ├── monitor/                 # 监控
│   │   └── monitor.ts          # 消息接收主循环
│   ├── storage/                 # 存储
│   ├── util/                    # 工具函数
│   ├── channel.ts              # 通道定义
│   ├── runtime.ts              # 运行时
│   └── compat.ts               # 兼容性检查
├── index.ts                     # 入口
└── openclaw.plugin.json        # 插件配置
```

---

## 相关依赖

| 包 | 版本 | 用途 |
|---|------|------|
| `qrcode-terminal` | 0.12.0 | 终端二维码显示 |
| `zod` | 4.3.6 | 数据校验 |
| `silk-wasm` | ^3.7.1 | 语音转码（开发依赖） |