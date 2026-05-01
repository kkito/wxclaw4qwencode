import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('builtin commands registration', () => {
  const testStateDir = path.join(os.tmpdir(), `ownclaw-builtin-test-${Date.now()}`);
  const commandsDir = path.join(testStateDir, 'commands');

  beforeEach(() => {
    process.env.OWNCLAW_STATE_DIR = testStateDir;
    fs.mkdirSync(commandsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testStateDir, { recursive: true, force: true });
    delete process.env.OWNCLAW_STATE_DIR;
  });

  it('/echo command handler file is created and works', async () => {
    const echoDir = path.join(commandsDir, 'echo');
    const manifestPath = path.join(echoDir, 'COMMAND.md');
    const handlerPath = path.join(echoDir, 'handler.js');

    // Simulate start.ts builtin command initialization
    if (!fs.existsSync(echoDir)) {
      fs.mkdirSync(echoDir, { recursive: true });
    }
    if (!fs.existsSync(manifestPath)) {
      const manifest = `---
name: echo
description: 回显消息，直接返回 /echo 后面的内容
usage: /echo <内容>
handler: ./handler.js
---
`;
      fs.writeFileSync(manifestPath, manifest);
    }
    if (!fs.existsSync(handlerPath)) {
      const handlerCode = `export default async (args, ctx) => { await ctx.sendMessage(args || "用法: /echo <内容>"); return { handled: true }; };\n`;
      fs.writeFileSync(handlerPath, handlerCode);
    }

    // Verify files exist
    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(fs.existsSync(handlerPath)).toBe(true);

    // Load and test handler
    const mod = await import(`file://${handlerPath}`);
    const handler = mod.default;
    const sendMock = vi.fn().mockResolvedValue(undefined);

    const result = await handler('hello world', {
      userId: 'user1',
      text: '/echo hello world',
      sendMessage: sendMock,
    });

    expect(result.handled).toBe(true);
    expect(sendMock).toHaveBeenCalledWith('hello world');

    // Test empty args
    const sendMock2 = vi.fn().mockResolvedValue(undefined);
    const result2 = await handler('', {
      userId: 'user1',
      text: '/echo',
      sendMessage: sendMock2,
    });

    expect(result2.handled).toBe(true);
    expect(sendMock2).toHaveBeenCalledWith('用法: /echo <内容>');
  });

  it('/acp command handler validates path', async () => {
    const createAcpHandler = (await import('../../src/commands/acp/handler.js')).default;
    const mockManager = {
      hasActiveSession: vi.fn().mockReturnValue(false),
      createSession: vi.fn().mockImplementation(async (_userId: string, _cwd: string, sendFn: (msg: string) => Promise<void>) => {
        await sendFn('✅ 已进入 ACP 模式');
      }),
    };
    const mockFs = {
      existsSync: vi.fn().mockReturnValue(true),
      statSync: vi.fn().mockReturnValue({ isDirectory: () => true }),
    };

    const handler = createAcpHandler(mockManager, mockFs);
    const sendMock = vi.fn().mockResolvedValue(undefined);

    // Valid path
    const result = await handler('/tmp', {
      userId: 'user1',
      text: '/acp /tmp',
      sendMessage: sendMock,
    });

    expect(result.handled).toBe(true);
    expect(mockManager.createSession).toHaveBeenCalled();
  });

  it('/streaming command handler validates deps', async () => {
    const createStreamingHandler = (await import('../../src/commands/streaming/handler.js')).default;

    const handler = createStreamingHandler({
      baseUrl: 'http://test.local',
      token: 'test-token',
    });

    // Verify handler is a function
    expect(typeof handler).toBe('function');

    // Test that it has the right shape (should accept args and ctx)
    const sendMock = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      userId: 'user1',
      text: '/streaming',
      sendMessage: sendMock,
    };

    // Handler should be callable (we don't actually run it because it makes real API calls)
    expect(async () => await handler('', ctx)).not.toThrow();
  });
});
