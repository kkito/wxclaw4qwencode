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
    it('should send first message immediately', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      await throttle.enqueue('user1', 'hello');
      expect(sendFn).toHaveBeenCalledTimes(1);
      expect(sendFn).toHaveBeenCalledWith('user1', 'hello');
    });

    it('should send first message immediately without waiting for timer', async () => {
      const throttle = new SendThrottle(sendFn, 5000);

      await throttle.enqueue('user1', 'hello');
      expect(sendFn).toHaveBeenCalledTimes(1);

      // Even after long time, no more sends (first was immediate)
      await vi.advanceTimersByTimeAsync(10000);
      expect(sendFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('enqueue - merge behavior', () => {
    it('should merge subsequent messages within the window', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      await throttle.enqueue('user1', 'msg1'); // immediate send
      expect(sendFn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(100);

      await throttle.enqueue('user1', 'msg2'); // starts timer, buffers
      await vi.advanceTimersByTimeAsync(100);

      await throttle.enqueue('user1', 'msg3'); // resets timer, appends to buffer

      await vi.advanceTimersByTimeAsync(500);
      expect(sendFn).toHaveBeenCalledTimes(2); // 1 immediate + 1 merged
      expect(sendFn).toHaveBeenLastCalledWith('user1', 'msg2\nmsg3');
    });

    it('should reset timer on each enqueue after first', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      await throttle.enqueue('user1', 'first'); // immediate
      expect(sendFn).toHaveBeenCalledTimes(1);

      await throttle.enqueue('user1', 'second'); // starts timer
      await vi.advanceTimersByTimeAsync(400);

      // Timer should not have fired yet
      expect(sendFn).toHaveBeenCalledTimes(1);

      await throttle.enqueue('user1', 'third'); // resets timer
      await vi.advanceTimersByTimeAsync(400);

      // Still should not have fired
      expect(sendFn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(100);
      expect(sendFn).toHaveBeenCalledTimes(2);
      expect(sendFn).toHaveBeenLastCalledWith('user1', 'second\nthird');
    });

    it('should send separately after window expires between enqueues', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      await throttle.enqueue('user1', 'batch1');
      expect(sendFn).toHaveBeenCalledTimes(1);
      expect(sendFn).toHaveBeenLastCalledWith('user1', 'batch1');

      await throttle.enqueue('user1', 'batch2'); // new pending, timer set
      await vi.advanceTimersByTimeAsync(500);
      expect(sendFn).toHaveBeenCalledTimes(2);
      expect(sendFn).toHaveBeenLastCalledWith('user1', 'batch2');

      await throttle.enqueue('user1', 'batch3'); // new pending, timer set
      await vi.advanceTimersByTimeAsync(500);
      expect(sendFn).toHaveBeenCalledTimes(3);
      expect(sendFn).toHaveBeenLastCalledWith('user1', 'batch3');
    });

    it('should handle multiple users independently', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      await throttle.enqueue('user1', 'msg for user1');
      await throttle.enqueue('user2', 'msg for user2');

      expect(sendFn).toHaveBeenCalledTimes(2);
      expect(sendFn).toHaveBeenCalledWith('user1', 'msg for user1');
      expect(sendFn).toHaveBeenCalledWith('user2', 'msg for user2');

      await throttle.enqueue('user1', 'followup user1');
      await throttle.enqueue('user2', 'followup user2');

      await vi.advanceTimersByTimeAsync(500);
      expect(sendFn).toHaveBeenCalledTimes(4);
    });
  });

  describe('enqueue - empty text', () => {
    it('should not trigger send for empty string', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      await throttle.enqueue('user1', '');
      expect(sendFn).not.toHaveBeenCalled();
    });

    it('should not enqueue empty string alongside valid messages', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      await throttle.enqueue('user1', 'hello'); // immediate
      expect(sendFn).toHaveBeenCalledTimes(1);

      await throttle.enqueue('user1', ''); // ignored
      await throttle.enqueue('user1', 'world'); // merged, timer set

      await vi.advanceTimersByTimeAsync(500);
      expect(sendFn).toHaveBeenCalledTimes(2);
      expect(sendFn).toHaveBeenLastCalledWith('user1', 'world');
    });
  });

  describe('flush', () => {
    it('should immediately send pending buffer for a user', async () => {
      const throttle = new SendThrottle(sendFn, 5000);

      await throttle.enqueue('user1', 'hello'); // immediate
      await throttle.enqueue('user1', 'world'); // pending in buffer

      await throttle.flush();
      expect(sendFn).toHaveBeenCalledTimes(2);
      expect(sendFn).toHaveBeenLastCalledWith('user1', 'world');
    });

    it('should flush multiple users', async () => {
      const throttle = new SendThrottle(sendFn, 5000);

      await throttle.enqueue('user1', 'a');
      await throttle.enqueue('user1', 'b');
      await throttle.enqueue('user2', 'c');
      await throttle.enqueue('user2', 'd');

      await throttle.flush();
      expect(sendFn).toHaveBeenCalledTimes(4);
    });

    it('should be safe to call when buffer is empty', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      await throttle.flush();
      expect(sendFn).not.toHaveBeenCalled();
    });

    it('should allow subsequent enqueues after flush', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      await throttle.enqueue('user1', 'first');
      await throttle.enqueue('user1', 'second');
      await throttle.flush();
      expect(sendFn).toHaveBeenCalledTimes(2);

      await throttle.enqueue('user1', 'third');
      expect(sendFn).toHaveBeenCalledTimes(3);
      expect(sendFn).toHaveBeenLastCalledWith('user1', 'third');
    });
  });

  describe('setInterval', () => {
    it('should update interval for subsequent enqueues', async () => {
      const throttle = new SendThrottle(sendFn, 1000);

      await throttle.enqueue('user1', 'first'); // immediate
      expect(sendFn).toHaveBeenCalledTimes(1);

      throttle.setInterval(200);

      await throttle.enqueue('user1', 'second'); // timer with new interval
      await vi.advanceTimersByTimeAsync(100);
      expect(sendFn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(100);
      expect(sendFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('concurrent enqueue', () => {
    it('should handle rapid consecutive enqueues', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      // First one is immediate, rest are buffered
      await throttle.enqueue('user1', 'a');
      expect(sendFn).toHaveBeenCalledTimes(1);

      await throttle.enqueue('user1', 'b');
      await throttle.enqueue('user1', 'c');

      await vi.advanceTimersByTimeAsync(500);
      expect(sendFn).toHaveBeenCalledTimes(2);
    });

    it('should handle concurrent enqueues for different users', async () => {
      const throttle = new SendThrottle(sendFn, 500);

      await Promise.all([
        throttle.enqueue('user1', 'a'),
        throttle.enqueue('user2', 'b'),
      ]);

      expect(sendFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('createSendThrottle factory', () => {
    it('should create SendThrottle instance', () => {
      const throttle = createSendThrottle(sendFn);
      expect(throttle).toBeInstanceOf(SendThrottle);
    });

    it('should pass interval to constructor', async () => {
      const throttle = createSendThrottle(sendFn, 300);

      await throttle.enqueue('user1', 'first'); // immediate
      await throttle.enqueue('user1', 'test'); // timer

      await vi.advanceTimersByTimeAsync(300);
      expect(sendFn).toHaveBeenCalledTimes(2);
    });
  });
});
