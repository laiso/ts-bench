import type { AgentBuilder, AgentConfig } from '../types';
import { BaseAgentBuilder } from '../base';
import { requireAnyEnv, requireEnv } from '../../utils/env';

export class GooseAgentBuilder extends BaseAgentBuilder implements AgentBuilder {
    constructor(agentConfig: AgentConfig) {
        super(agentConfig);
    }

    protected getEnvironmentVariables(): Record<string, string> {
        const provider = this.config.provider ?? 'anthropic';
        const env: Record<string, string> = {
            GOOSE_MODEL: this.config.model,
            GOOSE_PROVIDER: provider,
            GOOSE_DISABLE_KEYRING: '1'
        };

        switch (provider) {
            case 'anthropic': {
                const { value } = requireAnyEnv(
                    ['ANTHROPIC_API_KEY', 'DASHSCOPE_API_KEY'],
                    'Missing API key for Goose (Anthropic) provider'
                );
                env.ANTHROPIC_API_KEY = value;
                break;
            }
            case 'openai':
                env.OPENAI_API_KEY = requireEnv('OPENAI_API_KEY', 'Missing OPENAI_API_KEY for Goose (OpenAI) provider');
                break;
            case 'google': {
                const { key, value } = requireAnyEnv(
                    ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
                    'Missing API key for Goose (Google) provider'
                );
                env[key] = value;
                break;
            }
            case 'dashscope':
                env.DASHSCOPE_API_KEY = requireEnv('DASHSCOPE_API_KEY', 'Missing DASHSCOPE_API_KEY for Goose (DashScope) provider');
                break;
            case 'deepseek':
                env.DEEPSEEK_API_KEY = requireEnv('DEEPSEEK_API_KEY', 'Missing DEEPSEEK_API_KEY for Goose (DeepSeek) provider');
                break;
            case 'xai':
                env.XAI_API_KEY = requireEnv('XAI_API_KEY', 'Missing XAI_API_KEY for Goose (xAI) provider');
                break;
            case 'openrouter':
                env.OPENROUTER_API_KEY = requireEnv('OPENROUTER_API_KEY', 'Missing OPENROUTER_API_KEY for Goose (OpenRouter) provider');
                break;
            default:
                throw new Error(`Unsupported provider for Goose: ${provider}`);
        }

        return env;
    }

    protected getCoreArgs(instructions: string): string[] {
        return [
            'bash',
            this.config.agentScriptPath,
            'goose', 'run',
            '--with-builtin', 'developer',
            '--text', instructions
        ];
    }
}
