import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SkillsStore } from '../../src/skills/store.js';

describe('SkillsStore', () => {
  let store: SkillsStore;
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-test-'));
    store = new SkillsStore(testDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  const SKILL_MD = `---
name: Test Skill
description: A test skill
---

# Test Skill

This is a test skill.
`;

  it('should create and list skills', () => {
    const result = store.createSkill('test-skill', SKILL_MD);
    expect(result.id).toBe('test-skill');
    expect(result.name).toBe('Test Skill');

    const skills = store.listSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe('test-skill');
  });

  it('should get a skill by id', () => {
    store.createSkill('test-skill', SKILL_MD);
    const skill = store.getSkill('test-skill');
    expect(skill).toBeDefined();
    expect(skill!.name).toBe('Test Skill');
  });

  it('should return undefined for non-existent skill', () => {
    expect(store.getSkill('nonexistent')).toBeUndefined();
  });

  it('should update a skill', () => {
    store.createSkill('test-skill', SKILL_MD);
    const updatedMd = `---
name: Updated Skill
description: Updated description
---

Updated content.
`;
    const result = store.updateSkill('test-skill', updatedMd);
    expect(result.name).toBe('Updated Skill');
    expect(result.description).toBe('Updated description');
  });

  it('should delete a skill', () => {
    store.createSkill('test-skill', SKILL_MD);
    store.deleteSkill('test-skill');
    expect(store.listSkills()).toHaveLength(0);
  });

  it('should throw on duplicate create', () => {
    store.createSkill('test-skill', SKILL_MD);
    expect(() => store.createSkill('test-skill', SKILL_MD)).toThrow('already exists');
  });

  it('should throw on update non-existent', () => {
    expect(() => store.updateSkill('nonexistent', SKILL_MD)).toThrow('not found');
  });

  it('should upload and read a file', () => {
    store.createSkill('test-skill', SKILL_MD);
    store.uploadFile('test-skill', 'schema.sql', 'CREATE TABLE test (id INT);');
    const content = store.getSkillFile('test-skill', 'schema.sql');
    expect(content).toContain('CREATE TABLE');

    const files = store.getSkillFiles('test-skill');
    expect(files).toContain('schema.sql');
  });

  it('should not allow overwriting SKILL.md via uploadFile', () => {
    store.createSkill('test-skill', SKILL_MD);
    expect(() => store.uploadFile('test-skill', 'SKILL.md', 'hack')).toThrow(/updateSkill.*SKILL\.md/i);
  });

  it('should prevent path traversal', () => {
    store.createSkill('test-skill', SKILL_MD);
    expect(() => store.getSkillFile('test-skill', '../../etc/passwd')).toThrow('Invalid file path');
  });
});
