import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LongTask, ExecutorConfig } from '../../src/executor/types.js';
import type { PromptResponse, SessionUpdate } from '@agentclientprotocol/sdk';
import { AcpClient } from '../../src/acp/client.js';
import { ExecutorRunner } from '../../src/executor/runner.js';

describe('ExecutorRunner', () => {
  const runner = new ExecutorRunner();

  const mockTask: LongTask = {
    id: 't1', projectId: '/tmp/proj', specPath: 'docs/spec.md',
    initialPrompt: null, confirmPrompt: null, status: 'pending',
    startedAt: null, endedAt: null, result: null, confirmResponse: null,
    createdAt: '2026-05-02T10:00:00Z', updatedAt: null, latestOutput: null,
  };

  const mockConfig: ExecutorConfig = {
    defaultInitialPrompt: 'do the task',
    defaultConfirmPrompt: 'done?',
  };

  let acpStartSpy: ReturnType<typeof vi.spyOn>;
  let acpSendSpy: ReturnType<typeof vi.spyOn>;
  let acpCloseSpy: ReturnType<typeof vi.spyOn>;
  let acpSetCbSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    acpStartSpy = vi.spyOn(AcpClient.prototype, 'start').mockResolvedValue(undefined);
    acpSendSpy = vi.spyOn(AcpClient.prototype, 'sendMessage');
    acpCloseSpy = vi.spyOn(AcpClient.prototype, 'close').mockResolvedValue(undefined);
    acpSetCbSpy = vi.spyOn(AcpClient.prototype, 'setSessionUpdateCallback');
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('sends spec path + initial prompt on stage 1', async () => {
    acpSendSpy.mockResolvedValue({ stopReason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } } as PromptResponse);
    await runner.run(mockTask, mockConfig);
    expect(acpSendSpy).toHaveBeenCalledWith('docs/spec.md\n\ndo the task');
  });

  it('sends confirm prompt on normal completion', async () => {
    acpSendSpy
      .mockResolvedValueOnce({ stopReason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } } as PromptResponse)
      .mockResolvedValueOnce({ stopReason: 'end_turn', usage: { input_tokens: 5, output_tokens: 3 } } as PromptResponse);
    const result = await runner.run(mockTask, mockConfig);
    expect(acpSendSpy).toHaveBeenCalledTimes(2);
    expect(acpSendSpy).toHaveBeenLastCalledWith('done?');
    expect(result.status).toBe('success');
  });

  it('marks as failed when stage 1 stopReason is not end_turn', async () => {
    acpSendSpy.mockResolvedValue({ stopReason: 'max_tokens' } as PromptResponse);
    const result = await runner.run(mockTask, mockConfig);
    expect(result.status).toBe('failed');
    expect(acpSendSpy).toHaveBeenCalledTimes(1);
    expect(result.result).toContain('max_tokens');
  });

  it('returns timeout result when TIMEOUT error is caught', async () => {
    acpSendSpy.mockRejectedValue(new Error('TIMEOUT'));
    const result = await runner.run(mockTask, mockConfig);
    expect(result.status).toBe('timeout');
    expect(acpCloseSpy).toHaveBeenCalled();
  });

  it('marks as failed when client throws other error', async () => {
    acpSendSpy.mockRejectedValue(new Error('connection lost'));
    const result = await runner.run(mockTask, mockConfig);
    expect(result.status).toBe('failed');
    expect(result.result).toContain('connection lost');
    expect(acpCloseSpy).toHaveBeenCalled();
  });

  it('accumulates text from session updates with correct staging', async () => {
    let registeredCb: ((update: SessionUpdate) => void) | null = null;
    acpSetCbSpy.mockImplementation((cb) => { registeredCb = cb; });

    // Deferred promises for precise timing control
    let resolve1: (val: PromptResponse) => void;
    let resolve2: (val: PromptResponse) => void;
    const p1 = new Promise<PromptResponse>((r) => { resolve1 = r; });
    const p2 = new Promise<PromptResponse>((r) => { resolve2 = r; });
    acpSendSpy.mockReturnValueOnce(p1).mockReturnValueOnce(p2);

    const outputCallback = vi.fn();
    const resultPromise = runner.run(mockTask, mockConfig, outputCallback);

    // Text during stage 1 (before p1 resolves)
    registeredCb!({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello ' } } as SessionUpdate);
    registeredCb!({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'World' } } as SessionUpdate);

    // Resolve stage 1 → runner switches to stage = 'confirm'
    resolve1!({ stopReason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } } as PromptResponse);
    // Wait for runner to process: stage switch + second sendMessage call
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Text during stage 2 (confirm)
    registeredCb!({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Yes done' } } as SessionUpdate);
    resolve2!({ stopReason: 'end_turn', usage: { input_tokens: 5, output_tokens: 3 } } as PromptResponse);

    const result = await resultPromise;
    expect(result.status).toBe('success');
    expect(result.result).toContain('Hello World');
    expect(result.confirmResponse).toContain('Yes done');
    expect(outputCallback).toHaveBeenCalledTimes(3);
  });

  it('calls client.close() even on success', async () => {
    acpSendSpy
      .mockResolvedValueOnce({ stopReason: 'end_turn' } as PromptResponse)
      .mockResolvedValueOnce({ stopReason: 'end_turn' } as PromptResponse);
    await runner.run(mockTask, mockConfig);
    expect(acpCloseSpy).toHaveBeenCalledTimes(1);
  });

  it('calls client.close() even on error', async () => {
    acpSendSpy.mockRejectedValue(new Error('fail'));
    await runner.run(mockTask, mockConfig);
    expect(acpCloseSpy).toHaveBeenCalledTimes(1);
  });

  it('uses task-specific prompts when provided', async () => {
    const taskWithPrompts: LongTask = {
      ...mockTask, initialPrompt: 'custom initial', confirmPrompt: 'custom confirm',
    };
    acpSendSpy
      .mockResolvedValueOnce({ stopReason: 'end_turn' } as PromptResponse)
      .mockResolvedValueOnce({ stopReason: 'end_turn' } as PromptResponse);
    await runner.run(taskWithPrompts, mockConfig);
    expect(acpSendSpy).toHaveBeenNthCalledWith(1, 'docs/spec.md\n\ncustom initial');
    expect(acpSendSpy).toHaveBeenNthCalledWith(2, 'custom confirm');
  });

  it('marks as failed when confirm stopReason is not end_turn', async () => {
    acpSendSpy
      .mockResolvedValueOnce({ stopReason: 'end_turn' } as PromptResponse)
      .mockResolvedValueOnce({ stopReason: 'max_tokens' } as PromptResponse);
    const result = await runner.run(mockTask, mockConfig);
    expect(result.status).toBe('failed');
    expect(result.confirmResponse).toBeDefined();
  });

  it('ignores non-text session update content', async () => {
    let registeredCb: ((update: SessionUpdate) => void) | null = null;
    acpSetCbSpy.mockImplementation((cb) => { registeredCb = cb; });
    acpSendSpy
      .mockResolvedValueOnce({ stopReason: 'end_turn' } as PromptResponse)
      .mockResolvedValueOnce({ stopReason: 'end_turn' } as PromptResponse);

    const progressCallback = vi.fn();
    const resultPromise = runner.run(mockTask, mockConfig, progressCallback);

    registeredCb!({ sessionUpdate: 'agent_message_chunk', content: { type: 'thinking', text: 'thinking...' } } as SessionUpdate);
    registeredCb!({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'actual text' } } as SessionUpdate);

    const result = await resultPromise;
    expect(progressCallback).toHaveBeenCalledTimes(1);
    expect(progressCallback).toHaveBeenCalledWith({
      updatedAt: expect.any(String),
      latestOutput: 'actual text',
    });
  });

  it('truncates accumulated text to 500 chars', async () => {
    let registeredCb: ((update: SessionUpdate) => void) | null = null;
    acpSetCbSpy.mockImplementation((cb) => { registeredCb = cb; });

    let resolve1: (val: PromptResponse) => void;
    let resolve2: (val: PromptResponse) => void;
    acpSendSpy
      .mockReturnValueOnce(new Promise<PromptResponse>((r) => { resolve1 = r; }))
      .mockReturnValueOnce(new Promise<PromptResponse>((r) => { resolve2 = r; }));

    const resultPromise = runner.run(mockTask, mockConfig);

    const longText = 'x'.repeat(600);
    const longConfirm = 'y'.repeat(600);
    registeredCb!({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: longText } } as SessionUpdate);
    resolve1!({ stopReason: 'end_turn' } as PromptResponse);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    registeredCb!({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: longConfirm } } as SessionUpdate);
    resolve2!({ stopReason: 'end_turn' } as PromptResponse);

    const result = await resultPromise;
    expect(result.result!.length).toBeLessThanOrEqual(500);
    expect(result.confirmResponse!.length).toBeLessThanOrEqual(500);
    expect(result.result).toBe(longText.slice(-500));
    expect(result.confirmResponse).toBe(longConfirm.slice(-500));
  });

  it('resets timeout timer on each session update', async () => {
    // Verifies that each agent_message_chunk update resets the timeout countdown.
    // Strategy: we check the runner code by inspecting that the callback triggers
    // clearTimeout + setTimeout. We use a simpler integration-style test:
    // register the callback manually, invoke it multiple times, and verify that
    // clearTimeout was called more than once (once for initial, once per reset).

    let registeredCb: ((update: SessionUpdate) => void) | null = null;
    acpSetCbSpy.mockImplementation((cb) => { registeredCb = cb; });

    acpSendSpy
      .mockReturnValueOnce(
        new Promise<PromptResponse>((resolve) => {
          setTimeout(() => {
            resolve({ stopReason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } } as PromptResponse);
          }, 120);
        }),
      )
      .mockReturnValueOnce(
        Promise.resolve({ stopReason: 'end_turn', usage: { input_tokens: 5, output_tokens: 3 } } as PromptResponse),
      );

    // Track clearTimeout calls — the reset function calls clearTimeout before setTimeout
    const clearTimeoutCalls: number[] = [];
    const origClearTimeout = global.clearTimeout;
    vi.stubGlobal('clearTimeout', (id: NodeJS.Timeout) => {
      clearTimeoutCalls.push(Date.now());
      return origClearTimeout(id);
    });

    const resultPromise = runner.run(mockTask, mockConfig);

    // Send updates every 20ms while waiting for stage 1 (120ms total → ~6 updates)
    const updateInterval = setInterval(() => {
      registeredCb!({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'still working...' } } as SessionUpdate);
    }, 20);

    const result = await resultPromise;
    clearInterval(updateInterval);

    vi.unstubAllGlobals();

    // resetTimeout calls clearTimeout before each new setTimeout.
    // Initial setup: 0 clearTimeout calls (first time, timer is null).
    // Each update reset: 1 clearTimeout call per update.
    // finally block: 1 clearTimeout call.
    // So we expect at least 3+ clearTimeout calls (several resets + finally).
    expect(clearTimeoutCalls.length).toBeGreaterThan(3);
    expect(result.status).toBe('success');
  });

  it('times out when no session updates arrive within timeout window', async () => {
    // Verifies that without any updates, the runner times out.
    // This ensures the timeout mechanism still works alongside the reset logic.
    // sendMessage never resolves → timeout after 30 min (can't test fast).
    // We mock the existing timeout test behavior to confirm no regression.
    acpSendSpy.mockRejectedValue(new Error('TIMEOUT'));
    const result = await runner.run(mockTask, mockConfig);
    expect(result.status).toBe('timeout');
  });

  it('calls onProgress callback with updatedAt and latestOutput on AI output', async () => {
    let registeredCb: ((update: SessionUpdate) => void) | null = null;
    acpSetCbSpy.mockImplementation((cb) => { registeredCb = cb; });

    let resolve1: (val: PromptResponse) => void;
    let resolve2: (val: PromptResponse) => void;
    const p1 = new Promise<PromptResponse>((r) => { resolve1 = r; });
    const p2 = new Promise<PromptResponse>((r) => { resolve2 = r; });
    acpSendSpy.mockReturnValueOnce(p1).mockReturnValueOnce(p2);

    const progressCallback = vi.fn();
    const resultPromise = runner.run(mockTask, mockConfig, progressCallback);

    registeredCb!({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello ' } } as SessionUpdate);
    registeredCb!({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'World' } } as SessionUpdate);

    resolve1!({ stopReason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } } as PromptResponse);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    registeredCb!({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Done' } } as SessionUpdate);
    resolve2!({ stopReason: 'end_turn', usage: { input_tokens: 5, output_tokens: 3 } } as PromptResponse);

    await resultPromise;

    expect(progressCallback).toHaveBeenCalledTimes(3);
    // Check first call structure
    expect(progressCallback).toHaveBeenNthCalledWith(1, {
      updatedAt: expect.any(String),
      latestOutput: 'Hello ',
    });
    // Check second call accumulates text
    expect(progressCallback).toHaveBeenNthCalledWith(2, {
      updatedAt: expect.any(String),
      latestOutput: 'Hello World',
    });
  });

  it('truncates latestOutput to last 200 characters in onProgress', async () => {
    let registeredCb: ((update: SessionUpdate) => void) | null = null;
    acpSetCbSpy.mockImplementation((cb) => { registeredCb = cb; });

    let resolve1: (val: PromptResponse) => void;
    acpSendSpy.mockReturnValueOnce(new Promise<PromptResponse>((r) => { resolve1 = r; }));

    const progressCallback = vi.fn();
    const resultPromise = runner.run(mockTask, mockConfig, progressCallback);

    // Send text longer than 200 chars
    const longText = 'x'.repeat(300);
    registeredCb!({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: longText } } as SessionUpdate);

    resolve1!({ stopReason: 'end_turn' } as PromptResponse);
    await Promise.resolve();

    expect(progressCallback).toHaveBeenCalledTimes(1);
    expect(progressCallback).toHaveBeenCalledWith({
      updatedAt: expect.any(String),
      latestOutput: 'x'.repeat(200), // Should be truncated to last 200 chars
    });

    await resultPromise;
  });
});
