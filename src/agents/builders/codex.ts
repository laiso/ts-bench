import type { AgentBuilder, AgentConfig } from '../types';
import { BaseAgentBuilder } from '../base';
import { requireAnyEnv, requireEnv } from '../../utils/env';

export class CodexAgentBuilder extends BaseAgentBuilder implements AgentBuilder {
    constructor(agentConfig: AgentConfig) {
        super(agentConfig);
    }

    protected getEnvironmentVariables(): Record<string, string> {
        const provider = this.config.provider ?? 'openai';

        switch (provider) {
            case 'openrouter':
                return {
                    OPENROUTER_API_KEY: requireEnv('OPENROUTER_API_KEY', 'Missing OPENROUTER_API_KEY for Codex (OpenRouter) provider')
                };
            case 'openai': {
                const { value } = requireAnyEnv(
                    ['CODEX_API_KEY', 'OPENAI_API_KEY'],
                    'Missing CODEX_API_KEY or OPENAI_API_KEY for Codex (OpenAI) provider'
                );
                return {
                    CODEX_API_KEY: value
                };
            }
            default:
                throw new Error(`Unsupported provider for Codex: ${provider}`);
        }
    }

    protected getCoreArgs(instructions: string, _fileList?: import('../types').FileList): string[] {
        const provider = this.config.provider || 'openai';

        return [
            'bash',
            this.config.agentScriptPath,
            'codex',
            'exec',
            '-c', 'model_reasoning_effort=high',
            '-c', `model_provider=${provider}`,
            '--yolo',
            '--skip-git-repo-check',
            '-m', this.config.model,
            instructions
        ];
    }
}
