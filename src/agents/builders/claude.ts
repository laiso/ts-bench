import type { AgentBuilder, AgentConfig, FileList } from '../types';
import { BaseAgentBuilder } from '../base';
import { requireEnv, tryAnyEnv } from '../../utils/env';
import { hasAuthCache } from '../../utils/docker';
import { AGENT_DEFAULT_PROVIDER } from '../../config/types';

export class ClaudeAgentBuilder extends BaseAgentBuilder implements AgentBuilder {
    constructor(agentConfig: AgentConfig) {
        super(agentConfig);
    }

    protected getEnvironmentVariables(): Record<string, string> {
        const provider = this.config.provider ?? AGENT_DEFAULT_PROVIDER['claude'];
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
                    console.log(`[auth] Claude: using API key (${found.key})`);
                } else if (this.config.useDocker && hasAuthCache('claude')) {
                    console.log('[auth] Claude: using subscription auth (no API key, auth cache found)');
                } else {
                    throw new Error(
                        'Missing ANTHROPIC_API_KEY or DASHSCOPE_API_KEY for Claude. ' +
                        'Set an API key or run: bun src/index.ts --setup-auth claude'
                    );
                }
            }
        }

        // Override model short names to prevent fallback to Anthropic API
        if (provider !== 'anthropic') {
            const model = this.config.model;
            env.ANTHROPIC_DEFAULT_SONNET_MODEL = model;
            env.ANTHROPIC_DEFAULT_OPUS_MODEL = model;
            env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model;
        }

        // Allow --dangerously-skip-permissions when running as root inside Docker.
        // Claude Code refuses this flag as root for safety, but IS_SANDBOX=1
        // signals that we are inside an isolated container environment.
        if (this.config.useDocker) {
            env.IS_SANDBOX = '1';
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
