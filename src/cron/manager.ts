import { randomUUID } from 'node:crypto';
import { CronJobStore } from './store.js';
import { CronExecutor } from './executor.js';
import { CronScheduler } from './scheduler.js';
import { CronJob, CronManagerConfig, CronLogEntry } from './types.js';
import { CronJobSchema } from './schema.js';

export interface CreateJobInput {
  name: string;
  cron: string;
  command: string;
  enabled?: boolean;
}

export interface UpdateJobInput {
  name?: string;
  cron?: string;
  command?: string;
  enabled?: boolean;
}

export class CronManager {
  private store: CronJobStore;
  private executor: CronExecutor;
  private scheduler: CronScheduler;

  constructor(config: CronManagerConfig = {}) {
    const stateDir = config.stateDir || this.getDefaultStateDir();
    this.store = new CronJobStore(stateDir);
    this.executor = new CronExecutor(this.store);
    this.scheduler = new CronScheduler(this.executor);
  }

  private getDefaultStateDir(): string {
    const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
    return `${home}/.ownclaw/cron`;
  }

  initialize(): void {
    const jobs = this.store.loadJobs();
    for (const job of jobs) {
      if (job.enabled) {
        this.scheduler.scheduleJob(job);
      }
    }
    console.log(`[Cron] Initialized with ${this.scheduler.scheduledCount} scheduled jobs`);
  }

  createJob(input: CreateJobInput): CronJob {
    const now = new Date().toISOString();
    const job: CronJob = {
      id: `job_${randomUUID().substring(0, 8)}`,
      name: input.name,
      cron: input.cron,
      command: input.command,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };

    CronJobSchema.parse(job);

    this.store.addJob(job);

    if (job.enabled) {
      this.scheduler.scheduleJob(job);
    }

    return job;
  }

  listJobs(): CronJob[] {
    return this.store.loadJobs();
  }

  getJob(jobId: string): CronJob | undefined {
    return this.store.findJob(jobId);
  }

  updateJob(jobId: string, input: UpdateJobInput): CronJob {
    const job = this.store.findJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const updated: CronJob = {
      ...job,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.cron !== undefined && { cron: input.cron }),
      ...(input.command !== undefined && { command: input.command }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
      updatedAt: new Date().toISOString(),
    };

    CronJobSchema.parse(updated);

    this.store.updateJob(jobId, updated);

    this.scheduler.stopJob(jobId);
    if (updated.enabled) {
      this.scheduler.scheduleJob(updated);
    }

    return updated;
  }

  deleteJob(jobId: string): void {
    this.scheduler.stopJob(jobId);
    this.store.deleteJob(jobId);
  }

  async runJob(jobId: string): Promise<{ exitCode: number; stdout: string; stderr: string; durationMs: number }> {
    const job = this.store.findJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    return this.executor.executeAndLog(jobId, job.command);
  }

  getLogs(jobId: string): CronLogEntry[] {
    return this.store.readLogs(jobId);
  }

  clearLogs(jobId: string): void {
    this.store.clearLogs(jobId);
  }

  get scheduledCount(): number {
    return this.scheduler.scheduledCount;
  }

  shutdown(): void {
    this.scheduler.stopAll();
  }
}
