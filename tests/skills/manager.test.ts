import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SkillsManager } from '../../src/skills/manager.js';
import { Toolkit } from '@agentscope-ai/agentscope/tool';
import https from 'node:https';

describe('SkillsManager', () => {
  let manager: SkillsManager;
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-mgr-'));
    manager = new SkillsManager({ skillsDir: testDir });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  const SKILL_MD = `---
name: Test Skill
description: A test skill
---

# Test Skill
`;

  it('should create and list skills', () => {
    manager.createSkill('test-skill', SKILL_MD);
    const skills = manager.listSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('Test Skill');
  });

  it('should delete a skill', () => {
    manager.createSkill('test-skill', SKILL_MD);
    manager.deleteSkill('test-skill');
    expect(manager.listSkills()).toHaveLength(0);
  });

  it('should create a Toolkit with skillDirs', () => {
    manager.createSkill('test-skill', SKILL_MD);
    const toolkit = manager.createToolkit();
    expect(toolkit).toBeInstanceOf(Toolkit);
    // skillDirs 应该包含测试目录
    expect(toolkit.skillDirs).toContain(testDir);
  });

  describe('installFromGitHub', () => {
    const MOCK_SKILL_MD = `---
name: Mock Skill
description: A mock skill from GitHub
---

# Mock Skill
`;

    it('should install skills from a GitHub repo', async () => {
      // Mock https.get to simulate GitHub API
      const mockGet = vi.spyOn(https, 'get');

      // Mock 1: GET /repos/owner/repo/contents/skills?ref=main
      mockGet.mockImplementationOnce(((url: string | URL, _options: any, cb: any) => {
        if (typeof url === 'string' && url.includes('/contents/skills')) {
          const res = {
            on: (event: string, handler: any) => {
              if (event === 'data') handler(JSON.stringify([
                { type: 'dir', name: 'mock-skill', download_url: null, html_url: 'https://github.com/owner/repo/blob/main/skills/mock-skill' },
              ]));
              if (event === 'end') handler();
            },
          };
          cb(res);
          return { on: () => {} };
        }
        return { on: () => {} };
      }) as any);

      // Mock 2: GET /repos/owner/repo/contents/skills/mock-skill?ref=main
      mockGet.mockImplementationOnce(((url: string | URL, _options: any, cb: any) => {
        if (typeof url === 'string' && url.includes('/skills/mock-skill')) {
          const res = {
            on: (event: string, handler: any) => {
              if (event === 'data') handler(JSON.stringify([
                { type: 'file', name: 'SKILL.md', download_url: 'https://raw.githubusercontent.com/owner/repo/main/skills/mock-skill/SKILL.md' },
              ]));
              if (event === 'end') handler();
            },
          };
          cb(res);
          return { on: () => {} };
        }
        return { on: () => {} };
      }) as any);

      // Mock 3: GET raw SKILL.md content
      mockGet.mockImplementationOnce(((url: string | URL, _options: any, cb: any) => {
        if (typeof url === 'string' && url.includes('raw.githubusercontent.com')) {
          const res = {
            on: (event: string, handler: any) => {
              if (event === 'data') handler(MOCK_SKILL_MD);
              if (event === 'end') handler();
            },
          };
          cb(res);
          return { on: () => {} };
        }
        return { on: () => {} };
      }) as any);

      const result = await manager.installFromGitHub('owner/repo');

      expect(result.installed).toHaveLength(1);
      expect(result.installed[0].id).toBe('mock-skill');
      expect(result.skipped).toHaveLength(0);

      // Verify skill was created
      const skills = manager.listSkills();
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('Mock Skill');
    });

    it('should throw error for invalid repo format', async () => {
      await expect(manager.installFromGitHub('invalid-repo')).rejects.toThrow('Invalid repo format');
    });

    it('should skip already installed skills', async () => {
      // Install the skill first
      const mockGet = vi.spyOn(https, 'get');

      mockGet.mockImplementationOnce(((url: string | URL, _options: any, cb: any) => {
        if (typeof url === 'string' && url.includes('/contents/skills')) {
          const res = {
            on: (event: string, handler: any) => {
              if (event === 'data') handler(JSON.stringify([
                { type: 'dir', name: 'mock-skill', download_url: null, html_url: 'https://github.com/owner/repo/blob/main/skills/mock-skill' },
              ]));
              if (event === 'end') handler();
            },
          };
          cb(res);
          return { on: () => {} };
        }
        return { on: () => {} };
      }) as any);

      mockGet.mockImplementationOnce(((url: string | URL, _options: any, cb: any) => {
        if (typeof url === 'string' && url.includes('/skills/mock-skill')) {
          const res = {
            on: (event: string, handler: any) => {
              if (event === 'data') handler(JSON.stringify([
                { type: 'file', name: 'SKILL.md', download_url: 'https://raw.githubusercontent.com/owner/repo/main/skills/mock-skill/SKILL.md' },
              ]));
              if (event === 'end') handler();
            },
          };
          cb(res);
          return { on: () => {} };
        }
        return { on: () => {} };
      }) as any);

      mockGet.mockImplementationOnce(((url: string | URL, _options: any, cb: any) => {
        if (typeof url === 'string' && url.includes('raw.githubusercontent.com')) {
          const res = {
            on: (event: string, handler: any) => {
              if (event === 'data') handler(MOCK_SKILL_MD);
              if (event === 'end') handler();
            },
          };
          cb(res);
          return { on: () => {} };
        }
        return { on: () => {} };
      }) as any);

      await manager.installFromGitHub('owner/repo');

      // Second install should skip
      // Reset mocks for second call
      mockGet.mockClear();

      mockGet.mockImplementationOnce(((url: string | URL, _options: any, cb: any) => {
        if (typeof url === 'string' && url.includes('/contents/skills')) {
          const res = {
            on: (event: string, handler: any) => {
              if (event === 'data') handler(JSON.stringify([
                { type: 'dir', name: 'mock-skill', download_url: null, html_url: 'https://github.com/owner/repo/blob/main/skills/mock-skill' },
              ]));
              if (event === 'end') handler();
            },
          };
          cb(res);
          return { on: () => {} };
        }
        return { on: () => {} };
      }) as any);

      mockGet.mockImplementationOnce(((url: string | URL, _options: any, cb: any) => {
        if (typeof url === 'string' && url.includes('/skills/mock-skill')) {
          const res = {
            on: (event: string, handler: any) => {
              if (event === 'data') handler(JSON.stringify([
                { type: 'file', name: 'SKILL.md', download_url: 'https://raw.githubusercontent.com/owner/repo/main/skills/mock-skill/SKILL.md' },
              ]));
              if (event === 'end') handler();
            },
          };
          cb(res);
          return { on: () => {} };
        }
        return { on: () => {} };
      }) as any);

      mockGet.mockImplementationOnce(((url: string | URL, _options: any, cb: any) => {
        if (typeof url === 'string' && url.includes('raw.githubusercontent.com')) {
          const res = {
            on: (event: string, handler: any) => {
              if (event === 'data') handler(MOCK_SKILL_MD);
              if (event === 'end') handler();
            },
          };
          cb(res);
          return { on: () => {} };
        }
        return { on: () => {} };
      }) as any);

      const result = await manager.installFromGitHub('owner/repo');
      expect(result.skipped).toContain('mock-skill');
      expect(result.installed).toHaveLength(0);
    });
  });
});
