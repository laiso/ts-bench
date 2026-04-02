import type { AgentBuilder, AgentConfig, FileList } from '../types';
import { BaseAgentBuilder } from '../base';
import { requireEnv, tryAnyEnv } from '../../utils/env';
import { hasAuthCache } from '../../utils/docker';

export class ClaudeAgentBuilder extends BaseAgentBuilder implements AgentBuilder {
    constructor(agentConfig: AgentConfig) {
        super(agentConfig);
    }

    protected getEnvironmentVariables(): Record<string, string> {
        const provider = this.config.provider ?? 'anthropic';
        const env: Record<string, string> = {};

        switch (provider) {
            case 'dashscope': {
                const value = requireEnv('DASHSCOPE_API_KEY', 'Missing DASHSCOPE_API_KEY for Claude (DashScope) provider');
                env.ANTHROPIC_API_KEY = value;
                env.ANTHROPIC_AUTH_TOKEN = value;
                env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://dashscope-intl.aliyuncs.com/api/v2/apps/claude-code-proxy';
                break;
            }
            case 'deepseek': {
                const value = requireEnv('DEEPSEEK_API_KEY', 'Missing DEEPSEEK_API_KEY for Claude (DeepSeek) provider');
                env.ANTHROPIC_API_KEY = value;
                env.ANTHROPIC_AUTH_TOKEN = value;
                env.ANTHROPIC_BASE_URL = 'https://api.deepseek.com/anthropic';
                break;
            }
            case 'moonshot': {
                const value = requireEnv('MOONSHOT_API_KEY', 'Missing MOONSHOT_API_KEY for Claude (Moonshot) provider');
                env.ANTHROPIC_API_KEY = value;
                env.ANTHROPIC_AUTH_TOKEN = value;
                env.ANTHROPIC_BASE_URL = 'https://api.moonshot.ai/anthropic';
                break;
            }
            case 'zai': {
                const value = requireEnv('ZAI_API_KEY', 'Missing ZAI_API_KEY for Claude (ZAI) provider');
                env.ANTHROPIC_API_KEY = value;
                env.ANTHROPIC_AUTH_TOKEN = value;
                env.ANTHROPIC_BASE_URL = 'https://api.z.ai/api/anthropic';
                break;
            }
            case 'openrouter': {
                const value = requireEnv('OPENROUTER_API_KEY', 'Missing OPENROUTER_API_KEY for Claude (OpenRouter) provider');
                env.ANTHROPIC_API_KEY = '';
                env.ANTHROPIC_AUTH_TOKEN = value;
                env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://openrouter.ai/api';
                break;
            }
            default: {
                const found = tryAnyEnv(['ANTHROPIC_API_KEY', 'DASHSCOPE_API_KEY']);
                if (found) {
                    env.ANTHROPIC_API_KEY = found.value;
                } else if (!(this.config.useDocker && hasAuthCache('claude'))) {
                    throw new Error(
                        'Missing ANTHROPIC_API_KEY or DASHSCOPE_API_KEY for Claude. ' +
                        'Set an API key or run: bun src/index.ts --setup-auth claude'
                    );
                }
                // When hasAuthCache('claude') is true and no API key is set,
                // env is returned without ANTHROPIC_API_KEY — the agent will
                // use subscription auth from the mounted auth volume.
            }
        }

        // Override model short names to prevent fallback to Anthropic API
        if (provider !== 'anthropic') {
            const model = this.config.model;
            env.ANTHROPIC_DEFAULT_SONNET_MODEL = model;
            env.ANTHROPIC_DEFAULT_OPUS_MODEL = model;
            env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model;
        }

        return env;
    }

    protected getCoreArgs(instructions: string, _fileList?: FileList): string[] {
        return [
            'bash',
            this.config.agentScriptPath,
            'claude',
            '--debug',
            '--verbose',
            '--dangerously-skip-permissions',
            '--model', this.config.model,
            '-p', instructions
        ];
    }
}
