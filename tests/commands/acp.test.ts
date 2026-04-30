import { describe, it, expect, vi, beforeEach } from 'vitest';
import createAcpHandler from '../../src/commands/acp/handler.js';

describe('/acp command handler', () => {
  let handler: ReturnType<typeof createAcpHandler>;
  let sendMock: ReturnType<typeof vi.fn>;
  let mockManager: any;
  let mockFs: any;

  beforeEach(() => {
    sendMock = vi.fn().mockResolvedValue(undefined);
    mockManager = {
      hasActiveSession: vi.fn().mockReturnValue(false),
      createSession: vi.fn().mockImplementation(async (_userId, _cwd, sendToWeixin) => {
        await sendToWeixin('✅ 已进入 ACP 模式\n工作目录: /home/user/project\n发送 exit 退出');
      }),
    };
    mockFs = {
      existsSync: vi.fn().mockReturnValue(true),
      statSync: vi.fn().mockReturnValue({ isDirectory: () => true }),
    };
    handler = createAcpHandler(mockManager, mockFs);
  });

  it('creates session with valid path', async () => {
    const result = await handler('/home/user/project', {
      userId: 'user1',
      text: '/acp /home/user/project',
      sendMessage: sendMock,
    });

    expect(result.handled).toBe(true);
    expect(mockManager.createSession).toHaveBeenCalledWith('user1', '/home/user/project', expect.any(Function));
    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('已进入 ACP 模式'));
  });

  it('prompts when no path provided', async () => {
    const result = await handler('', {
      userId: 'user1',
      text: '/acp',
      sendMessage: sendMock,
    });

    expect(result.handled).toBe(true);
    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('请提供项目路径'));
  });

  it('warns when path does not exist', async () => {
    mockFs.existsSync.mockReturnValue(false);

    const result = await handler('/nonexistent', {
      userId: 'user1',
      text: '/acp /nonexistent',
      sendMessage: sendMock,
    });

    expect(result.handled).toBe(true);
    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('不存在'));
  });

  it('warns when already in ACP mode', async () => {
    mockManager.hasActiveSession.mockReturnValue(true);

    const result = await handler('/tmp', {
      userId: 'user1',
      text: '/acp /tmp',
      sendMessage: sendMock,
    });

    expect(result.handled).toBe(true);
    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('已经在 ACP 模式中'));
    expect(mockManager.createSession).not.toHaveBeenCalled();
  });

  it('warns when path is not a directory', async () => {
    mockFs.statSync.mockReturnValue({ isDirectory: () => false });

    const result = await handler('/tmp/file.txt', {
      userId: 'user1',
      text: '/acp /tmp/file.txt',
      sendMessage: sendMock,
    });

    expect(result.handled).toBe(true);
    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('不是目录'));
  });
});
