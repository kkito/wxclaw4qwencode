# OwnClaw TODO

## 任务列表

### 1. ✅ 增加 Skill 功能（已完成）

- 实现 SkillsManager 模块（types/schema/store/manager/index）
- Web API CRUD（/api/skills/*）
- Web 管理页面（/skills）
- Agent 集成（Toolkit + skillDirs）
- 启动脚本集成（start.ts + start-web.ts）
- 示例 Skill（~/.ownclaw/skills/data-analyst/）

### 2. 增加 Chrome Job

实现浏览器自动化任务处理能力。

### 3. ✅ 完整 UI 界面（已完成）

- ✅ 已完成 Cron 管理页面 (`/cron`)
- ✅ 已完成 Skills 管理页面 (`/skills`)
- ✅ 已完成 ACP 集成（斜杠命令 + ACP 开发模式）

### 4. ✅ 斜杠命令扩展（已完成）

- ✅ 文件驱动的斜杠命令框架 (`~/.ownclaw/commands/`)
- ✅ WeixinBridge 前置路由拦截
- ✅ 内置 `/acp` 命令（ACP 开发模式，流式输出，超时清理）

### 5. 文件读取能力

支持读取多种文件格式：文本文件、Excel、PDF 等。

### 6. ✅ Cron 定时任务 (已完成)

支持通过 Web 界面和 API 管理 bash 脚本定时任务。

---

*Created: 2026-04-19*
*Updated: 2026-04-30 — ACP integration, slash command framework*
