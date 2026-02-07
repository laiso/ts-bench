import type { Command } from '../execution/types';
import type { FileList, AgentConfig } from './types';

export abstract class BaseAgentBuilder {
  constructor(protected config: AgentConfig) {}

  async buildCommand(instructions: string, fileList?: FileList): Promise<Command> {
    return {
      args: this.getCoreArgs(instructions, fileList),
      env: this.getEnvironmentVariables()
    };
  }

  protected abstract getEnvironmentVariables(): Record<string, string>;
  protected abstract getCoreArgs(instructions: string, fileList?: FileList): string[];
}
