import fs from 'node:fs';
import path from 'node:path';
import { SkillMeta } from './types.js';

/**
 * 解析 SKILL.md 的 YAML frontmatter
 * 简易实现，不依赖 gray-matter（Toolkit 内部用了，但我们保持轻量）
 */
function parseFrontmatter(content: string): { name: string; description: string; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    return { name: '', description: '', body: content };
  }

  const frontmatter = match[1];
  const body = match[2];

  const nameMatch = frontmatter.match(/name:\s*(.+)/);
  const descMatch = frontmatter.match(/description:\s*(.+)/);

  return {
    name: nameMatch ? nameMatch[1].trim() : '',
    description: descMatch ? descMatch[1].trim() : '',
    body,
  };
}

export class SkillsStore {
  private skillsDir: string;

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
    // 确保目录存在
    fs.mkdirSync(this.skillsDir, { recursive: true });
  }

  /** 获取 Skill 目录的绝对路径 */
  private getSkillDir(id: string): string {
    return path.resolve(this.skillsDir, id);
  }

  /** 获取 SKILL.md 路径 */
  private getSkillMdPath(id: string): string {
    return path.join(this.getSkillDir(id), 'SKILL.md');
  }

  /** 列出所有 Skills（读取 frontmatter） */
  listSkills(): SkillMeta[] {
    if (!fs.existsSync(this.skillsDir)) {
      return [];
    }

    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
    const skills: SkillMeta[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const id = entry.name;
      const skillMdPath = this.getSkillMdPath(id);

      if (!fs.existsSync(skillMdPath)) continue;

      try {
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        const { name, description } = parseFrontmatter(content);
        const files = fs.readdirSync(this.getSkillDir(id)).filter(f => f !== 'SKILL.md');

        skills.push({
          id,
          name,
          description,
          content,
          files,
        });
      } catch {
        // 跳过无法读取的目录
        continue;
      }
    }

    return skills;
  }

  /** 获取指定 Skill 的元数据 */
  getSkill(id: string): SkillMeta | undefined {
    const skillMdPath = this.getSkillMdPath(id);
    if (!fs.existsSync(skillMdPath)) {
      return undefined;
    }

    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const { name, description } = parseFrontmatter(content);
    const files = fs.readdirSync(this.getSkillDir(id)).filter(f => f !== 'SKILL.md');

    return { id, name, description, content, files };
  }

  /** 列出 Skill 目录下的文件 */
  getSkillFiles(id: string): string[] {
    const dir = this.getSkillDir(id);
    if (!fs.existsSync(dir)) {
      throw new Error(`Skill '${id}' not found`);
    }
    return fs.readdirSync(dir).filter(f => f !== 'SKILL.md');
  }

  /** 读取 Skill 目录下指定文件的内容 */
  getSkillFile(id: string, filename: string): string {
    const dir = this.getSkillDir(id);
    const filePath = path.resolve(dir, filename);

    // 安全检查：防止路径遍历攻击
    if (!filePath.startsWith(dir + path.sep) && filePath !== dir) {
      throw new Error('Invalid file path');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File '${filename}' not found in skill '${id}'`);
    }

    return fs.readFileSync(filePath, 'utf-8');
  }

  /** 创建新 Skill */
  createSkill(id: string, skillMd: string): SkillMeta {
    const dir = this.getSkillDir(id);

    if (fs.existsSync(dir)) {
      throw new Error(`Skill '${id}' already exists`);
    }

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.getSkillMdPath(id), skillMd, 'utf-8');

    return {
      id,
      ...parseFrontmatter(skillMd),
      content: skillMd,
      files: [],
    };
  }

  /** 更新 Skill 的 SKILL.md */
  updateSkill(id: string, skillMd: string): SkillMeta {
    const dir = this.getSkillDir(id);
    if (!fs.existsSync(dir)) {
      throw new Error(`Skill '${id}' not found`);
    }

    fs.writeFileSync(this.getSkillMdPath(id), skillMd, 'utf-8');

    const files = fs.readdirSync(dir).filter(f => f !== 'SKILL.md');
    return {
      id,
      ...parseFrontmatter(skillMd),
      content: skillMd,
      files,
    };
  }

  /** 删除整个 Skill 目录 */
  deleteSkill(id: string): void {
    const dir = this.getSkillDir(id);
    if (!fs.existsSync(dir)) {
      throw new Error(`Skill '${id}' not found`);
    }

    fs.rmSync(dir, { recursive: true, force: true });
  }

  /** 上传/覆盖 Skill 目录下的文件 */
  uploadFile(id: string, filename: string, content: string): void {
    const dir = this.getSkillDir(id);
    if (!fs.existsSync(dir)) {
      throw new Error(`Skill '${id}' not found`);
    }

    // 不允许覆盖 SKILL.md（使用 updateSkill）
    if (filename === 'SKILL.md') {
      throw new Error('Use updateSkill to update SKILL.md');
    }

    const filePath = path.resolve(dir, filename);
    // 安全检查
    if (!filePath.startsWith(dir + path.sep) && filePath !== dir) {
      throw new Error('Invalid file path');
    }

    fs.writeFileSync(filePath, content, 'utf-8');
  }

  /** 删除 Skill 目录下的文件 */
  deleteFile(id: string, filename: string): void {
    const dir = this.getSkillDir(id);
    if (!fs.existsSync(dir)) {
      throw new Error(`Skill '${id}' not found`);
    }

    if (filename === 'SKILL.md') {
      throw new Error('Cannot delete SKILL.md, use deleteSkill instead');
    }

    const filePath = path.resolve(dir, filename);
    if (!filePath.startsWith(dir + path.sep) && filePath !== dir) {
      throw new Error('Invalid file path');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File '${filename}' not found`);
    }

    fs.unlinkSync(filePath);
  }
}
