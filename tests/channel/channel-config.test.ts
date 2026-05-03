import { describe, it, expect } from 'vitest';
import { ChannelSchema, ConfigSchema } from '../../src/config.js';

describe('Channel config schema', () => {
  describe('ChannelSchema', () => {
    it('should accept default channel config', () => {
      const result = ChannelSchema.parse({});
      expect(result.weixin.enabled).toBe(true);
      expect(result.wecom.enabled).toBe(false);
      expect(result.wecom.botId).toBe('');
      expect(result.wecom.secret).toBe('');
    });

    it('should accept wecom enabled with credentials', () => {
      const result = ChannelSchema.parse({
        weixin: { enabled: true },
        wecom: { enabled: true, botId: 'bot-123', secret: 'secret-456' },
      });
      expect(result.wecom.enabled).toBe(true);
      expect(result.wecom.botId).toBe('bot-123');
      expect(result.wecom.secret).toBe('secret-456');
    });

    it('should accept partial wecom config with defaults', () => {
      const result = ChannelSchema.parse({
        wecom: { enabled: true },
      });
      expect(result.wecom.enabled).toBe(true);
      expect(result.wecom.botId).toBe('');
      expect(result.wecom.secret).toBe('');
    });

    it('should accept wecom disabled', () => {
      const result = ChannelSchema.parse({
        wecom: { enabled: false },
      });
      expect(result.wecom.enabled).toBe(false);
    });
  });

  describe('ConfigSchema with channel', () => {
    it('should validate full config with channel', () => {
      const config = {
        log: { level: 'info' },
        agentscope: {
          model: {
            type: 'custom' as const,
            baseUrl: 'https://api.example.com/v1',
            modelName: 'gpt-4o',
          },
          sysPrompt: 'test',
        },
        channel: {
          weixin: { enabled: true },
          wecom: { enabled: true, botId: 'bot-1', secret: 'sec-1' },
        },
      };

      const result = ConfigSchema.parse(config);
      expect(result.channel.wecom.enabled).toBe(true);
      expect(result.channel.wecom.botId).toBe('bot-1');
    });

    it('should include default channel when not specified', () => {
      const config = {
        log: { level: 'info' },
        agentscope: {
          model: {
            type: 'custom' as const,
            baseUrl: 'https://api.example.com/v1',
            modelName: 'gpt-4o',
          },
          sysPrompt: 'test',
        },
      };

      const result = ConfigSchema.parse(config);
      expect(result.channel).toBeDefined();
      expect(result.channel.weixin.enabled).toBe(true);
      expect(result.channel.wecom.enabled).toBe(false);
    });
  });
});
