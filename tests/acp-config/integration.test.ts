import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as storeModule from '../../src/acp-config/store.js';
import * as scannerModule from '../../src/acp-config/scanner.js';
import * as selectorModule from '../../src/acp-config/selector.js';
import createAcpHandler from '../../src/commands/acp/handler.js';

/**
 * Integration test: /acp scan → list → /acp 2 → create session
 */
describe('/acp scan-then-select integration', () => {
  let sendMock: ReturnType<typeof vi.fn>;
  let mockManager: any;
  let mockFs: any;

  beforeEach(() => {
    sendMock = vi.fn().mockResolvedValue(undefined);
    mockManager = {
      hasActiveSession: vi.fn().mockReturnValue(false),
      createSession: vi.fn().mockResolvedValue(undefined),
    };
    mockFs = {
      existsSync: vi.fn().mockReturnValue(true),
      statSync: vi.fn().mockReturnValue({ isDirectory: () => true }),
    };
    vi.clearAllMocks();
  });

  it('full flow: scan lists dirs, select creates session', async () => {
    vi.spyOn(storeModule, 'loadAcpProjectDirs').mockResolvedValue(['/root']);
    vi.spyOn(scannerModule, 'scanProjectDirs').mockResolvedValue([
      { index: 1, name: 'alpha', path: '/root/alpha', root: '/root' },
      { index: 2, name: 'beta', path: '/root/beta', root: '/root' },
    ]);
    vi.spyOn(selectorModule, 'selectProjectByIndex').mockResolvedValue({
      path: '/root/beta',
    });

    const handler = createAcpHandler(mockManager, mockFs);

    // Step 1: /acp → lists dirs
    await handler('', {
      userId: 'u1',
      text: '/acp',
      sendMessage: sendMock,
    });

    const sent = sendMock.mock.calls[0][0] as string;
    expect(sent).toContain('alpha');
    expect(sent).toContain('beta');
    expect(mockManager.createSession).not.toHaveBeenCalled();

    // Step 2: /acp 2 → creates session
    sendMock.mockClear();
    await handler('2', {
      userId: 'u1',
      text: '/acp 2',
      sendMessage: sendMock,
    });

    expect(mockManager.createSession).toHaveBeenCalledWith(
      'u1',
      '/root/beta',
      expect.any(Function),
    );
  });
});
