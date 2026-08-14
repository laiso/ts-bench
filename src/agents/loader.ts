import { existsSync, readdirSync, readFileSync } from 'fs';
import { extname, join, resolve } from 'path';
import { parse as parseYaml } from 'yaml';
import type { AgentSchema, EnvRequirement } from './schema';
import type { AgentDefinition, InstallConfig } from './registry';
import type { AgentConfig, FileList } from './types';
import { expandArgsTemplate, expandTemplate } from './template';
import { hasAuthCache } from '../utils/docker';
import { tryAnyEnv } from '../utils/env';

/**
 * Loads and parses an AgentSchema from a YAML or JSON file.
 */
export function loadAgentSchemaFromFile(filePath: string): AgentSchema {
    if (!existsSync(filePath)) {
        throw new Error(`Agent config file not found: ${filePath}`);
    }

    const content = readFileSync(filePath, 'utf-8');
    const ext = extname(filePath).toLowerCase();

    let raw: any;
    if (ext === '.json') {
        raw = JSON.parse(content);
    } else if (ext === '.yaml' || ext === '.yml') {
        raw = parseYaml(content);
    } else {
        // Try YAML first, fallback to JSON
        try {
            raw = parseYaml(content);
        } catch {
            raw = JSON.parse(content);
        }
    }

    if (!raw.name || !raw.command || !Array.isArray(raw.command)) {
        throw new Error(`Invalid agent config in ${filePath}: missing 'name' or 'command' array.`);
    }

    return raw as AgentSchema;
}

/**
 * Converts a declarative AgentSchema into an executable AgentDefinition.
 */
function checkEnvRequirements(
    requirements: EnvRequirement[] | undefined,
    agentName: string,
    provider: string
): void {
    if (!requirements) {
        return;
    }
    for (const req of requirements) {
        const keys = Array.isArray(req) ? req : [req];
        if (!tryAnyEnv(keys)) {
            const what = keys.length === 1 ? keys[0] : `one of ${keys.join(', ')}`;
            throw new Error(`Missing ${what} for agent '${agentName}' (provider: ${provider})`);
        }
    }
}

