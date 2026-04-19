import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AgentRunner, createAgentRunner } from '../../src/runner/agent-runner';
import * as configModule from '../../src/config';
import { Logger } from '../../src/logger';

describe('AgentRunner', () => {
  let runner: AgentRunner;
  let mockSendMessage: ReturnType<typeof vi.fn>;
  let mockLogger: Logger;

  beforeEach(() => {
    mockSendMessage = vi.fn().mockResolvedValue(undefined);
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    runner = new AgentRunner({
      model: {
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'test-key',
        modelName: 'gpt-4o',
      },
      sysPrompt: 'You are a helpful assistant.',
      weixin: {
        sendMessage: mockSendMessage,
      },
      logger: mockLogger,
    });
  });

  describe('constructor', () => {
    it('should create runner with bridge', () => {
      expect(runner.getBridge()).toBeDefined();
    });
  });

  describe('start/stop', () => {
    it('should start and stop runner', async () => {
      await runner.start();
      expect(mockLogger.info).toHaveBeenCalledWith('AgentRunner started');

      await runner.stop();
      expect(mockLogger.info).toHaveBeenCalledWith('AgentRunner stopped');
    });
  });
});

describe('createAgentRunner', () => {
  let mockSendMessage: ReturnType<typeof vi.fn>;
  let mockLoadConfig: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSendMessage = vi.fn().mockResolvedValue(undefined);
    mockLoadConfig = vi.spyOn(configModule, 'loadConfig').mockReturnValue({
      log: {
        level: 'info' as const,
      },
      agentscope: {
        model: {
          type: 'custom' as const,
          baseUrl: 'https://api.example.com/v1',
          apiKey: 'test-key',
          modelName: 'gpt-4o',
        },
        sysPrompt: 'You are a helpful assistant.',
      },
    });
  });

  afterEach(() => {
    mockLoadConfig.mockRestore();
  });

  it('should create and start runner with provided config', async () => {
    const runner = await createAgentRunner({
      weixin: {
        sendMessage: mockSendMessage,
      },
    });

    expect(runner).toBeDefined();
    expect(runner.getBridge()).toBeDefined();

    await runner.stop();
    mockLoadConfig.mockRestore();
  });

  it('should create runner with custom config', async () => {
    const customConfig = {
      log: {
        level: 'info' as const,
      },
      agentscope: {
        model: {
          type: 'custom' as const,
          baseUrl: 'https://custom.example.com/v1',
          apiKey: 'custom-key',
          modelName: 'custom-model',
        },
        sysPrompt: 'Custom prompt',
      },
    };

    const runner = await createAgentRunner({
      config: customConfig,
      weixin: {
        sendMessage: mockSendMessage,
      },
    });

    expect(runner).toBeDefined();
    expect(mockLoadConfig).not.toHaveBeenCalled();

    await runner.stop();
  });
});