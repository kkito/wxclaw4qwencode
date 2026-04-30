import { describe, it, expect } from 'vitest';
import { CommandManifestSchema } from '../../src/slash-command/schema.js';

describe('CommandManifestSchema', () => {
  it('accepts valid frontmatter', () => {
    const input = {
      name: 'acp',
      description: 'Enter ACP dev mode',
      usage: '/acp /path/to/project',
      handler: './handler.ts',
    };
    const result = CommandManifestSchema.parse(input);
    expect(result.name).toBe('acp');
    expect(result.handler).toBe('./handler.ts');
  });

  it('rejects missing name', () => {
    const input = { description: 'test', handler: './handler.ts' };
    expect(() => CommandManifestSchema.parse(input)).toThrow();
  });

  it('rejects missing handler', () => {
    const input = { name: 'test', description: 'test' };
    expect(() => CommandManifestSchema.parse(input)).toThrow();
  });

  it('rejects path traversal handlers', () => {
    const input = { name: 'test', description: 'test', handler: '../escape.ts' };
    expect(() => CommandManifestSchema.parse(input)).toThrow();
  });
});
