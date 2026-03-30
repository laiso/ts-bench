import type { AgentBuilder, AgentConfig, FileList } from '../types';
import { BaseAgentBuilder } from '../base';
import { requireEnv } from '../../utils/env';

export class CursorAgentBuilder extends BaseAgentBuilder implements AgentBuilder {
    constructor(agentConfig: AgentConfig) {
        super(agentConfig);
    }

    protected getEnvironmentVariables(): Record<string, string> {
        return {
            CURSOR_API_KEY: requireEnv('CURSOR_API_KEY', 'Missing CURSOR_API_KEY for Cursor Agent')
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
