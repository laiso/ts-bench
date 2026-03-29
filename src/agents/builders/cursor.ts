import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Command } from '../../execution/types';
import type { AgentBuilder, AgentConfig, FileList } from '../types';
import { BaseAgentBuilder } from '../base';
import { requireEnv } from '../../utils/env';

const PROMPT_MOUNT_CONTAINER = '/tmp/ts-bench-cursor-prompt.txt';

export class CursorAgentBuilder extends BaseAgentBuilder implements AgentBuilder {
    constructor(agentConfig: AgentConfig) {
        super(agentConfig);
    }

    protected getEnvironmentVariables(): Record<string, string> {
        return {
            CURSOR_API_KEY: requireEnv('CURSOR_API_KEY', 'Missing CURSOR_API_KEY for Cursor Agent')
        };
    }

    override async buildCommand(instructions: string, fileList?: FileList): Promise<Command> {
        const useDockerV2 =
            this.config.dataset === 'v2' &&
            this.config.useDocker !== false &&
            this.config.exercise;

        if (useDockerV2) {
            const dir = join(process.cwd(), '.cursor-agent-prompts');
            await mkdir(dir, { recursive: true });
            const hostPath = join(dir, `${this.config.exercise}.txt`);
            await writeFile(hostPath, instructions, 'utf8');

            const args = this.getCoreArgs('$(cat ' + PROMPT_MOUNT_CONTAINER + ')', fileList);
            return {
                args,
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

    protected getCoreArgs(instructions: string, fileList?: FileList): string[] {
        const sourceFiles = fileList?.sourceFiles || [];

        const args = [
            'bash',
            this.config.agentScriptPath,
            'cursor-agent',
            // Non-interactive / CI: trust workspace without prompting (see cursor-agent --help)
            '--yolo',
            '--model',
            this.config.model,
            '-p',
            instructions
        ];

        if (sourceFiles.length > 0) {
            args.push(...sourceFiles);
        }

        return args;
    }
}
