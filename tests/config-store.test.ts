import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Import from dist (compiled output) since vitest has trouble resolving
// src/config-store.js directly
import {
  resolveConfigDir,
  resolveConfigPath,
  loadConfig,
  saveConfig,
  loadSendThrottleInterval,
  saveSendThrottleInterval,
  loadModelConfig,
  saveModelConfig,
} from '../dist/config-store.js';

describe('config-store', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `ownclaw-config-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    // Override OWNCLAW_STATE_DIR for all tests in this describe block
    process.env.OWNCLAW_STATE_DIR = testDir;
  });

  afterEach(async () => {
    delete process.env.OWNCLAW_STATE_DIR;
    // Clean up temp directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    vi.restoreAllMocks();
  });

  describe('resolveConfigDir', () => {
    it('should use OWNCLAW_STATE_DIR when set', () => {
      const result = resolveConfigDir();
      expect(result).toBe(testDir);
    });

    it('should fall back to ~/.ownclaw when OWNCLAW_STATE_DIR is not set', () => {
      delete process.env.OWNCLAW_STATE_DIR;
      const result = resolveConfigDir();
      expect(result).toBe(path.join(os.homedir(), '.ownclaw'));
    });
  });

  describe('resolveConfigPath', () => {
    it('should return config.json path within config dir', () => {
      const result = resolveConfigPath();
      expect(result).toBe(path.join(testDir, 'config.json'));
    });
  });

  describe('loadConfig', () => {
    it('should return default config when file does not exist', async () => {
      const result = await loadConfig();
      expect(result).toEqual({
        sendThrottleIntervalMs: 5000,
        channel: {
          weixin: { enabled: true },
          wecom: { enabled: false, botId: '', secret: '' },
          feishu: { enabled: false, appId: '', appSecret: '' },
        },
      });
    });

    it('should load config from file when it exists', async () => {
      const config = {
        sendThrottleIntervalMs: 3000,
      };
      await fs.writeFile(
        path.join(testDir, 'config.json'),
        JSON.stringify(config, null, 2),
        'utf-8'
      );

      const result = await loadConfig();
      expect(result).toEqual({
        sendThrottleIntervalMs: 3000,
        channel: {
          weixin: { enabled: true },
          wecom: { enabled: false, botId: '', secret: '' },
          feishu: { enabled: false, appId: '', appSecret: '' },
        },
      });
    });

    it('should merge loaded config with defaults', async () => {
      // Write a config with only some fields
      await fs.writeFile(
        path.join(testDir, 'config.json'),
        JSON.stringify({ sendThrottleIntervalMs: 2000 }),
        'utf-8'
      );

      const result = await loadConfig();
      expect(result.sendThrottleIntervalMs).toBe(2000);
    });

    it('should return defaults when file content is invalid JSON', async () => {
      await fs.writeFile(
        path.join(testDir, 'config.json'),
        'not valid json',
        'utf-8'
      );

      const result = await loadConfig();
      expect(result).toEqual({
        sendThrottleIntervalMs: 5000,
        channel: {
          weixin: { enabled: true },
          wecom: { enabled: false, botId: '', secret: '' },
          feishu: { enabled: false, appId: '', appSecret: '' },
        },
      });
    });

    it('should handle empty file', async () => {
      await fs.writeFile(path.join(testDir, 'config.json'), '', 'utf-8');

      const result = await loadConfig();
      expect(result).toEqual({
        sendThrottleIntervalMs: 5000,
        channel: {
          weixin: { enabled: true },
          wecom: { enabled: false, botId: '', secret: '' },
          feishu: { enabled: false, appId: '', appSecret: '' },
        },
      });
    });
  });

  describe('saveConfig', () => {
    it('should save config to config.json', async () => {
      const config = {
        sendThrottleIntervalMs: 7000,
      };

      await saveConfig(config);

      const content = await fs.readFile(
        path.join(testDir, 'config.json'),
        'utf-8'
      );
      const parsed = JSON.parse(content);
      expect(parsed.sendThrottleIntervalMs).toBe(7000);
    });

    it('should create directory if it does not exist', async () => {
      const nestedDir = path.join(testDir, 'nested', 'deep');
      process.env.OWNCLAW_STATE_DIR = nestedDir;

      const config = {
        sendThrottleIntervalMs: 4000,
      };

      await saveConfig(config);

      const content = await fs.readFile(
        path.join(nestedDir, 'config.json'),
        'utf-8'
      );
      const parsed = JSON.parse(content);
      expect(parsed.sendThrottleIntervalMs).toBe(4000);

      // Cleanup nested dir
      try {
        await fs.rm(nestedDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    });

    it('should preserve all config fields', async () => {
      const config = {
        sendThrottleIntervalMs: 6000,
        channel: {
          weixin: { enabled: true },
          wecom: { enabled: false, botId: '', secret: '' },
        },
      };

      await saveConfig(config);
      const loaded = await loadConfig();
      expect(loaded).toEqual(config);
    });
  });

  describe('loadSendThrottleInterval', () => {
    it('should return default value when no config file exists', async () => {
      const result = await loadSendThrottleInterval();
      expect(result).toBe(5000);
    });

    it('should return configured value when config file exists', async () => {
      await fs.writeFile(
        path.join(testDir, 'config.json'),
        JSON.stringify({ sendThrottleIntervalMs: 3500 }),
        'utf-8'
      );

      const result = await loadSendThrottleInterval();
      expect(result).toBe(3500);
    });

    it('should return default when config has no sendThrottleIntervalMs', async () => {
      await fs.writeFile(
        path.join(testDir, 'config.json'),
        JSON.stringify({}),
        'utf-8'
      );

      const result = await loadSendThrottleInterval();
      expect(result).toBe(5000);
    });
  });

  describe('saveSendThrottleInterval', () => {
    it('should save throttle interval to config', async () => {
      await saveSendThrottleInterval(8000);

      const loaded = await loadSendThrottleInterval();
      expect(loaded).toBe(8000);
    });

    it('should preserve other config fields when saving', async () => {
      // First save a config with some value
      await saveConfig({ sendThrottleIntervalMs: 2000 });

      // Now save a different interval
      await saveSendThrottleInterval(9000);

      // Verify the saved value
      const loaded = await loadSendThrottleInterval();
      expect(loaded).toBe(9000);
    });

    it('should create config file if it does not exist', async () => {
      await saveSendThrottleInterval(1500);

      const content = await fs.readFile(
        path.join(testDir, 'config.json'),
        'utf-8'
      );
      const parsed = JSON.parse(content);
      expect(parsed.sendThrottleIntervalMs).toBe(1500);
    });
  });

  describe('loadModelConfig', () => {
    it('should return model section from config.json', async () => {
      const config = {
        model: {
          baseUrl: 'https://api.example.com/v1',
          modelName: 'gpt-4o',
          sysPrompt: 'Test prompt',
        },
      };
      await fs.writeFile(
        path.join(testDir, 'config.json'),
        JSON.stringify(config, null, 2),
        'utf-8'
      );

      const result = await loadModelConfig();
      expect(result).toEqual({
        baseUrl: 'https://api.example.com/v1',
        modelName: 'gpt-4o',
        sysPrompt: 'Test prompt',
      });
    });

    it('should return empty object on read failure', async () => {
      delete process.env.OWNCLAW_STATE_DIR;
      // Point to a nonexistent directory
      process.env.OWNCLAW_STATE_DIR = path.join(testDir, 'nonexistent');

      const result = await loadModelConfig();
      expect(result).toEqual({});
    });

    it('should return empty object when model section is absent', async () => {
      await fs.writeFile(
        path.join(testDir, 'config.json'),
        JSON.stringify({ sendThrottleIntervalMs: 5000 }),
        'utf-8'
      );

      const result = await loadModelConfig();
      expect(result).toEqual({});
    });
  });

  describe('saveModelConfig', () => {
    it('should merge with existing config and write correctly', async () => {
      // Pre-existing config with channel settings
      await fs.writeFile(
        path.join(testDir, 'config.json'),
        JSON.stringify({
          sendThrottleIntervalMs: 3000,
          channel: { weixin: { enabled: true } },
        }),
        'utf-8'
      );

      await saveModelConfig({
        baseUrl: 'https://api.example.com/v1',
        modelName: 'gpt-4o',
      });

      const content = await fs.readFile(
        path.join(testDir, 'config.json'),
        'utf-8'
      );
      const parsed = JSON.parse(content);
      expect(parsed.sendThrottleIntervalMs).toBe(3000);
      expect(parsed.model).toEqual({
        baseUrl: 'https://api.example.com/v1',
        modelName: 'gpt-4o',
      });
    });

    it('should update existing model fields without removing others', async () => {
      await fs.writeFile(
        path.join(testDir, 'config.json'),
        JSON.stringify({
          model: {
            baseUrl: 'https://old.example.com/v1',
            modelName: 'claude-3',
            sysPrompt: 'Old prompt',
          },
        }),
        'utf-8'
      );

      await saveModelConfig({ baseUrl: 'https://new.example.com/v1' });

      const content = await fs.readFile(
        path.join(testDir, 'config.json'),
        'utf-8'
      );
      const parsed = JSON.parse(content);
      expect(parsed.model).toEqual({
        baseUrl: 'https://new.example.com/v1',
        modelName: 'claude-3',
        sysPrompt: 'Old prompt',
      });
    });

    it('should create config file when it does not exist', async () => {
      await saveModelConfig({
        baseUrl: 'https://api.example.com/v1',
        modelName: 'gpt-4o',
      });

      const content = await fs.readFile(
        path.join(testDir, 'config.json'),
        'utf-8'
      );
      const parsed = JSON.parse(content);
      expect(parsed.model).toEqual({
        baseUrl: 'https://api.example.com/v1',
        modelName: 'gpt-4o',
      });
    });
  });
});
