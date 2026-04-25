---
name: Skills 功能架构设计
description: Skills 功能的模块架构、存储、加载、Web 管理和 Agent 集成
type: project
---

# Skills 功能设计

## 1. 概述

AgentScope 支持 **Agent Skills**——通过向 Skill 目录放置 `SKILL.md`（含 YAML frontmatter）和参考文件（如 SQL），为 Agent 注入特定领域知识。Agent 通过 Toolkit 注册 Skills 后，会在运行时根据 `SKILL.md` 指引，自主调用文件读取/Shell 工具来使用这些技能。

## 2. 架构设计

### 2.1 模块结构（方案 A：分层模式，与 Cron 一致）

```
src/skills/
├── types.ts          # SkillMeta, SkillsManagerConfig 类型
├── schema.ts         # Zod 验证
├── store.ts          # SkillsStore - 文件存储管理（~/.ownclaw/skills/）
├── loader.ts         # SkillsLoader - 注册/注销 Skills 到 Toolkit
├── manager.ts        # SkillsManager - 组合 store + loader
└── index.ts          # 统一导出
```

### 2.2 数据存储

```
~/.ownclaw/skills/
├── data-analyst/
│   ├── SKILL.md          # 必须，YAML frontmatter + 指南
│   └── schema.sql        # 可选，Agent 通过 read 工具读取
├── report-generator/
│   └── SKILL.md
└── ...
```

目录名 = Skill 唯一标识。

### 2.3 核心组件

#### SkillsStore
职责：文件 CRUD

```typescript
class SkillsStore {
  private skillsDir: string;

  listSkills(): SkillMeta[]                    // 扫描目录，读取 frontmatter
  getSkill(id: string): SkillMeta              // 获取元数据
  getSkillFiles(id: string): string[]          // 列出目录文件
  getSkillFile(id: string, filename: string): string  // 读取文件内容
  createSkill(id: string, skilMd: string): SkillMeta  // 创建目录 + SKILL.md
  updateSkill(id: string, skilMd: string): SkillMeta  // 更新 SKILL.md
  deleteSkill(id: string): void                // 删除目录
  uploadFile(id: string, filename: string, content: string): void  // 上传文件
}
```

#### SkillsLoader
职责：管理 Toolkit 中的 Skills 配置

**重要发现**：AgentScope 的 Toolkit 不支持 `register_agent_skill` 方法。Skills 通过 Toolkit 构造函数传入 `skillDirs` 数组来加载：

```typescript
const toolkit = new Toolkit({
  skillDirs: ['~/.ownclaw/skills/'],  // 扫描此目录下的子目录作为 Skills
});
```

Toolkit 内部会自动：
1. 扫描 `skillDirs` 下所有子目录
2. 读取每个子目录的 `SKILL.md` 文件
3. 生成 Skills 提示词注入到 Agent 的 System Prompt
4. 注册内置 `Skill` 工具，Agent 可通过 `Skill` 工具按名称读取 SKILL.md

因此 SkillsLoader 的职责简化为：
- 管理 `skillDirs` 配置
- 提供 `createToolkit()` 方法，返回配置好 skillDirs 的 Toolkit 实例
- 提供 `refreshSkillsPrompt(toolkit)` 方法（调用 `toolkit.getSkillsPrompt()`）

#### SkillsManager
职责：组合 store + loader，统一 API

```typescript
class SkillsManager {
  private store: SkillsStore;
  private skillsDir: string;

  // CRUD（委托 store）
  listSkills(): SkillMeta[]
  getSkill(id: string): SkillMeta
  getSkillFiles(id: string): string[]
  getSkillFile(id: string, filename: string): string
  createSkill(id: string, skilMd: string): SkillMeta
  updateSkill(id: string, skilMd: string): SkillMeta
  deleteSkill(id: string): void
  uploadFile(id: string, filename: string, content: string): void

  // Toolkit 集成
  createToolkit(): Toolkit  // 创建配置了 skillDirs 的 Toolkit
}
```

## 3. Agent 集成

在 `AgentRunner` 启动时：

```typescript
// 1. 创建 SkillsManager
const skillsManager = new SkillsManager({ skillsDir: '~/.ownclaw/skills/' });

// 2. 创建 Toolkit（自动包含 skillDirs + 内置工具）
const toolkit = skillsManager.createToolkit();

// 3. 注册额外的内置工具（如 bash）
toolkit.registerToolFunction(bashTool);

// 4. 创建 Agent
const agent = new Agent({
  name: 'weixin-assistant',
  sysPrompt: config.sysPrompt,
  model,
  toolkit,       // ← 传入 Toolkit
  maxIters: 10,
});
```

## 4. Web API

在 `createWebServer()` 中注入 `skillsManager`：

```
GET    /api/skills                        # 列出所有 Skills
GET    /api/skills/:id                    # 获取 Skill 详情（含 SKILL.md 内容）
GET    /api/skills/:id/files              # 列出文件
GET    /api/skills/:id/files/:filename    # 获取文件内容
POST   /api/skills                        # 创建 Skill（body: { id, skilMd }）
PUT    /api/skills/:id                    # 更新 Skill（body: { skilMd }）
DELETE /api/skills/:id                    # 删除 Skill
POST   /api/skills/:id/files              # 上传文件（body: { filename, content }）
DELETE /api/skills/:id/files/:filename    # 删除文件
```

**注意**：由于 Toolkit 使用构造函数的 `skillDirs` 加载，修改 Skill 文件后，Agent 的下一次对话会自动读取最新的 SKILL.md（通过内置 `Skill` 工具实时读取文件），不需要 reload API。

## 5. Web 页面 (/skills)

- Skills 列表卡片视图
- 创建/编辑模态框（SKILL.md 编辑器，Markdown）
- 文件列表（显示 Skill 目录文件，点击查看内容）
- 上传文件按钮
- 删除确认
- 复用 Cron 页面的内联 CSS/JS 风格

## 6. 启动入口

入口（`start-web.ts`）中创建 SkillsManager 并传入 WebServer：

```typescript
const skillsManager = new SkillsManager();

const { app, server } = createWebServer({
  port: 3525,
  skillsManager,
  cronManager,
});
```

`start.ts`（微信 Agent 模式）中也创建 SkillsManager 用于创建 Toolkit：

```typescript
const skillsManager = new SkillsManager();
const toolkit = skillsManager.createToolkit();
// toolkit.registerToolFunction(bashTool);
// 创建 Agent 时传入 toolkit
```
