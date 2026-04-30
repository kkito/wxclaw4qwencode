import type { RegisteredCommand } from './types.js';

export class SlashCommandRegistry {
  private commands: Map<string, RegisteredCommand> = new Map();

  register(name: string, command: RegisteredCommand): void {
    this.commands.set(name, command);
  }

  get(name: string): RegisteredCommand | undefined {
    return this.commands.get(name);
  }

  hasCommand(name: string): boolean {
    return this.commands.has(name);
  }

  listNames(): string[] {
    return Array.from(this.commands.keys());
  }

  listAll(): RegisteredCommand[] {
    return Array.from(this.commands.values());
  }
}
