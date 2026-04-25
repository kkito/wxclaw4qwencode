import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { CronJobStore } from './store.js';
import { CronLogEntry } from './types.js';

const execAsync = promisify(exec);

export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export class CronExecutor {
  private store: CronJobStore;

  constructor(store: CronJobStore) {
    this.store = store;
  }

  async executeJob(command: string): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 300_000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const durationMs = Date.now() - startTime;

      return {
        exitCode: 0,
        stdout,
        stderr,
        durationMs,
      };
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;

      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        'stdout' in error &&
        'stderr' in error
      ) {
        const execError = error as {
          code: number;
          stdout: string;
          stderr: string;
        };
        return {
          exitCode: execError.code ?? 1,
          stdout: execError.stdout ?? '',
          stderr: execError.stderr ?? '',
          durationMs,
        };
      }

      return {
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        durationMs,
      };
    }
  }

  async executeAndLog(jobId: string, command: string): Promise<ExecutionResult> {
    const result = await this.executeJob(command);

    const logEntry: CronLogEntry = {
      executedAt: new Date().toISOString(),
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      stdout: result.stdout,
      stderr: result.stderr,
    };

    this.store.appendLog(jobId, logEntry);

    return result;
  }
}
