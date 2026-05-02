import { AcpClient } from '../acp/client.js';
import type { LongTask, ExecutorConfig } from './types.js';
import type { PromptResponse, SessionUpdate } from '@agentclientprotocol/sdk';

export interface TaskResult {
  status: 'success' | 'failed' | 'timeout';
  startedAt: string;
  endedAt: string;
  result?: string;
  confirmResponse?: string;
}

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export class ExecutorRunner {
  async run(
    task: LongTask,
    config: ExecutorConfig,
    onOutput?: (text: string) => void,
  ): Promise<TaskResult> {
    const startedAt = new Date().toISOString();
    const client = new AcpClient({ cwd: task.projectId, autoApprove: true });

    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;

    const resetTimeout = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        reject(new Error('TIMEOUT'));
      }, TIMEOUT_MS);
    };

    let reject: (reason: Error) => void;
    const timeoutPromise = new Promise<never>((_, rej) => {
      reject = rej as (reason: Error) => void;
      resetTimeout();
    });

    // Accumulate text from session updates
    let accumulatedText = '';
    let confirmAccumulatedText = '';
    let stage: 'initial' | 'confirm' = 'initial';

    client.setSessionUpdateCallback((update: SessionUpdate) => {
      if (update.sessionUpdate === 'agent_message_chunk' && 'content' in update) {
        const content = update.content as { type: string; text?: string };
        if (content.type === 'text' && content.text) {
          if (stage === 'initial') {
            accumulatedText += content.text;
          } else {
            confirmAccumulatedText += content.text;
          }
          if (onOutput) {
            onOutput(content.text);
          }
          // Reset timeout on each update — activity means the task is still alive
          resetTimeout();
        }
      }
    });

    try {
      await client.start();

      const initialPrompt = task.initialPrompt ?? config.defaultInitialPrompt;
      const confirmPrompt = task.confirmPrompt ?? config.defaultConfirmPrompt;

      // Stage 1: Send initial prompt (specPath + initialPrompt)
      const promptText = `${task.specPath}\n\n${initialPrompt}`;
      const stage1Response: PromptResponse = await Promise.race([
        client.sendMessage(promptText),
        timeoutPromise,
      ]);

      // Stage 2: If normal completion (end_turn), send confirm prompt
      let result: TaskResult;

      if (stage1Response.stopReason === 'end_turn') {
        stage = 'confirm';
        const confirmPromptText = confirmPrompt || '任务是否完成？请回复是或否。';
        const confirmResponse = await Promise.race([
          client.sendMessage(confirmPromptText),
          timeoutPromise,
        ]);

        result = {
          status: confirmResponse.stopReason === 'end_turn' ? 'success' : 'failed',
          startedAt,
          endedAt: new Date().toISOString(),
          result: accumulatedText.slice(-500), // Last 500 chars as summary
          confirmResponse: confirmAccumulatedText.slice(-500),
        };
      } else {
        // Non-normal completion (max_tokens, etc.)
        result = {
          status: 'failed',
          startedAt,
          endedAt: new Date().toISOString(),
          result: `stopReason: ${stage1Response.stopReason}. ${accumulatedText.slice(-200)}`,
        };
      }

      return result;
    } catch (error: unknown) {
      const endedAt = new Date().toISOString();
      if (timedOut || (error instanceof Error && error.message === 'TIMEOUT')) {
        return { status: 'timeout', startedAt, endedAt };
      }
      return {
        status: 'failed',
        startedAt,
        endedAt,
        result: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}
