import { CommandManifest } from './schema.js';

export interface SlashCommandResult {
  handled: boolean;
  reply?: string;
}

export interface SlashCommandContext {
  userId: string;
  text: string;
  sendMessage: (text: string) => Promise<void>;
}

export type SlashCommandHandler = (
  args: string,
  context: SlashCommandContext,
) => Promise<SlashCommandResult>;

export interface RegisteredCommand extends Omit<CommandManifest, 'handler'> {
  handler: SlashCommandHandler;
  dirPath: string;
}
