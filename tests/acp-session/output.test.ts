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

  it('tool call clears buffer and discards accumulated text', () => {
    output.onAgentMessageChunk('🔧 正在调用: call_xxx', 'user1', sendMock);
    expect(sendMock).not.toHaveBeenCalled();

    output.onToolCall({ name: 'call_xxx' }, 'user1', sendMock);

    // buffer 被清空，后续 flush 也不会发送之前的文本
    output.flush('user1', sendMock);
    expect(sendMock).not.toHaveBeenCalled();
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

describe('AcpWeixinOutput heartbeat', () => {
  let output: AcpWeixinOutput;
  let sendMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    output = new AcpWeixinOutput({
      prefix: '[ACP]\n',
      flushIntervalMs: 3000,
      flushThresholdChars: 200,
    });
    sendMock = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('startHeartbeat begins tracking activity', () => {
    output.startHeartbeat('user1', sendMock);
    expect(output['heartbeats'].has('user1')).toBe(true);
  });

  it('sends heartbeat message after 5 minutes of inactivity', () => {
    output.startHeartbeat('user1', sendMock);
    sendMock.mockClear();

    // 心跳检查间隔 60 秒，超时 5 分钟
    vi.advanceTimersByTime(60 * 1000); // 第一次检查，未到 5 分钟
    expect(sendMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(4 * 60 * 1000); // 总共 5 分钟
    vi.advanceTimersByTime(60 * 1000); // 触发检查
    expect(sendMock).toHaveBeenCalledWith('⏳ 仍在工作中...');
  });

  it('sends heartbeat only once per activity period', () => {
    output.startHeartbeat('user1', sendMock);
    sendMock.mockClear();

    // 推进到触发心跳
    vi.advanceTimersByTime(6 * 60 * 1000);
    expect(sendMock).toHaveBeenCalledTimes(1);

    // 继续推进，不应该再次发送
    vi.advanceTimersByTime(5 * 60 * 1000);
    vi.advanceTimersByTime(60 * 1000);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('recordSent resets heartbeat timer', () => {
    output.startHeartbeat('user1', sendMock);

    // 推进到接近触发
    vi.advanceTimersByTime(4 * 60 * 1000);
    vi.advanceTimersByTime(55 * 1000);

    // 模拟发送了消息
    output.recordSent('user1');

    // 继续推进，不应触发（因为刚重置）
    vi.advanceTimersByTime(60 * 1000);
    expect(sendMock).not.toHaveBeenCalled();

    // 再推进 5 分钟才触发
    vi.advanceTimersByTime(4 * 60 * 1000 + 5 * 1000);
    vi.advanceTimersByTime(60 * 1000);
    expect(sendMock).toHaveBeenCalledWith('⏳ 仍在工作中...');
  });

  it('stopHeartbeat removes tracking and clears timer', () => {
    output.startHeartbeat('user1', sendMock);
    expect(output['heartbeats'].has('user1')).toBe(true);

    output.stopHeartbeat('user1');
    expect(output['heartbeats'].has('user1')).toBe(false);

    // 即使推进时间也不会发送心跳
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('startHeartbeat is idempotent', () => {
    output.startHeartbeat('user1', sendMock);
    const firstState = output['heartbeats'].get('user1');

    output.startHeartbeat('user1', sendMock);
    const secondState = output['heartbeats'].get('user1');

    expect(firstState).toBe(secondState); // 同一个对象，没有重复创建
  });
});
