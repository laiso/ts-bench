import type { ProviderType } from '../config/base-types';
import type { AgentConfig, FileList } from './types';
import { requireEnv, requireAnyEnv, tryAnyEnv } from '../utils/env';
import { hasAuthCache } from '../utils/docker';

export type InstallConfig =
    | { method: 'npm'; bin: string; package: string }
    | { method: 'curl'; bin: string; url: string; cmdPrefix?: string }
    | { method: 'pip'; bin: string; package: string }
    | { method: 'uv_tool'; bin: string; package: string; python?: string };

export interface AgentDefinition {
    /** Default provider for this agent */
    defaultProvider: ProviderType;
    /** CLI installation configuration (used by run-agent.sh and agents.json) */
    install: InstallConfig;
    /** Resolve environment variables required by this agent */
    getEnv(config: AgentConfig): Record<string, string>;
    /** Build CLI args array (starting with 'bash', agentScriptPath, ...) */
    buildArgs(config: AgentConfig, instructions: string, fileList?: FileList): string[];
}

export const AGENT_REGISTRY = {
    claude: {
        defaultProvider: 'anthropic' as ProviderType,
        install: { method: 'npm', bin: 'claude', package: '@anthropic-ai/claude-code' },
        getEnv(config: AgentConfig): Record<string, string> {
            const provider = config.provider ?? 'anthropic';
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
                    } else if (config.useDocker && hasAuthCache('claude')) {
                        console.log('[auth] Claude: using subscription auth (no API key, auth cache found)');
                    } else if (!config.useDocker) {
                        console.log('[auth] Claude: no API key set, relying on local claude auth');
                    } else {
                        throw new Error(
                            'Missing ANTHROPIC_API_KEY or DASHSCOPE_API_KEY for Claude. ' +
                            'Set an API key or run: bun src/index.ts --setup-auth claude'
                        );
                    }
                }
            }

            if (provider !== 'anthropic' && config.model) {
                const model = config.model;
                env.ANTHROPIC_DEFAULT_SONNET_MODEL = model;
                env.ANTHROPIC_DEFAULT_OPUS_MODEL = model;
                env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model;
            }

            if (config.useDocker) {
                env.IS_SANDBOX = '1';
            }

            return env;
        },
        buildArgs(config: AgentConfig, instructions: string): string[] {
            return [
                'bash',
                config.agentScriptPath,
                'claude',
                '--debug',
                '--verbose',
                '--dangerously-skip-permissions',
                ...(config.model ? ['--model', config.model] : []),
                '-p', instructions
            ];
        }
    },

    goose: {
        defaultProvider: 'anthropic' as ProviderType,
        install: { method: 'curl', bin: 'goose', url: 'https://github.com/block/goose/releases/download/stable/download_cli.sh', cmdPrefix: 'CONFIGURE=false' },
        getEnv(config: AgentConfig): Record<string, string> {
            const provider = config.provider ?? 'anthropic';
            const env: Record<string, string> = {
                ...(config.model ? { GOOSE_MODEL: config.model } : {}),
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
        },
        buildArgs(config: AgentConfig, instructions: string): string[] {
            return [
                'bash',
                config.agentScriptPath,
                'goose', 'run',
                '--with-builtin', 'developer',
                '--text', instructions
            ];
        }
    },

    aider: {
        defaultProvider: 'openai' as ProviderType,
        install: { method: 'curl', bin: 'aider', url: 'https://aider.chat/install.sh' },
        getEnv(_config: AgentConfig): Record<string, string> {
            const { key, value } = requireAnyEnv(
                ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY'],
                'Aider requires at least one major API key'
            );

            const env: Record<string, string> = {
                AIDER_GIT: 'false',
                AIDER_AUTO_COMMITS: 'false',
                AIDER_SHOW_RELEASE_NOTES: 'false',
                AIDER_SKIP_SANITY_CHECK_REPO: 'true',
                AIDER_CHAT_HISTORY_FILE: '/dev/null',
                AIDER_INPUT_HISTORY_FILE: '/dev/null'
            };

            env[key] = value;

            if (key === 'GOOGLE_API_KEY') {
                env.GEMINI_API_KEY = value;
            }

            if (key === 'GEMINI_API_KEY') {
                env.GOOGLE_API_KEY = value;
            }

            return env;
        },
        buildArgs(config: AgentConfig, instructions: string, fileList?: FileList): string[] {
            const sourceFiles = fileList?.sourceFiles || [];
            const testFiles = fileList?.testFiles || [];

            const args: string[] = [
                'bash',
                config.agentScriptPath,
                'aider',
                '--yes-always',
                '--no-auto-commits',
                '--no-check-update',
                ...(config.model ? ['--model', config.model] : [])
            ];

            if (sourceFiles.length > 0) {
                sourceFiles.forEach(file => { args.push('--file', file); });
            } else {
                args.push('--file', '*.ts');
            }

            if (testFiles.length > 0) {
                testFiles.forEach(file => { args.push('--read', file); });
            } else {
                args.push('--read', '*.test.ts');
            }

            args.push('--message', instructions);
            return args;
        }
    },

    codex: {
        defaultProvider: 'openai' as ProviderType,
        install: { method: 'npm', bin: 'codex', package: '@openai/codex' },
        getEnv(config: AgentConfig): Record<string, string> {
            const provider = config.provider ?? 'openai';

            switch (provider) {
                case 'openrouter':
                    return {
                        OPENROUTER_API_KEY: requireEnv('OPENROUTER_API_KEY', 'Missing OPENROUTER_API_KEY for Codex (OpenRouter) provider')
                    };
                case 'openai': {
                    const found = tryAnyEnv(['CODEX_API_KEY', 'OPENAI_API_KEY']);
                    if (found) {
                        console.log(`[auth] Codex: using API key (${found.key})`);
                        return { CODEX_API_KEY: found.value };
                    }
                    if (config.useDocker && hasAuthCache('codex')) {
                        console.log('[auth] Codex: using subscription auth (no API key, auth cache found)');
                        return {};
                    }
                    if (!config.useDocker) {
                        console.log('[auth] Codex: no API key set, relying on local codex auth');
                        return {};
                    }
                    throw new Error(
                        'Missing CODEX_API_KEY or OPENAI_API_KEY for Codex (OpenAI) provider. ' +
                        'Set an API key or run: bun src/index.ts --setup-auth codex'
                    );
                }
                default:
                    throw new Error(`Unsupported provider for Codex: ${provider}`);
            }
        },
        buildArgs(config: AgentConfig, instructions: string): string[] {
            const provider = config.provider || 'openai';

            return [
                'bash',
                config.agentScriptPath,
                'codex',
                'exec',
                '-c', 'model_reasoning_effort=high',
                '-c', `model_provider=${provider}`,
                '--yolo',
                '--skip-git-repo-check',
                ...(config.model ? ['-m', config.model] : []),
                instructions
            ];
        }
    },

    copilot: {
        defaultProvider: 'openai' as ProviderType,
        install: { method: 'npm', bin: 'copilot', package: '@github/copilot' },
        getEnv(config: AgentConfig): Record<string, string> {
            const env: Record<string, string> = {
                COPILOT_ALLOW_ALL: '1'
            };

            if (config.model) {
                env.COPILOT_MODEL = config.model;
            }

            const token = tryAnyEnv(['COPILOT_GITHUB_TOKEN', 'GITHUB_TOKEN']);
            if (token) {
                env.COPILOT_GITHUB_TOKEN = token.value;
                console.log(`[auth] Copilot: using token (${token.key})`);
            } else if (!config.useDocker) {
                console.log('[auth] Copilot: no token set, relying on local copilot auth');
            } else {
                throw new Error(
                    'Missing COPILOT_GITHUB_TOKEN for Copilot CLI. ' +
                    'Create a fine-grained PAT with the "Copilot Requests" permission and set it as COPILOT_GITHUB_TOKEN.'
                );
            }

            return env;
        },
        buildArgs(config: AgentConfig, instructions: string): string[] {
            return [
                'bash',
                config.agentScriptPath,
                'copilot',
                '--allow-all-tools',
                '--no-color',
                '--add-dir',
                '.',
                '-p',
                instructions
            ];
        }
    },

    gemini: {
        defaultProvider: 'google' as ProviderType,
        install: { method: 'npm', bin: 'gemini', package: '@google/gemini-cli' },
        getEnv(config: AgentConfig): Record<string, string> {
            const found = tryAnyEnv(['GEMINI_API_KEY', 'GOOGLE_API_KEY']);

            if (found) {
                const env: Record<string, string> = { GEMINI_API_KEY: found.value };
                if (found.key !== 'GEMINI_API_KEY') {
                    env[found.key] = found.value;
                }
                console.log(`[auth] Gemini: using API key (${found.key})`);
                return env;
            }

            if (config.useDocker && hasAuthCache('gemini')) {
                console.log('[auth] Gemini: using subscription auth (no API key, auth cache found)');
                return {};
            }

            if (!config.useDocker) {
                console.log('[auth] Gemini: no API key set, relying on local gemini auth');
                return {};
            }

            throw new Error(
                'Missing GEMINI_API_KEY or GOOGLE_API_KEY for Gemini. ' +
                'Set an API key or run: bun src/index.ts --setup-auth gemini'
            );
        },
        buildArgs(config: AgentConfig, instructions: string): string[] {
            return [
                'bash',
                config.agentScriptPath,
                'gemini',
                ...(config.model ? ['--model', config.model] : []),
                '-y',
                '-p', instructions
            ];
        }
    },

    opencode: {
        defaultProvider: 'openai' as ProviderType,
        install: { method: 'npm', bin: 'opencode', package: 'opencode-ai' },
        getEnv(config: AgentConfig): Record<string, string> {
            const provider = config.provider ?? 'openai';

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
                case 'moonshot':
                    return {
                        MOONSHOT_API_KEY: requireEnv('MOONSHOT_API_KEY', 'Missing MOONSHOT_API_KEY for OpenCode (Moonshot) provider')
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
        },
        buildArgs(config: AgentConfig, instructions: string): string[] {
            const model = config.model
                ? (config.provider && !config.model.includes('/')
                    ? `${config.provider}/${config.model}`
                    : config.model)
                : undefined;

            return [
                'bash',
                config.agentScriptPath,
                'opencode',
                'run',
                ...(model ? ['-m', model] : []),
                instructions
            ];
        }
    },

    qwen: {
        defaultProvider: 'dashscope' as ProviderType,
        install: { method: 'npm', bin: 'qwen', package: '@qwen-code/qwen-code' },
        getEnv(config: AgentConfig): Record<string, string> {
            const provider = config.provider ?? 'dashscope';

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
                            ...(config.model ? { OPENAI_MODEL: config.model } : {})
                        };
                    }
                    case 'openai': {
                        const value = requireEnv('OPENAI_API_KEY', 'Missing OPENAI_API_KEY for Qwen (OpenAI) provider');
                        return {
                            OPENAI_BASE_URL: 'https://api.openai.com/v1',
                            OPENAI_API_KEY: value,
                            ...(config.model ? { OPENAI_MODEL: config.model } : {})
                        };
                    }
                    default: {
                        const value = requireEnv('DASHSCOPE_API_KEY', 'Missing DASHSCOPE_API_KEY for Qwen (DashScope) provider');
                        return {
                            OPENAI_BASE_URL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
                            OPENAI_API_KEY: value,
                            ...(config.model ? { OPENAI_MODEL: config.model } : {})
                        };
                    }
                }
            })();

            return {
                ...env,
                GEMINI_API_KEY: '',
                GOOGLE_API_KEY: '',
                GOOGLE_GENAI_USE_GCA: '',
                GOOGLE_GENAI_USE_VERTEXAI: ''
            };
        },
        buildArgs(config: AgentConfig, instructions: string): string[] {
            return [
                'bash',
                config.agentScriptPath,
                'qwen',
                '-y',
                ...(config.model ? ['-m', config.model] : []),
                '-p', instructions
            ];
        }
    },

    cursor: {
        defaultProvider: 'openai' as ProviderType,
        install: { method: 'curl', bin: 'cursor-agent', url: 'https://cursor.com/install' },
        getEnv(_config: AgentConfig): Record<string, string> {
            return {
                CURSOR_API_KEY: requireEnv('CURSOR_API_KEY', 'Missing CURSOR_API_KEY for Cursor Agent')
            };
        },
        buildArgs(config: AgentConfig, instructions: string, fileList?: FileList): string[] {
            const sourceFiles = fileList?.sourceFiles || [];

            const args = [
                'bash',
                config.agentScriptPath,
                'cursor-agent',
                '--yolo',
                ...(config.model ? ['--model', config.model] : []),
                '-p',
                instructions
            ];

            if (sourceFiles.length > 0) {
                args.push(...sourceFiles);
            }

            return args;
        }
    },

    vibe: {
        defaultProvider: 'mistral' as ProviderType,
        install: { method: 'pip', bin: 'vibe', package: 'mistral-vibe' },
        getEnv(_config: AgentConfig): Record<string, string> {
            return {
                MISTRAL_API_KEY: requireEnv('MISTRAL_API_KEY',
                    'MISTRAL_API_KEY is required for Mistral Vibe agent')
            };
        },
        buildArgs(config: AgentConfig, instructions: string): string[] {
            return [
                'bash',
                config.agentScriptPath,
                'vibe',
                '--prompt',
                instructions,
                '--auto-approve'
            ];
        }
    },

    kimi: {
        defaultProvider: 'moonshot' as ProviderType,
        install: { method: 'uv_tool', bin: 'kimi', package: 'kimi-cli', python: '3.13' },
        getEnv(config: AgentConfig): Record<string, string> {
            const provider = config.provider ?? 'moonshot';
            if (provider !== 'moonshot') {
                throw new Error(`Unsupported provider for Kimi: ${provider}`);
            }

            return {
                KIMI_API_KEY: requireEnv('KIMI_API_KEY', 'Missing KIMI_API_KEY for Kimi (Moonshot) provider')
            };
        },
        buildArgs(config: AgentConfig, instructions: string): string[] {
            const model = config.model;
            const baseUrl = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
            const kimiConfig = {
                ...(model ? { default_model: model } : {}),
                providers: {
                    moonshot: {
                        type: 'kimi',
                        base_url: baseUrl,
                        api_key: 'env'
                    }
                },
                ...(model ? {
                    models: {
                        [model]: {
                            provider: 'moonshot',
                            model,
                            max_context_size: 262144
                        }
                    }
                } : {})
            };

            return [
                'bash',
                config.agentScriptPath,
                'kimi',
                '--print',
                '--output-format',
                'text',
                '--config',
                JSON.stringify(kimiConfig),
                ...(model ? ['--model', model] : []),
                '-p',
                instructions
            ];
        }
    }
} satisfies Record<string, AgentDefinition>;

export type AgentType = keyof typeof AGENT_REGISTRY;

export const AGENT_DEFAULT_PROVIDER = Object.fromEntries(
    Object.entries(AGENT_REGISTRY).map(([k, v]) => [k, v.defaultProvider])
) as Record<AgentType, ProviderType>;
