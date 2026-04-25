// src/skills/types.ts

/**
 * Skill 元数据（从 SKILL.md 的 YAML frontmatter 读取）
 */
export interface SkillMeta {
  /** Skill 唯一标识符（目录名） */
  id: string;
  /** Skill 名称（frontmatter 中的 name 字段） */
  name: string;
  /** Skill 描述（frontmatter 中的 description 字段） */
  description: string;
  /** SKILL.md 的完整内容 */
  content: string;
  /** 目录下的文件列表 */
  files: string[];
}

/**
 * 创建 Skill 的输入
 */
export interface CreateSkillInput {
  id: string;
  skillMd: string;
}

/**
 * 更新 Skill 的输入
 */
export interface UpdateSkillInput {
  skillMd: string;
}

/**
 * SkillsManager 配置
 */
export interface SkillsManagerConfig {
  skillsDir?: string;
}
