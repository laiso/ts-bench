import type { AgentBuilder, AgentConfig } from '../types';
import { BaseAgentBuilder } from '../base';

export class CopilotAgentBuilder extends BaseAgentBuilder implements AgentBuilder {
    constructor(agentConfig: AgentConfig) {
        super(agentConfig);
    }

    protected getEnvironmentVariables(): Record<string, string> {
        const env: Record<string, string> = {
            COPILOT_ALLOW_ALL: '1'
        };

        if (this.config.model) {
            env.COPILOT_MODEL = this.config.model;
        }

        return env;
    }

    protected getCoreArgs(instructions: string): string[] {
        return [
            'bash',
            this.config.agentScriptPath,
            'copilot',
            '--allow-all-tools',
            '--no-color',
            '--add-dir',
            '.',
            '-p',
            instructions
        ];
    }
}
