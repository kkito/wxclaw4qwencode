export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'timeout';

export interface LongTask {
  id: string;
  projectId: string;
  specPath: string;
  initialPrompt: string | null;
  confirmPrompt: string | null;
  status: TaskStatus;
  startedAt: string | null;
  endedAt: string | null;
  result: string | null;
  confirmResponse: string | null;
  createdAt: string;
}

export interface ExecutorConfig {
  defaultInitialPrompt: string;
  defaultConfirmPrompt: string;
}
