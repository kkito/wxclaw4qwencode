// Type declarations for openclaw-weixin internal modules
// These are needed because we import directly from src/ paths

declare module 'openclaw/plugin-sdk/account-id' {
  export function normalizeAccountId(id: string): string;
}

declare module 'openclaw/plugin-sdk/core' {
  export interface OpenClawConfig {
    // Add minimal types needed
    [key: string]: unknown;
  }
  export interface ChannelPlugin {
    id: string;
    [key: string]: unknown;
  }
}

declare module 'openclaw/plugin-sdk/config-runtime' {
  export function loadConfig(): Promise<unknown>;
  export function writeConfigFile(config: unknown): Promise<void>;
}

declare module 'openclaw/plugin-sdk/infra-runtime' {
  export function resolvePreferredOpenClawTmpDir(): string;
  export function withFileLock(path: string, fn: () => Promise<void>): Promise<void>;
}

declare module 'qrcode-terminal' {
  const qrcode: {
    generate(text: string, options?: { small?: boolean }): void;
  };
  export = qrcode;
}