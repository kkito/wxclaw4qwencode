import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AcpWeixinOutput } from '../../src/acp-session/output.js';

describe('AcpWeixinOutput', () => {
  let output: AcpWeixinOutput;
  let sendMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    output = new AcpWeixinOutput({
      prefix: '[ACP 模式] 工作目录: /test\n---\n',
      flushIntervalMs: 3000,
      flushThresholdChars: 200,
    });
    sendMock = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends when character threshold is reached', () => {
    const longText = 'a'.repeat(200);
    output.onAgentMessageChunk(longText, 'user1', sendMock);
    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0][0]).toContain('[ACP 模式]');
    expect(sendMock.mock.calls[0][0]).toContain(longText);
  });

  it('sends when time threshold is reached', () => {
    output.onAgentMessageChunk('Hello', 'user1', sendMock);
    vi.advanceTimersByTime(3100);
    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0][0]).toContain('Hello');
  });

  it('flush forces send', () => {
    output.onAgentMessageChunk('partial', 'user1', sendMock);
    expect(sendMock).not.toHaveBeenCalled();

    output.flush('user1', sendMock);
    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0][0]).toContain('partial');
  });

  it('independent buffers per user', () => {
    output.onAgentMessageChunk('msg1', 'user1', sendMock);
    output.onAgentMessageChunk('msg2', 'user2', sendMock);

    output.flush('user1', sendMock);
    expect(sendMock).toHaveBeenNthCalledWith(1, expect.stringContaining('msg1'));

    output.flush('user2', sendMock);
    expect(sendMock).toHaveBeenNthCalledWith(2, expect.stringContaining('msg2'));
  });

  it('tool call does not send to wechat (only logs to console)', () => {
    output.onAgentMessageChunk('some text', 'user1', sendMock);
    output.onToolCall({ name: 'read_file' }, 'user1', sendMock);
    // 工具调用不发送给微信用户,所以只发送了一次(消息内容)
    expect(sendMock).not.toHaveBeenCalled(); // 还没到阈值
  });

  it('onComplete flushes remaining text', () => {
    output.onAgentMessageChunk('final answer', 'user1', sendMock);
    output.onComplete('user1', sendMock);
    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0][0]).toContain('final answer');
  });

  it('cleanup removes buffer and clears timer', () => {
    output.onAgentMessageChunk('text', 'user1', sendMock);
    output.cleanup('user1');
    expect(output['buffers'].has('user1')).toBe(false);
  });
});
