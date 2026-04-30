import * as fs from 'node:fs';
import * as path from 'node:path';
import { SlashCommandRegistry } from './registry.js';
import { CommandManifestSchema } from './schema.js';
import type { SlashCommandHandler } from './types.js';

export class SlashCommandLoader {
  private commandsDir: string;

  constructor(commandsDir: string) {
    this.commandsDir = commandsDir;
  }

  async loadCommands(registry: SlashCommandRegistry): Promise<void> {
    if (!fs.existsSync(this.commandsDir)) return;

    const entries = fs.readdirSync(this.commandsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const cmdDir = path.join(this.commandsDir, entry.name);
      const manifestPath = path.join(cmdDir, 'COMMAND.md');

      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest = await this.parseManifest(manifestPath);
        if (!manifest) continue;

        const handler = await this.loadHandler(cmdDir, manifest.handler);
        if (!handler) continue;

        registry.register(manifest.name, {
          ...manifest,
          handler,
          dirPath: cmdDir,
        });
      } catch (err) {
        console.error(`[SlashCommand] 加载命令 ${entry.name} 失败:`, err);
      }
    }
  }

  private async parseManifest(manifestPath: string): Promise<import('./schema.js').CommandManifest | null> {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      console.error(`[SlashCommand] ${manifestPath}: 没有 frontmatter`);
      return null;
    }

    const frontmatter = frontmatterMatch[1];
    const parsed: Record<string, unknown> = {};
    for (const line of frontmatter.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      parsed[key] = value;
    }

    try {
      return CommandManifestSchema.parse(parsed);
    } catch (err) {
      console.error(`[SlashCommand] ${manifestPath}: schema 验证失败:`, err);
      return null;
    }
  }

  private async loadHandler(cmdDir: string, handlerPath: string): Promise<SlashCommandHandler | null> {
    const resolved = path.resolve(cmdDir, handlerPath);
    if (!resolved.startsWith(cmdDir)) {
      console.error(`[SlashCommand] 拒绝路径穿越: ${handlerPath}`);
      return null;
    }

    if (!fs.existsSync(resolved)) {
      console.error(`[SlashCommand] handler 不存在: ${resolved}`);
      return null;
    }

    try {
      const mod = await import(`file://${resolved}`);
      return (mod.default as SlashCommandHandler) || null;
    } catch (err) {
      console.error(`[SlashCommand] 加载 handler 失败 ${resolved}:`, err);
      return null;
    }
  }
}
