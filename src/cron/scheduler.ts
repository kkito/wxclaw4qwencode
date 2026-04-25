import cron, { ScheduledTask } from 'node-cron';
import { CronJob } from './types.js';
import { CronExecutor } from './executor.js';

export class CronScheduler {
  private scheduledTasks: Map<string, ScheduledTask> = new Map();
  private executor: CronExecutor;

  constructor(executor: CronExecutor) {
    this.executor = executor;
  }

  scheduleJob(job: CronJob): void {
    if (!job.enabled) {
      return;
    }

    this.stopJob(job.id);

    const task = cron.schedule(job.cron, async () => {
      try {
        await this.executor.executeAndLog(job.id, job.command);
      } catch (error) {
        console.error(`[Cron] Job ${job.id} execution error:`, error);
      }
    });

    this.scheduledTasks.set(job.id, task);
    task.start();

    console.log(`[Cron] Scheduled job "${job.name}" (${job.cron})`);
  }

  stopJob(jobId: string): void {
    const task = this.scheduledTasks.get(jobId);
    if (task) {
      task.stop();
      this.scheduledTasks.delete(jobId);
      console.log(`[Cron] Stopped job ${jobId}`);
    }
  }

  stopAll(): void {
    for (const [id, task] of this.scheduledTasks.entries()) {
      task.stop();
    }
    this.scheduledTasks.clear();
    console.log('[Cron] All scheduled tasks stopped');
  }

  get scheduledCount(): number {
    return this.scheduledTasks.size;
  }
}
