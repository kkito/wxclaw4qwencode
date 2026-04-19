export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LoggerOptions {
  level: LogLevel;
  prefix?: string;
}

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

class ConsoleLogger implements Logger {
  private level: LogLevel;
  private prefix: string;

  constructor(options: LoggerOptions) {
    this.level = options.level;
    this.prefix = options.prefix || '';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    return `[${timestamp}] ${levelStr} ${this.prefix}${message}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message), ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message), ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message), ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message), ...args);
    }
  }
}

export interface LoggerConfig {
  level: LogLevel;
  prefix?: string;
}

let globalLogger: Logger | null = null;

export function createLogger(config: LoggerConfig): Logger {
  return new ConsoleLogger(config);
}

export function setGlobalLogger(logger: Logger): void {
  globalLogger = logger;
}

export function getGlobalLogger(): Logger {
  if (!globalLogger) {
    globalLogger = createLogger({ level: 'info' });
  }
  return globalLogger;
}