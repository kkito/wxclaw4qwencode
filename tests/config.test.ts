import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, ConfigSchema } from '../src/config';
import * as configStore from '../src/config-store';

// Mock config-store to return empty model config
vi.mock('../src/config-store', () => ({
  loadModelConfig: vi.fn().mockResolvedValue({}),
}));

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('should return undefined baseUrl when neither env nor config-store has it', async () => {
      delete process.env.AGENT_MODEL_BASE_URL;
      const config = await loadConfig();
      expect(config.agentscope.model.baseUrl).toBeUndefined();
    });

    it('should load config from env vars', async () => {
      process.env.AGENT_MODEL_BASE_URL = 'https://api.example.com/v1';
      process.env.AGENT_MODEL_NAME = 'gpt-4o';
      process.env.AGENT_SYS_PROMPT = 'Test prompt';

      const config = await loadConfig();

      expect(config.agentscope.model.baseUrl).toBe('https://api.example.com/v1');
      expect(config.agentscope.model.modelName).toBe('gpt-4o');
      expect(config.agentscope.sysPrompt).toBe('Test prompt');
    });

    it('should use default model name when not set', async () => {
      process.env.AGENT_MODEL_BASE_URL = 'https://api.example.com/v1';
      delete process.env.AGENT_MODEL_NAME;

      const config = await loadConfig();

      expect(config.agentscope.model.modelName).toBe('gpt-4o');
    });

    it('should use default sysPrompt when not set', async () => {
      process.env.AGENT_MODEL_BASE_URL = 'https://api.example.com/v1';
      delete process.env.AGENT_SYS_PROMPT;

      const config = await loadConfig();

      expect(config.agentscope.sysPrompt).toBe('你是一个友好的 AI 助手。');
    });

    it('should include optional apiKey when set', async () => {
      process.env.AGENT_MODEL_BASE_URL = 'https://api.example.com/v1';
      process.env.AGENT_MODEL_API_KEY = 'test-key';

      const config = await loadConfig();

      expect(config.agentscope.model.apiKey).toBe('test-key');
    });

    it('should not include apiKey when not set', async () => {
      process.env.AGENT_MODEL_BASE_URL = 'https://api.example.com/v1';
      delete process.env.AGENT_MODEL_API_KEY;

      const config = await loadConfig();

      expect(config.agentscope.model.apiKey).toBeUndefined();
    });

    it('should merge config-store values when env vars are absent', async () => {
      vi.mocked(configStore.loadModelConfig).mockResolvedValue({
        baseUrl: 'https://stored.example.com/v1',
        modelName: 'claude-3',
        sysPrompt: 'Stored prompt',
      });

      delete process.env.AGENT_MODEL_BASE_URL;
      delete process.env.AGENT_MODEL_NAME;
      delete process.env.AGENT_SYS_PROMPT;

      const config = await loadConfig();

      expect(config.agentscope.model.baseUrl).toBe('https://stored.example.com/v1');
      expect(config.agentscope.model.modelName).toBe('claude-3');
      expect(config.agentscope.sysPrompt).toBe('Stored prompt');
    });

    it('should prefer env vars over config-store', async () => {
      vi.mocked(configStore.loadModelConfig).mockResolvedValue({
        baseUrl: 'https://stored.example.com/v1',
        modelName: 'claude-3',
      });

      process.env.AGENT_MODEL_BASE_URL = 'https://env.example.com/v1';
      process.env.AGENT_MODEL_NAME = 'gpt-4o';

      const config = await loadConfig();

      expect(config.agentscope.model.baseUrl).toBe('https://env.example.com/v1');
      expect(config.agentscope.model.modelName).toBe('gpt-4o');
    });
  });

  describe('ConfigSchema', () => {
    it('should validate correct config', () => {
      const validConfig = {
        log: {
          level: 'info',
        },
        agentscope: {
          model: {
            type: 'custom',
            baseUrl: 'https://api.example.com/v1',
            modelName: 'gpt-4o',
          },
          sysPrompt: 'Test prompt',
        },
      };

      expect(() => ConfigSchema.parse(validConfig)).not.toThrow();
    });

    it('should validate config without baseUrl', () => {
      const validConfig = {
        log: {
          level: 'info',
        },
        agentscope: {
          model: {
            type: 'custom',
            modelName: 'gpt-4o',
          },
          sysPrompt: 'Test prompt',
        },
      };

      expect(() => ConfigSchema.parse(validConfig)).not.toThrow();
    });

    it('should reject config with invalid type', () => {
      const invalidConfig = {
        agentscope: {
          model: {
            type: 'invalid',
            baseUrl: 'https://api.example.com/v1',
            modelName: 'gpt-4o',
          },
          sysPrompt: 'Test prompt',
        },
      };

      expect(() => ConfigSchema.parse(invalidConfig)).toThrow();
    });
  });
});