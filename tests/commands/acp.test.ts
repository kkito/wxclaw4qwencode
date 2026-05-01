import { describe, it, expect, vi, beforeEach } from 'vitest';
import createAcpHandler from '../../src/commands/acp/handler.js';
import * as storeModule from '../../src/acp-config/store.js';
import * as selectorModule from '../../src/acp-config/selector.js';
import * as scannerModule from '../../src/acp-config/scanner.js';

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
});

describe('/acp command handler', () => {
  let handler: ReturnType<typeof createAcpHandler>;

  beforeEach(() => {
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
    vi.spyOn(storeModule, 'loadAcpProjectDirs').mockResolvedValue([]);
    const result = await handler('', {
      userId: 'user1',
      text: '/acp',
      sendMessage: sendMock,
    });

    expect(result.handled).toBe(true);
    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('未配置'));
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

describe('/acp scan mode', () => {
  it('prompts to configure dirs when no config exists', async () => {
    vi.spyOn(storeModule, 'loadAcpProjectDirs').mockResolvedValue([]);
    const handler = createAcpHandler(mockManager, mockFs);

    await handler('', {
      userId: 'user1',
      text: '/acp',
      sendMessage: sendMock,
    });

    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('未配置'));
    expect(mockManager.createSession).not.toHaveBeenCalled();
  });

  it('prompts when configured dirs have no subprojects', async () => {
    vi.spyOn(storeModule, 'loadAcpProjectDirs').mockResolvedValue(['/root']);
    vi.spyOn(scannerModule, 'scanProjectDirs').mockResolvedValue([]);
    const handler = createAcpHandler(mockManager, mockFs);

    await handler('', {
      userId: 'user1',
      text: '/acp',
      sendMessage: sendMock,
    });

    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('没有子项目'));
  });

  it('lists directories when config exists with subprojects', async () => {
    vi.spyOn(storeModule, 'loadAcpProjectDirs').mockResolvedValue(['/root']);
    vi.spyOn(scannerModule, 'scanProjectDirs').mockResolvedValue([
      { index: 1, name: 'alpha', path: '/root/alpha', root: '/root' },
      { index: 2, name: 'beta', path: '/root/beta', root: '/root' },
    ]);
    const handler = createAcpHandler(mockManager, mockFs);

    await handler('', {
      userId: 'user1',
      text: '/acp',
      sendMessage: sendMock,
    });

    const sent = sendMock.mock.calls[0][0] as string;
    expect(sent).toContain('alpha');
    expect(sent).toContain('beta');
    expect(sent).toContain('序号');
  });
});

describe('/acp select mode', () => {
  it('creates session for valid index', async () => {
    vi.spyOn(storeModule, 'loadAcpProjectDirs').mockResolvedValue(['/root']);
    vi.spyOn(selectorModule, 'selectProjectByIndex').mockResolvedValue({
      path: '/root/selected',
    });
    const handler = createAcpHandler(mockManager, mockFs);

    await handler('3', {
      userId: 'user1',
      text: '/acp 3',
      sendMessage: sendMock,
    });

    expect(mockManager.createSession).toHaveBeenCalledWith(
      'user1',
      '/root/selected',
      expect.any(Function),
    );
  });

  it('shows error for invalid index', async () => {
    vi.spyOn(storeModule, 'loadAcpProjectDirs').mockResolvedValue(['/root']);
    vi.spyOn(selectorModule, 'selectProjectByIndex').mockResolvedValue(null);
    const handler = createAcpHandler(mockManager, mockFs);

    await handler('99', {
      userId: 'user1',
      text: '/acp 99',
      sendMessage: sendMock,
    });

    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('序号'));
    expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('无效'));
    expect(mockManager.createSession).not.toHaveBeenCalled();
  });
});
