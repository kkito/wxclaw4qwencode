import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AgentRunner, createAgentRunner } from '../../src/runner/agent-runner';
import * as configModule from '../../src/config';

describe('AgentRunner', () => {
  let runner: AgentRunner;
  let mockSendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSendMessage = vi.fn().mockResolvedValue(undefined);

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
    });
  });

  describe('constructor', () => {
    it('should create runner with bridge', () => {
      expect(runner.getBridge()).toBeDefined();
    });
  });

  describe('start/stop', () => {
    it('should start and stop runner', async () => {
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runner.start();
      expect(consoleLog).toHaveBeenCalledWith('AgentRunner started');

      await runner.stop();
      expect(consoleLog).toHaveBeenCalledWith('AgentRunner stopped');

      consoleLog.mockRestore();
    });
  });
});

describe('createAgentRunner', () => {
  let mockSendMessage: ReturnType<typeof vi.fn>;
  let mockLoadConfig: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSendMessage = vi.fn().mockResolvedValue(undefined);
    mockLoadConfig = vi.spyOn(configModule, 'loadConfig').mockReturnValue({
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
    mockLoadConfig.mockRestore();
  });

  it('should create runner with custom config', async () => {
    const customConfig = {
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
  });
});