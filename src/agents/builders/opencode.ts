import type { ProviderType } from '../../config/types';
import type { AgentBuilder, AgentConfig } from '../types';
import { BaseAgentBuilder } from '../base';
import { requireAnyEnv, requireEnv } from '../../utils/env';

export class OpenCodeAgentBuilder extends BaseAgentBuilder implements AgentBuilder {
    constructor(agentConfig: AgentConfig) {
        super(agentConfig);
    }

    protected getEnvironmentVariables(): Record<string, string> {
        const provider = (this.config.provider ?? 'openai') as ProviderType;

        switch (provider) {
            case 'openai':
                return {
                    OPENAI_API_KEY: requireEnv('OPENAI_API_KEY', 'Missing OPENAI_API_KEY for OpenCode (OpenAI) provider')
                };
            case 'anthropic':
                return {
                    ANTHROPIC_API_KEY: requireEnv('ANTHROPIC_API_KEY', 'Missing ANTHROPIC_API_KEY for OpenCode (Anthropic) provider')
                };
            case 'google': {
                const { key, value } = requireAnyEnv(
                    ['GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY'],
                    'Missing API key for OpenCode (Google) provider'
                );
                const env: Record<string, string> = {
                    GOOGLE_GENERATIVE_AI_API_KEY: value
                };
                env[key] = value;
                return env;
            }
            case 'openrouter':
                return {
                    OPENROUTER_API_KEY: requireEnv('OPENROUTER_API_KEY', 'Missing OPENROUTER_API_KEY for OpenCode (OpenRouter) provider')
                };
            case 'dashscope':
                return {
                    DASHSCOPE_API_KEY: requireEnv('DASHSCOPE_API_KEY', 'Missing DASHSCOPE_API_KEY for OpenCode (DashScope) provider')
                };
            case 'xai':
                return {
                    XAI_API_KEY: requireEnv('XAI_API_KEY', 'Missing XAI_API_KEY for OpenCode (xAI) provider')
                };
            case 'deepseek':
                return {
                    DEEPSEEK_API_KEY: requireEnv('DEEPSEEK_API_KEY', 'Missing DEEPSEEK_API_KEY for OpenCode (DeepSeek) provider')
                };
            case 'cerebras':
                return {
                    CEREBRAS_API_KEY: requireEnv('CEREBRAS_API_KEY', 'Missing CEREBRAS_API_KEY for OpenCode (Cerebras) provider')
                };
            default:
                throw new Error(`Unsupported provider for OpenCode: ${provider}`);
        }
    }

    protected getCoreArgs(instructions: string): string[] {
        const model = this.config.provider && !this.config.model.includes('/')
            ? `${this.config.provider}/${this.config.model}`
            : this.config.model;

        return [
            'bash',
            this.config.agentScriptPath,
            'opencode',
            'run',
            '-m',
            model,
            instructions
        ];
    }
}
