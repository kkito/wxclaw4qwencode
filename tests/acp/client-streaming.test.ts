import { describe, it, expect, vi } from 'vitest';
import { AcpClient } from '../../src/acp/client.js';

describe('AcpClient streaming callback', () => {
  it('setSessionUpdateCallback stores the callback', () => {
    const client = new AcpClient({ cwd: '/tmp', autoApprove: true });
    const cb = vi.fn();
    client.setSessionUpdateCallback(cb);
    // Verify no crash - the callback is stored in the ref object
    expect(typeof client['sessionUpdateRef'].cb).toBe('function');
  });
});
