// src/skills/manager.ts

import { Toolkit } from '@agentscope-ai/agentscope/tool';
import { SkillsStore } from './store.js';
import { SkillMeta, SkillsManagerConfig } from './types.js';

export class SkillsManager {
  private store: SkillsStore;
  private skillsDir: string;

  constructor(config: SkillsManagerConfig = {}) {
    this.skillsDir = config.skillsDir || getDefaultSkillsDir();
    this.store = new SkillsStore(this.skillsDir);
  }

  /** ===== CRUD ===== */

  listSkills(): SkillMeta[] {
    return this.store.listSkills();
  }

  getSkill(id: string): SkillMeta | undefined {
    return this.store.getSkill(id);
  }

  getSkillFiles(id: string): string[] {
    return this.store.getSkillFiles(id);
  }

  getSkillFile(id: string, filename: string): string {
    return this.store.getSkillFile(id, filename);
  }

  createSkill(id: string, skillMd: string): SkillMeta {
    return this.store.createSkill(id, skillMd);
  }

  updateSkill(id: string, skillMd: string): SkillMeta {
    return this.store.updateSkill(id, skillMd);
  }

  deleteSkill(id: string): void {
    this.store.deleteSkill(id);
  }

  uploadFile(id: string, filename: string, content: string): void {
    this.store.uploadFile(id, filename, content);
  }

  deleteFile(id: string, filename: string): void {
    this.store.deleteFile(id, filename);
  }

  /** ===== Toolkit 集成 ===== */

  /**
   * 创建配置了 skillDirs 的 Toolkit 实例
   * Toolkit 构造函数会自动：
   * 1. 扫描 skillDirs 下的子目录作为 Skills
   * 2. 读取每个子目录的 SKILL.md
   * 3. 生成 Skills 提示词注入到 Agent
   * 4. 注册内置 Skill 工具
   */
  createToolkit(): Toolkit {
    return new Toolkit({
      skillDirs: [this.skillsDir],
      builtInSkillTool: true,
    });
  }
}

function getDefaultSkillsDir(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
  return `${homeDir}/.ownclaw/skills`;
}
