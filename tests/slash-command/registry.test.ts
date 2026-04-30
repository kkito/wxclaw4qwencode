import { describe, it, expect, vi } from 'vitest';
import { SlashCommandRegistry } from '../../src/slash-command/registry.js';
import type { SlashCommandHandler, RegisteredCommand } from '../../src/slash-command/types.js';

describe('SlashCommandRegistry', () => {
  const mockHandler: SlashCommandHandler = vi.fn();
  const mockCmd: RegisteredCommand = {
    name: 'test',
    description: 'Test command',
    handler: mockHandler,
    dirPath: '/tmp/test',
  };

  it('register and get command', () => {
    const registry = new SlashCommandRegistry();
    registry.register('test', mockCmd);
    const cmd = registry.get('test');
    expect(cmd).toBeDefined();
    expect(cmd!.name).toBe('test');
  });

  it('returns undefined for non-existent command', () => {
    const registry = new SlashCommandRegistry();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('hasCommand checks existence', () => {
    const registry = new SlashCommandRegistry();
    registry.register('foo', mockCmd);
    expect(registry.hasCommand('foo')).toBe(true);
    expect(registry.hasCommand('bar')).toBe(false);
  });

  it('listNames returns all command names', () => {
    const registry = new SlashCommandRegistry();
    registry.register('a', { ...mockCmd, name: 'a', dirPath: '/tmp/a' });
    registry.register('b', { ...mockCmd, name: 'b', dirPath: '/tmp/b' });
    const names = registry.listNames();
    expect(names.sort()).toEqual(['a', 'b']);
  });
});
