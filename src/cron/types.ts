/**
 * Cron 定时任务定义
 */
export interface CronJob {
  /** 唯一标识 */
  id: string;
  /** 任务名称 */
  name: string;
  /** cron 表达式 (如 "0 2 * * *") */
  cron: string;
  /** 要执行的 bash 命令 */
  command: string;
  /** 是否启用 */
  enabled: boolean;
  /** 创建时间 */
  createdAt: string;
  /** 最后更新时间 */
  updatedAt: string;
}

/**
 * Cron 任务执行日志条目
 */
export interface CronLogEntry {
  /** 执行时间 */
  executedAt: string;
  /** 退出码 (0 表示成功) */
  exitCode: number;
  /** 执行耗时(毫秒) */
  durationMs: number;
  /** 标准输出 */
  stdout: string;
  /** 标准错误 */
  stderr: string;
}

/**
 * Cron 管理器配置
 */
export interface CronManagerConfig {
  /** 状态目录 (默认 ~/.ownclaw/cron) */
  stateDir?: string;
}
