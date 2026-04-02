import type { AgentBuilder, AgentConfig } from '../types';
import { BaseAgentBuilder } from '../base';
import { requireEnv, tryAnyEnv } from '../../utils/env';
import { hasAuthCache } from '../../utils/docker';

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
                const found = tryAnyEnv(['CODEX_API_KEY', 'OPENAI_API_KEY']);
                if (found) {
                    return { CODEX_API_KEY: found.value };
                }
                if (!hasAuthCache('codex')) {
                    throw new Error(
                        'Missing CODEX_API_KEY or OPENAI_API_KEY for Codex (OpenAI) provider. ' +
                        'Set an API key or run: bun src/index.ts --setup-auth codex'
                    );
                }
                // Subscription auth — no API key needed.
                return {};
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
