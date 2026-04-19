/**
 * 重试工具模块
 *
 * 提供可配置的重试逻辑，支持：
 * - 初始快速重试阶段（前 N 次）
 * - 递增等待时间阶段
 * - 最大总时长限制
 * - 可自定义的错误判断
 */

export interface RetryOptions {
  /** 初始超时时间（毫秒），默认 35000 */
  timeout?: number;
  /** 初始快速重试次数，默认 3 */
  initialRetries?: number;
  /** 初始快速重试间隔（毫秒），默认 30000 */
  initialInterval?: number;
  /** 递增等待时间数组（毫秒），默认 [60000, 120000, 180000] */
  waitTimes?: number[];
  /** 超过等待时间数组后的固定等待时间（毫秒），默认 300000 (5分钟) */
  constantWait?: number;
  /** 最大总时长（毫秒），默认 1800000 (30分钟) */
  maxTotalTime?: number;
  /** 重试回调（每次重试前调用） */
  onRetry?: (attempt: number, error: Error, waitTime: number) => void;
  /** 判断是否应该重试（返回 false 则立即抛出错误） */
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalTime: number;
}

/**
 * 带重试的异步函数执行
 *
 * @param fn 要执行的异步函数
 * @param options 重试配置选项
 * @returns Promise<RetryResult<T>> 执行结果
 *
 * @example
 * const result = await withRetry(async () => {
 *   return await fetchData();
 * }, {
 *   timeout: 35000,
 *   initialRetries: 3,
 *   initialInterval: 30000,
 *   waitTimes: [60000, 120000, 180000],
 *   constantWait: 300000,
 *   maxTotalTime: 1800000,
 *   onRetry: (attempt, error, waitTime) => {
 *     console.log(`第 ${attempt} 次失败，${waitTime / 1000}s 后重试: ${error.message}`);
 *   }
 * });
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const {
    timeout = 35000,
    initialRetries = 3,
    initialInterval = 30000,
    waitTimes = [60000, 120000, 180000],
    constantWait = 300000,
    maxTotalTime = 1800000,
    onRetry,
    shouldRetry = () => true,
  } = options;

  const startTime = Date.now();
  let attempt = 0;

  while (true) {
    attempt++;

    // 检查是否超过最大总时长
    const elapsed = Date.now() - startTime;
    if (elapsed >= maxTotalTime) {
      return {
        success: false,
        error: new Error(`超过最大重试时间限制 (${maxTotalTime}ms)`),
        attempts: attempt,
        totalTime: elapsed,
      };
    }

    try {
      // 使用 timeout 执行函数
      const data = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('操作超时')), timeout)
        ),
      ]);

      return {
        success: true,
        data,
        attempts: attempt,
        totalTime: Date.now() - startTime,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // 判断是否应该重试
      if (!shouldRetry(err, attempt)) {
        return {
          success: false,
          error: err,
          attempts: attempt,
          totalTime: Date.now() - startTime,
        };
      }

      // 计算等待时间
      // initialRetries: 前 N 次失败使用初始间隔 (initialInterval)
      // 例如 initialRetries=3 表示前 3 次失败后等待 initialInterval
      // 第 initialRetries+1 次失败后使用 waitTimes[0]
      let waitTime: number;
      if (initialRetries === 0) {
        // 不重试
        return {
          success: false,
          error: err,
          attempts: attempt,
          totalTime: Date.now() - startTime,
        };
      } else if (attempt <= initialRetries) {
        waitTime = initialInterval;
      } else {
        const idx = attempt - initialRetries - 1;
        waitTime = idx < waitTimes.length ? waitTimes[idx] : constantWait;
      }

      // 回调
      if (onRetry) {
        onRetry(attempt, err, waitTime);
      }

      // 等待后继续重试
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
}

/**
 * 创建带重试的函数包装器
 *
 * @param fn 要包装的函数
 * @param options 重试配置选项
 * @returns 包装后的函数
 *
 * @example
 * const fetchWithRetry = retryable(fetchData, {
 *   maxTotalTime: 1800000,
 * });
 * const result = await fetchWithRetry();
 */
export function retryable<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: RetryOptions = {}
): (...args: Parameters<T>) => Promise<RetryResult<Awaited<ReturnType<T>>>> {
  return (...args: Parameters<T>): Promise<RetryResult<Awaited<ReturnType<T>>>> => {
    return withRetry(() => fn(...args), options);
  };
}