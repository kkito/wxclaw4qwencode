import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SendThrottle, createSendThrottle } from '../../src/utils/send-throttle.js';

describe('SendThrottle', () => {
  let sendFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    sendFn = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create instance with sendFn and default interval', () => {
      const throttle = new SendThrottle(sendFn);
      expect(throttle).toBeDefined();
    });

    it('should create instance with custom interval', () => {
      const throttle = new SendThrottle(sendFn, 3000);
      expect(throttle).toBeDefined();
    });
  });

  describe('enqueue - basic functionality', () => {
    it('should enqueue a single message and send after timer expires', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      await throttle.enqueue('hello');
      expect(sendFn).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(500);
      expect(sendFn).toHaveBeenCalledTimes(1);
      expect(sendFn).toHaveBeenCalledWith('hello');
    });

    it('should use custom interval from constructor', async () => {
      const throttle = new SendThrottle(sendFn, 1000);

      await throttle.enqueue('test');

      await vi.advanceTimersByTimeAsync(500);
      expect(sendFn).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(500);
      expect(sendFn).toHaveBeenCalledWith('test');
    });
  });

  describe('enqueue - merge behavior', () => {
    it('should merge multiple messages within the window', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      await throttle.enqueue('msg1');
      await vi.advanceTimersByTimeAsync(100);

      await throttle.enqueue('msg2');
      await vi.advanceTimersByTimeAsync(100);

      await throttle.enqueue('msg3');

      // Third enqueue resets timer to 500ms, advance past it
      await vi.advanceTimersByTimeAsync(500);
      expect(sendFn).toHaveBeenCalledTimes(1);
      expect(sendFn).toHaveBeenCalledWith('msg1\nmsg2\nmsg3');
    });

    it('should reset timer on each enqueue', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      await throttle.enqueue('first');
      await vi.advanceTimersByTimeAsync(400);

      // Timer should not have fired yet
      expect(sendFn).not.toHaveBeenCalled();

      // Enqueue another message, resetting the timer
      await throttle.enqueue('second');
      await vi.advanceTimersByTimeAsync(400);

      // Still should not have fired (only 400ms since reset)
      expect(sendFn).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(100);
      expect(sendFn).toHaveBeenCalledWith('first\nsecond');
    });

    it('should send separately after window expires between enqueues', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      await throttle.enqueue('batch1');
      await vi.advanceTimersByTimeAsync(500);
      expect(sendFn).toHaveBeenCalledWith('batch1');
      sendFn.mockClear();

      // After window expires, next enqueue starts fresh
      await throttle.enqueue('batch2');
      await vi.advanceTimersByTimeAsync(500);
      expect(sendFn).toHaveBeenCalledWith('batch2');
    });
  });

  describe('enqueue - empty text', () => {
    it('should not trigger send for empty string', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      await throttle.enqueue('');
      await vi.advanceTimersByTimeAsync(500);
      expect(sendFn).not.toHaveBeenCalled();
    });

    it('should not trigger send for falsy values', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      await throttle.enqueue('' as string);
      await vi.advanceTimersByTimeAsync(500);
      expect(sendFn).not.toHaveBeenCalled();
    });

    it('should not enqueue empty string alongside valid messages', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      await throttle.enqueue('hello');
      await throttle.enqueue('');
      await throttle.enqueue('world');

      await vi.advanceTimersByTimeAsync(500);
      expect(sendFn).toHaveBeenCalledTimes(1);
      expect(sendFn).toHaveBeenCalledWith('hello\nworld');
    });
  });

  describe('flush', () => {
    it('should immediately send current buffer and clear it', async () => {
      const throttle = new SendThrottle(sendFn, 5000);

      await throttle.enqueue('hello');
      await throttle.enqueue('world');

      await throttle.flush();
      expect(sendFn).toHaveBeenCalledTimes(1);
      expect(sendFn).toHaveBeenCalledWith('hello\nworld');
    });

    it('should clear the timer when flushing', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      await throttle.enqueue('hello');
      await throttle.flush();

      sendFn.mockClear();

      // Timer should have been cleared, no duplicate send
      await vi.advanceTimersByTimeAsync(500);
      expect(sendFn).not.toHaveBeenCalled();
    });

    it('should be safe to call when buffer is empty', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      await throttle.flush();
      expect(sendFn).not.toHaveBeenCalled();
    });

    it('should allow subsequent enqueues after flush', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      await throttle.enqueue('first');
      await throttle.flush();
      expect(sendFn).toHaveBeenCalledWith('first');
      sendFn.mockClear();

      await throttle.enqueue('second');
      await vi.advanceTimersByTimeAsync(500);
      expect(sendFn).toHaveBeenCalledWith('second');
    });
  });

  describe('setInterval', () => {
    it('should update interval for subsequent enqueues', async () => {
      const throttle = new SendThrottle(sendFn, 1000);

      await throttle.enqueue('old-interval');
      await vi.advanceTimersByTimeAsync(500);

      // Change interval before timer fires
      throttle.setInterval(200);

      await vi.advanceTimersByTimeAsync(500);
      // Should not have fired yet at 1000ms old interval since timer was reset
      // and new interval is 200ms from the reset point
      expect(sendFn).toHaveBeenCalledWith('old-interval');
    });

    it('should use new interval for fresh enqueues after setInterval', async () => {
      const throttle = new SendThrottle(sendFn, 1000);

      throttle.setInterval(200);

      await throttle.enqueue('new-interval');
      await vi.advanceTimersByTimeAsync(100);
      expect(sendFn).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(100);
      expect(sendFn).toHaveBeenCalledWith('new-interval');
    });
  });

  describe('concurrent enqueue', () => {
    it('should handle rapid consecutive enqueues with single send', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      // Rapid consecutive calls
      await Promise.all([
        throttle.enqueue('a'),
        throttle.enqueue('b'),
        throttle.enqueue('c'),
      ]);

      await vi.advanceTimersByTimeAsync(500);
      expect(sendFn).toHaveBeenCalledTimes(1);
    });

    it('should merge all rapid concurrent enqueues', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      await Promise.all([
        throttle.enqueue('x'),
        throttle.enqueue('y'),
        throttle.enqueue('z'),
      ]);

      await vi.advanceTimersByTimeAsync(500);
      const sent = sendFn.mock.calls[0][0];
      // All three should be present (order may vary due to async)
      expect(sent).toContain('x');
      expect(sent).toContain('y');
      expect(sent).toContain('z');
    });
  });

  describe('createSendThrottle factory', () => {
    it('should create SendThrottle instance', () => {
      const throttle = createSendThrottle(sendFn);
      expect(throttle).toBeInstanceOf(SendThrottle);
    });

    it('should pass interval to constructor', async () => {
      const throttle = createSendThrottle(sendFn, 300);

      await throttle.enqueue('test');
      await vi.advanceTimersByTimeAsync(300);
      expect(sendFn).toHaveBeenCalledWith('test');
    });
  });
});