export function createAgentDefinitionFromSchema(schema: AgentSchema): AgentDefinition {
    return {
        defaultProvider: schema.defaultProvider,
        install: schema.install as InstallConfig,
        getEnv(config: AgentConfig): Record<string, string> {
            const provider = config.provider || schema.defaultProvider;
            const env: Record<string, string> = {};

            // 0. Fail fast on missing host env vars declared via `require`
            checkEnvRequirements(schema.require, schema.name, provider);
            checkEnvRequirements(schema.providers?.[provider]?.require, schema.name, provider);

            // A literal '' in the config is a deliberate blank override and is kept;
            // a value that expanded to '' (unset env var, absent {model}) is omitted.
            const addEnvEntries = (entries?: Record<string, string>) => {
                if (!entries) {
                    return;
                }
                for (const [k, v] of Object.entries(entries)) {
                    const expanded = expandTemplate(v, { config, instructions: '' });
                    if (v === '' || expanded !== '') {
                        env[k] = expanded;
                    }
                }
            };

            // 1. Static global env
            addEnvEntries(schema.env);

            // 2. Provider-specific env
            addEnvEntries(schema.providers?.[provider]?.env);

            // 3. Subscription auth checks & provider fallbacks
            if (schema.name === 'claude') {
                if (provider === 'anthropic') {
                    const found = tryAnyEnv(['ANTHROPIC_API_KEY', 'DASHSCOPE_API_KEY']);
                    if (found) {
                        env.ANTHROPIC_API_KEY = found.value;
                    } else if (config.useDocker && hasAuthCache('claude')) {
                        delete env.ANTHROPIC_API_KEY;
                    } else if (!config.useDocker) {
                        delete env.ANTHROPIC_API_KEY;
                    } else {
                        throw new Error('Missing ANTHROPIC_API_KEY or DASHSCOPE_API_KEY for Claude. Set an API key or run: bun src/index.ts --setup-auth claude');
                    }
                }
                if (provider !== 'anthropic' && config.model) {
                    env.ANTHROPIC_DEFAULT_SONNET_MODEL = config.model;
                    env.ANTHROPIC_DEFAULT_OPUS_MODEL = config.model;
                    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = config.model;
                }
                if (config.useDocker) {
                    env.IS_SANDBOX = '1';
                }
            } else if (schema.name === 'gemini') {
                const found = tryAnyEnv(['GEMINI_API_KEY', 'GOOGLE_API_KEY']);
                if (found) {
                    env.GEMINI_API_KEY = found.value;
                } else if (config.useDocker && hasAuthCache('gemini')) {
                    delete env.GEMINI_API_KEY;
                } else if (!config.useDocker) {
                    delete env.GEMINI_API_KEY;
                } else {
                    throw new Error('Missing GEMINI_API_KEY or GOOGLE_API_KEY for Gemini. Set an API key or run: bun src/index.ts --setup-auth gemini');
                }
            } else if (schema.name === 'codex') {
                if (provider === 'openai') {
                    const found = tryAnyEnv(['CODEX_API_KEY', 'OPENAI_API_KEY']);
                    if (found) {
                        env.CODEX_API_KEY = found.value;
                    } else if (config.useDocker && hasAuthCache('codex')) {
                        delete env.CODEX_API_KEY;
                    } else if (!config.useDocker) {
                        delete env.CODEX_API_KEY;
                    } else {
                        throw new Error('Missing CODEX_API_KEY or OPENAI_API_KEY for Codex (OpenAI) provider. Set an API key or run: bun src/index.ts --setup-auth codex');
                    }
                }
            } else if (schema.name === 'copilot') {
                const token = tryAnyEnv(['COPILOT_GITHUB_TOKEN', 'GITHUB_TOKEN']);
                if (token) {
                    env.COPILOT_GITHUB_TOKEN = token.value;
                } else if (!config.useDocker) {
                    delete env.COPILOT_GITHUB_TOKEN;
                } else {
                    throw new Error('Missing COPILOT_GITHUB_TOKEN for Copilot CLI.');
                }
            }

            // 4. Tell run-agent.sh how to install the binary on demand (mise only)
            if (schema.install?.method === 'mise') {
                const toolVersion = config.agentVersion ?? schema.install.version ?? schema.version;
                env.AGENT_TOOL = toolVersion
                    ? `${schema.install.tool}@${toolVersion}`
                    : schema.install.tool;
            }

            return env;
        },
        buildArgs(config: AgentConfig, instructions: string, fileList?: FileList): string[] {
            let effectiveConfig = config;
            if (schema.name === 'opencode' && config.model && config.provider && !config.model.includes('/')) {
                effectiveConfig = {
                    ...config,
                    model: `${config.provider}/${config.model}`
                };
            }

            const extra: Record<string, string> = {};
            if (schema.name === 'kimi') {
                // Register the moonshot provider (and the selected model) via --config,
                // honoring KIMI_BASE_URL — kimi-cli cannot resolve custom models otherwise.
                const model = config.model;
                const baseUrl = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
                extra.kimiConfig = JSON.stringify({
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
                });
            }

            return expandArgsTemplate(schema.command, { config: effectiveConfig, instructions, fileList, extra });
        }
    };
}

/**
 * Discovers and loads all agent configurations from config/agents/*.{yaml,yml,json}.
 */
export function loadAgentRegistryFromDir(dirPath: string = resolve(import.meta.dir, '../../config/agents')): Record<string, AgentDefinition> {
    const registry: Record<string, AgentDefinition> = {};

    if (!existsSync(dirPath)) {
        return registry;
    }

    const files = readdirSync(dirPath);
    for (const file of files) {
        const ext = extname(file).toLowerCase();
        if (['.yaml', '.yml', '.json'].includes(ext)) {
            const filePath = join(dirPath, file);
            try {
                const schema = loadAgentSchemaFromFile(filePath);
                registry[schema.name] = createAgentDefinitionFromSchema(schema);
            } catch (err) {
                console.warn(`[warning] Failed to load agent config from ${filePath}:`, err);
            }
        }
    }

    return registry;
}
