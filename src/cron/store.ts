import fs from 'node:fs';
import path from 'node:path';
import { CronJob, CronLogEntry } from './types.js';

export class CronJobStore {
  private stateDir: string;
  private logsDir: string;

  constructor(stateDir: string) {
    this.stateDir = stateDir;
    this.logsDir = path.join(stateDir, 'logs');
    fs.mkdirSync(this.stateDir, { recursive: true });
    fs.mkdirSync(this.logsDir, { recursive: true });
  }

  private get jobsFile(): string {
    return path.join(this.stateDir, 'jobs.json');
  }

  private getLogPath(jobId: string): string {
    return path.join(this.logsDir, `${jobId}.json`);
  }

  loadJobs(): CronJob[] {
    if (!fs.existsSync(this.jobsFile)) {
      return [];
    }
    try {
      const content = fs.readFileSync(this.jobsFile, 'utf-8');
      return JSON.parse(content) as CronJob[];
    } catch {
      return [];
    }
  }

  saveJobs(jobs: CronJob[]): void {
    fs.writeFileSync(this.jobsFile, JSON.stringify(jobs, null, 2), 'utf-8');
  }

  addJob(job: CronJob): void {
    const jobs = this.loadJobs();
    jobs.push(job);
    this.saveJobs(jobs);
  }

  updateJob(jobId: string, updated: CronJob): void {
    const jobs = this.loadJobs();
    const index = jobs.findIndex((j) => j.id === jobId);
    if (index === -1) {
      throw new Error(`Job ${jobId} not found`);
    }
    jobs[index] = updated;
    this.saveJobs(jobs);
  }

  deleteJob(jobId: string): void {
    const jobs = this.loadJobs();
    const filtered = jobs.filter((j) => j.id !== jobId);
    if (filtered.length === jobs.length) {
      throw new Error(`Job ${jobId} not found`);
    }
    this.saveJobs(filtered);
  }

  findJob(jobId: string): CronJob | undefined {
    const jobs = this.loadJobs();
    return jobs.find((j) => j.id === jobId);
  }

  appendLog(jobId: string, entry: CronLogEntry): void {
    const logs = this.readLogs(jobId);
    logs.push(entry);
    const logPath = this.getLogPath(jobId);
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2), 'utf-8');
  }

  readLogs(jobId: string): CronLogEntry[] {
    const logPath = this.getLogPath(jobId);
    if (!fs.existsSync(logPath)) {
      return [];
    }
    try {
      const content = fs.readFileSync(logPath, 'utf-8');
      return JSON.parse(content) as CronLogEntry[];
    } catch {
      return [];
    }
  }

  clearLogs(jobId: string): void {
    const logPath = this.getLogPath(jobId);
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }
  }
}
