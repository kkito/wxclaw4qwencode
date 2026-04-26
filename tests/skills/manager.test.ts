import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SkillsManager } from '../../src/skills/manager.js';
import { Toolkit } from '@agentscope-ai/agentscope/tool';

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
});
