import type { AgentBuilder, AgentConfig } from '../types';
import { BaseAgentBuilder } from '../base';
import { requireEnv } from '../../utils/env';

export class VibeAgentBuilder extends BaseAgentBuilder implements AgentBuilder {
    constructor(agentConfig: AgentConfig) {
        super(agentConfig);
    }

    protected getEnvironmentVariables(): Record<string, string> {
        return {
            MISTRAL_API_KEY: requireEnv('MISTRAL_API_KEY',
                'MISTRAL_API_KEY is required for Mistral Vibe agent')
        };
    }

    protected getCoreArgs(instructions: string): string[] {
        return [
            'bash',
            this.config.agentScriptPath,
            'vibe',
            '--prompt',
            instructions,
            '--auto-approve'
        ];
    }
}