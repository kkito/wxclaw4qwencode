import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, ConfigSchema } from '../src/config';

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('should throw error when AGENT_MODEL_BASE_URL is not set', () => {
      delete process.env.AGENT_MODEL_BASE_URL;
      expect(() => loadConfig()).toThrow('AGENT_MODEL_BASE_URL 环境变量未设置');
    });

    it('should load config with required env vars', () => {
      process.env.AGENT_MODEL_BASE_URL = 'https://api.example.com/v1';
      process.env.AGENT_MODEL_NAME = 'gpt-4o';
      process.env.AGENT_SYS_PROMPT = 'Test prompt';

      const config = loadConfig();

      expect(config.agentscope.model.baseUrl).toBe('https://api.example.com/v1');
      expect(config.agentscope.model.modelName).toBe('gpt-4o');
      expect(config.agentscope.sysPrompt).toBe('Test prompt');
    });

    it('should use default model name when not set', () => {
      process.env.AGENT_MODEL_BASE_URL = 'https://api.example.com/v1';
      delete process.env.AGENT_MODEL_NAME;

      const config = loadConfig();

      expect(config.agentscope.model.modelName).toBe('gpt-4o');
    });

    it('should use default sysPrompt when not set', () => {
      process.env.AGENT_MODEL_BASE_URL = 'https://api.example.com/v1';
      delete process.env.AGENT_SYS_PROMPT;

      const config = loadConfig();

      expect(config.agentscope.sysPrompt).toBe('你是一个友好的 AI 助手。');
    });

    it('should include optional apiKey when set', () => {
      process.env.AGENT_MODEL_BASE_URL = 'https://api.example.com/v1';
      process.env.AGENT_MODEL_API_KEY = 'test-key';

      const config = loadConfig();

      expect(config.agentscope.model.apiKey).toBe('test-key');
    });

    it('should not include apiKey when not set', () => {
      process.env.AGENT_MODEL_BASE_URL = 'https://api.example.com/v1';
      delete process.env.AGENT_MODEL_API_KEY;

      const config = loadConfig();

      expect(config.agentscope.model.apiKey).toBeUndefined();
    });
  });

  describe('ConfigSchema', () => {
    it('should validate correct config', () => {
      const validConfig = {
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

    it('should reject config without baseUrl', () => {
      const invalidConfig = {
        agentscope: {
          model: {
            type: 'custom',
            modelName: 'gpt-4o',
          },
          sysPrompt: 'Test prompt',
        },
      };

      expect(() => ConfigSchema.parse(invalidConfig)).toThrow();
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