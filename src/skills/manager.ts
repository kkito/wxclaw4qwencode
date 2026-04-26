// src/skills/manager.ts

import { Toolkit } from '@agentscope-ai/agentscope/tool';
import https from 'node:https';
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

  /** ===== GitHub 安装 ===== */

  /**
   * 从 GitHub 仓库安装 Skills
   * @param repo GitHub 仓库地址，格式：owner/repo
   * @param branch 分支名，默认 main
   * @returns 安装的 Skill 列表
   */
  async installFromGitHub(
    repo: string,
    branch: string = 'main',
  ): Promise<{ installed: SkillMeta[]; skipped: string[] }> {
    // 解析 repo 格式
    const parts = repo.split('/');
    if (parts.length !== 2) {
      throw new Error('Invalid repo format, expected owner/repo');
    }
    const [owner, repoName] = parts;

    // 从 GitHub 获取 skills/ 目录内容
    const skillsDir = await this.fetchGitHubDir(owner, repoName, branch, 'skills');
    if (!skillsDir || Object.keys(skillsDir).length === 0) {
      throw new Error(`No skills/ directory found in ${repo}`);
    }

    const installed: SkillMeta[] = [];
    const skipped: string[] = [];

    // 遍历 skills/ 下的每个子目录
    for (const [skillId, files] of Object.entries(skillsDir)) {
      // 检查是否已有同名 Skill
      if (this.getSkill(skillId)) {
        skipped.push(skillId);
        continue;
      }

      // 必须有 SKILL.md
      const skillMd = files['SKILL.md'];
      if (!skillMd) {
        skipped.push(skillId);
        continue;
      }

      // 创建 Skill
      const skill = this.createSkill(skillId, skillMd);

      // 写入其他文件
      for (const [filename, content] of Object.entries(files)) {
        if (filename !== 'SKILL.md') {
          this.uploadFile(skillId, filename, content);
        }
      }

      installed.push(skill);
    }

    if (installed.length === 0 && skipped.length === 0) {
      throw new Error(`No valid skills found in ${repo}`);
    }

    return { installed, skipped };
  }

  /**
   * 从 GitHub 获取指定目录的内容
   * 返回 { filename: content } 的映射
   */
  private async fetchGitHubDir(
    owner: string,
    repo: string,
    branch: string,
    dirPath: string,
  ): Promise<Record<string, Record<string, string>>> {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}?ref=${branch}`;

    const response = await this.fetchJson(apiUrl);
    if (!Array.isArray(response)) {
      return {};
    }

    const result: Record<string, Record<string, string>> = {};

    for (const item of response) {
      if (item.type !== 'dir') continue;

      const skillName = item.name;
      const skillFiles = await this.fetchGitHubFiles(owner, repo, branch, `${dirPath}/${skillName}`);
      result[skillName] = skillFiles;
    }

    return result;
  }

  /**
   * 获取 GitHub 目录下所有文件的内容
   */
  private async fetchGitHubFiles(
    owner: string,
    repo: string,
    branch: string,
    dirPath: string,
  ): Promise<Record<string, string>> {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}?ref=${branch}`;

    const response = await this.fetchJson(apiUrl);
    if (!Array.isArray(response)) {
      return {};
    }

    const files: Record<string, string> = {};

    for (const item of response) {
      if (item.type !== 'file') continue;

      // 获取文件内容（需要单独请求）
      const rawUrl = item.download_url || item.html_url?.replace('github.com', 'raw.githubusercontent.com')?.replace('/blob/', '/');
      if (rawUrl) {
        files[item.name] = await this.fetchText(rawUrl);
      }
    }

    return files;
  }

  /**
   * 发起 JSON GET 请求
   */
  private fetchJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers: { 'User-Agent': 'OwnClaw' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Failed to parse JSON from ${url}`));
          }
        });
      });
      req.on('error', reject);
    });
  }

  /**
   * 发起文本 GET 请求
   */
  private fetchText(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers: { 'User-Agent': 'OwnClaw' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
    });
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
