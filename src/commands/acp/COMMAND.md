---
name: acp
description: 进入 ACP (Agent Client Protocol) 模式
usage: /acp [路径|序号]
handler: ./handler.js
---

# ACP Command

进入 ACP mode，允许与 Agent 进行交互式编程。

用法：

- `/acp` — 列出可配置项目，发送 `/acp <序号>` 选择
- `/acp 3` — 进入第 3 个项目
- `/acp /path/to/project` — 直接进入指定路径
