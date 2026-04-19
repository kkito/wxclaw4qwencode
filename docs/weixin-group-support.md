# 微信群聊支持情况分析

## 结论

**当前插件不支持微信群聊**。

---

## 源码证据

### 1. capabilities 配置明确声明仅支持私聊

```typescript
// src/channel.ts:132-135
capabilities: {
  chatTypes: ["direct"],  // ← 只有 direct，没有 group
  media: true,
  blockStreaming: true,
},
```

### 2. API 类型定义有 group_id 字段（潜在支持）

```typescript
// src/api/types.ts:162
interface WeixinMessage {
  // ...
  group_id?: string;  // API 层面存在此字段
  // ...
}
```

### 3. 消息处理逻辑硬编码 isGroup = false

```typescript
// src/messaging/process-message.ts:174
isGroup: false,

// src/messaging/process-message.ts:177
configuredGroupAllowFrom: [],

// src/messaging/process-message.ts:191
isGroup: false,
```

---

## 现状总结

| 层级 | 状态 |
|------|------|
| 插件配置 | `chatTypes: ["direct"]` — 明确仅私聊 |
| 消息处理 | `isGroup` 硬编码为 `false` |
| API 接口 | 类型定义中有 `group_id`，底层 iLink API 可能支持 |

---

## 后续建议

如需支持微信群聊，需要进行以下扩展：

1. 修改 `capabilities.chatTypes` 添加 `"group"`
2. 在消息处理逻辑中识别 `group_id` 字段，判断是否为群消息
3. 实现 `@消息` 处理逻辑（提取群内 @bot 的内容）
4. 添加群成员管理相关功能
5. 实现群消息回复时区分 `@发送者` 和普通回复