import type { AgentBuilder, AgentConfig } from '../types';
import { BaseAgentBuilder } from '../base';
import { requireAnyEnv, requireEnv } from '../../utils/env';

export class QwenAgentBuilder extends BaseAgentBuilder implements AgentBuilder {
    constructor(agentConfig: AgentConfig) {
        super(agentConfig);
    }

    protected getEnvironmentVariables(): Record<string, string> {
        const provider = this.config.provider ?? 'dashscope';

        const env = (() => {
            switch (provider) {
                case 'openrouter': {
                    const { value } = requireAnyEnv(
                        ['OPENROUTER_API_KEY'],
                        'Missing API key for Qwen (OpenRouter) provider'
                    );
                    return {
                        OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
                        OPENAI_API_KEY: value,
                        OPENAI_MODEL: this.config.model
                    };
                }
                case 'openai': {
                    const value = requireEnv('OPENAI_API_KEY', 'Missing OPENAI_API_KEY for Qwen (OpenAI) provider');
                    return {
                        OPENAI_BASE_URL: 'https://api.openai.com/v1',
                        OPENAI_API_KEY: value,
                        OPENAI_MODEL: this.config.model
                    };
                }
                default: {
                    const value = requireEnv('DASHSCOPE_API_KEY', 'Missing DASHSCOPE_API_KEY for Qwen (DashScope) provider');
                    return {
                        OPENAI_BASE_URL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
                        OPENAI_API_KEY: value,
                        OPENAI_MODEL: this.config.model
                    };
                }
            }
        })();

        return this.disableGoogleAuthFallback(env);
    }

    protected getCoreArgs(instructions: string): string[] {
        return [
            'bash',
            this.config.agentScriptPath,
            'qwen',
            '-y',
            '-m', this.config.model,
            '-p', instructions
        ];
    }

    // Ensure Gemini/Google related env vars do not trigger unintended auth flows in the CLI.
    private disableGoogleAuthFallback(env: Record<string, string>): Record<string, string> {
        return {
            ...env,
            GEMINI_API_KEY: '',
            GOOGLE_API_KEY: '',
            GOOGLE_GENAI_USE_GCA: '',
            GOOGLE_GENAI_USE_VERTEXAI: ''
        };
    }
}
