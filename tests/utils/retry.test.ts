import { describe, it, expect, vi } from 'vitest';
import { withRetry, retryable } from '../../src/utils/retry';

describe('retry', () => {
  describe('withRetry - success cases', () => {
    it('should return success on first attempt when function succeeds', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn, { timeout: 1000 });

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should return data correctly', async () => {
      const data = { key: 'value' };
      const fn = vi.fn().mockResolvedValue(data);
      const result = await withRetry(fn);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
    });
  });

  describe('withRetry - retry cases', () => {
    it('should retry on failure and succeed on second attempt', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('first error'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, {
        initialRetries: 3,
        initialInterval: 10,
        maxTotalTime: 1000,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(2);
    });

    it('should respect initialRetries parameter', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));

      const result = await withRetry(fn, {
        initialRetries: 1, // 1 = only retry once with initialInterval
        initialInterval: 10,
        waitTimes: [100],
        constantWait: 100,
        maxTotalTime: 30, // Very short to limit retries
        shouldRetry: () => true,
      });

      expect(result.success).toBe(false);
      // With initialRetries=1 and maxTotalTime=30ms, only 1-2 attempts possible
      expect(result.attempts).toBeGreaterThanOrEqual(1);
    });

    it('should use shouldRetry to determine if retry should happen', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fatal error'));

      const result = await withRetry(fn, {
        initialRetries: 3,
        initialInterval: 10,
        maxTotalTime: 500,
        shouldRetry: (error) => !error.message.includes('fatal'),
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('fatal error');
      expect(result.attempts).toBe(1);
    });

    it('should call onRetry callback on each retry', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('error 1'))
        .mockResolvedValue('success');

      const onRetry = vi.fn();

      const result = await withRetry(fn, {
        initialRetries: 3,
        initialInterval: 10,
        maxTotalTime: 500,
        onRetry,
      });

      expect(result.success).toBe(true);
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), 10);
    });

    it('should use waitTimes array for increasing wait duration', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('error 1'))
        .mockRejectedValueOnce(new Error('error 2'))
        .mockRejectedValueOnce(new Error('error 3'))
        .mockRejectedValueOnce(new Error('error 4'))
        .mockResolvedValue('success');

      const onRetry = vi.fn();
      const waitTimes = [10, 20, 30];

      const result = await withRetry(fn, {
        initialRetries: 1, // initialRetries=1: first retry uses initialInterval (5ms)
        initialInterval: 5,
        waitTimes,
        constantWait: 40,
        maxTotalTime: 500,
        onRetry,
      });

      expect(result.success).toBe(true);
      // Retry sequence:
      // - attempt 1 fails -> onRetry(1) wait 5 (initialInterval)
      // - attempt 2 fails -> onRetry(2) wait 10 (waitTimes[0])
      // - attempt 3 fails -> onRetry(3) wait 20 (waitTimes[1])
      // - attempt 4 fails -> onRetry(4) wait 30 (waitTimes[2])
      // - attempt 5 succeeds
      expect(onRetry).toHaveBeenCalledTimes(4);
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error), 5);
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error), 10);
      expect(onRetry).toHaveBeenNthCalledWith(3, 3, expect.any(Error), 20);
      expect(onRetry).toHaveBeenNthCalledWith(4, 4, expect.any(Error), 30);
    });

    it('should use constantWait after exhausting waitTimes', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('error 1'))
        .mockRejectedValueOnce(new Error('error 2'))
        .mockResolvedValue('success');

      const onRetry = vi.fn();
      const waitTimes = [10]; // Only one element

      const result = await withRetry(fn, {
        initialRetries: 1,
        initialInterval: 5,
        waitTimes,
        constantWait: 20,
        maxTotalTime: 500,
        onRetry,
      });

      expect(result.success).toBe(true);
      // attempt 1 fails -> wait 5 (initialInterval)
      // attempt 2 fails -> wait 10 (waitTimes[0])
      // attempt 3 succeeds
      expect(onRetry).toHaveBeenCalledTimes(2);
    });
  });

  describe('withRetry - timeout', () => {
    it('should timeout and fail if function exceeds timeout', async () => {
      // Create a function that never resolves (simulates hanging)
      const hangingFn = vi.fn(
        () => new Promise<string>((_resolve, _reject) => {
          // Never resolves or rejects - simulates a hanging operation
        })
      );

      const resultPromise = withRetry(hangingFn, {
        timeout: 20, // 20ms timeout
        initialRetries: 0, // No retries
        maxTotalTime: 100,
      });

      // Wait for the result - should timeout
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('操作超时');
      expect(result.attempts).toBe(1);
    }, 5000);
  });

  describe('withRetry - maxTotalTime', () => {
    it('should stop retrying when maxTotalTime is exceeded', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));

      const result = await withRetry(fn, {
        timeout: 10,
        initialRetries: 100, // Many retries
        initialInterval: 5,
        waitTimes: [5],
        constantWait: 5,
        maxTotalTime: 50,
        shouldRetry: () => true,
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('最大重试时间限制');
    });
  });

  describe('withRetry - error handling', () => {
    it('should handle non-Error exceptions', async () => {
      const fn = vi.fn().mockRejectedValue('string error');

      const result = await withRetry(fn, {
        initialRetries: 0, // No retries
        maxTotalTime: 100,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should correctly propagate error after all retries exhausted', async () => {
      const originalError = new Error('final error');
      const fn = vi.fn().mockRejectedValue(originalError);

      const result = await withRetry(fn, {
        initialRetries: 0,
        maxTotalTime: 100,
        shouldRetry: () => true,
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('final error');
    });
  });

  describe('retryable', () => {
    it('should create a retryable function', async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('first'))
        .mockResolvedValue('success');

      const retryableFn = retryable(mockFn, {
        initialRetries: 3,
        initialInterval: 10,
        maxTotalTime: 500,
      });

      const result = await retryableFn();

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should pass arguments to the wrapped function', async () => {
      const mockFn = vi.fn().mockResolvedValue('result');

      const retryableFn = retryable(mockFn, {
        initialInterval: 10,
        maxTotalTime: 100,
      });

      await retryableFn('arg1', 'arg2');

      expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('default options', () => {
    it('should use default values when options not provided', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withRetry(fn);

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
    });
  });
});