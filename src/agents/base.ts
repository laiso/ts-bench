import type { Command } from '../execution/types';
import type { FileList, AgentConfig } from './types';
import {
  PROMPT_MOUNT_CONTAINER,
  PROMPT_PLACEHOLDER,
  writeAgentPromptFile
} from './prompt-files';

export abstract class BaseAgentBuilder {
  constructor(protected config: AgentConfig) {}

  async buildCommand(instructions: string, fileList?: FileList): Promise<Command> {
    const useDockerV2 =
      this.config.dataset === 'v2' &&
      this.config.useDocker !== false &&
      this.config.exercise;

    if (useDockerV2) {
      const hostPath = await writeAgentPromptFile(this.config.exercise!, instructions);
      return {
        args: this.getCoreArgs(PROMPT_PLACEHOLDER, fileList),
        env: this.getEnvironmentVariables(),
        promptFileHostPath: hostPath,
        promptFileContainerPath: PROMPT_MOUNT_CONTAINER
      };
    }

    return {
      args: this.getCoreArgs(instructions, fileList),
      env: this.getEnvironmentVariables()
    };
  }

  protected abstract getEnvironmentVariables(): Record<string, string>;
  /**
   * When instructions === PROMPT_PLACEHOLDER, real text lives in the mounted prompt file (v2 Docker).
   */
  protected abstract getCoreArgs(instructions: string, fileList?: FileList): string[];
}
