import { describe, expect, it } from 'bun:test';
import { join } from 'path';
import { loadAgentSchemaFromFile, createAgentDefinitionFromSchema, loadAgentRegistryFromDir } from '../loader';
import { expandArgsTemplate, expandTemplate, resolveEnvString } from '../template';
import type { AgentConfig } from '../types';

describe('Agent Config Loader and Template Engine', () => {
    it('resolveEnvString handles nested fallbacks', () => {
        const origKey = process.env.TEST_PRIMARY_KEY;
        const origFallback = process.env.TEST_FALLBACK_KEY;
        try {
            delete process.env.TEST_PRIMARY_KEY;
            delete process.env.TEST_FALLBACK_KEY;
            expect(resolveEnvString('${TEST_PRIMARY_KEY:-${TEST_FALLBACK_KEY:-default_val}}')).toBe('default_val');

            process.env.TEST_FALLBACK_KEY = 'from_fallback';
            expect(resolveEnvString('${TEST_PRIMARY_KEY:-${TEST_FALLBACK_KEY:-default_val}}')).toBe('from_fallback');

            process.env.TEST_PRIMARY_KEY = 'from_primary';
            expect(resolveEnvString('${TEST_PRIMARY_KEY:-${TEST_FALLBACK_KEY:-default_val}}')).toBe('from_primary');
        } finally {
            if (origKey !== undefined) process.env.TEST_PRIMARY_KEY = origKey;
            else delete process.env.TEST_PRIMARY_KEY;
            if (origFallback !== undefined) process.env.TEST_FALLBACK_KEY = origFallback;
            else delete process.env.TEST_FALLBACK_KEY;
        }
    });

    it('loadAgentSchemaFromFile parses YAML correctly', () => {
        const schema = loadAgentSchemaFromFile(join(process.cwd(), 'config/agents/claude.yaml'));
        expect(schema.name).toBe('claude');
        expect(schema.defaultProvider).toBe('anthropic');
        expect(schema.install.bin).toBe('claude');
        expect(Array.isArray(schema.command)).toBe(true);
    });

    it('loadAgentRegistryFromDir loads all agents', () => {
        const registry = loadAgentRegistryFromDir();
        expect(registry.claude).toBeDefined();
        expect(registry.gemini).toBeDefined();
        expect(registry.codex).toBeDefined();
        expect(registry.goose).toBeDefined();
        expect(registry.aider).toBeDefined();
        expect(registry.copilot).toBeDefined();
        expect(registry.opencode).toBeDefined();
        expect(registry.cursor).toBeDefined();
        expect(registry.vibe).toBeDefined();
        expect(registry.kimi).toBeDefined();
        expect(registry.qwen).toBeDefined();
        expect(registry.dns).toBeDefined();
        expect(registry.grok).toBeDefined();
    });

    it('custom agent schema can be converted and executed', () => {
        const customSchema = {
            name: 'custom-bot',
            defaultProvider: 'openai' as const,
            install: {
                method: 'mise' as const,
                tool: 'npm:@custom/bot@1.0.0',
                bin: 'custom-bot'
            },
            env: {
                CUSTOM_BOT_DEBUG: '1'
            },
            providers: {
                openai: {
                    env: {
                        CUSTOM_BOT_API_KEY: '${TEST_CUSTOM_KEY:-default_key}'
                    }
                }
            },
            command: [
                'custom-bot',
                '--task',
                '{instructions}',
                '{#model}--model {model}{/model}',
                '--files',
                '{sourceFiles}'
            ]
        };

        const def = createAgentDefinitionFromSchema(customSchema);
        const config: AgentConfig = {
            model: 'custom-v1',
            provider: 'openai',
            containerName: 'container',
            agentScriptPath: '/path/run-agent.sh'
        };

        const env = def.getEnv(config);
        expect(env.CUSTOM_BOT_DEBUG).toBe('1');
        expect(env.CUSTOM_BOT_API_KEY).toBe('default_key');
        expect(env.AGENT_TOOL).toBe('npm:@custom/bot@1.0.0');

        const args = def.buildArgs(config, 'Fix two-fer problem', { sourceFiles: ['two-fer.ts'], testFiles: ['two-fer.test.ts'] });
        expect(args).toEqual([
            'bash',
            '/path/run-agent.sh',
            'custom-bot',
            '--task',
            'Fix two-fer problem',
            '--model',
            'custom-v1',
            '--files',
            'two-fer.ts'
        ]);
    });
});

describe('Template safety and file list expansion', () => {
    const config: AgentConfig = {
        model: undefined,
        containerName: 'container',
        agentScriptPath: '/path/run-agent.sh'
    };

    it('passes instructions through verbatim (no env expansion, no $-mangling)', () => {
        const instructions = 'Show `${formattedAmount}` and ${HOME:-x} and $& and $$ as-is';
        const args = expandArgsTemplate(['agent', '-p', '{instructions}'], { config, instructions });
        expect(args).toEqual(['bash', '/path/run-agent.sh', 'agent', '-p', instructions]);
    });

    it('repeats the flag for each file in "--flag {list}" form', () => {
        const args = expandArgsTemplate(
            ['aider', '--file {sourceFiles:-*.ts}', '--read {testFiles:-*.test.ts}'],
            { config, instructions: '', fileList: { sourceFiles: ['a.ts', 'b.ts'], testFiles: ['a.test.ts', 'b.test.ts'] } }
        );
        expect(args).toEqual([
            'bash', '/path/run-agent.sh', 'aider',
            '--file', 'a.ts', '--file', 'b.ts',
            '--read', 'a.test.ts', '--read', 'b.test.ts'
        ]);
    });

    it('uses the declared fallback when the file list is empty', () => {
        const args = expandArgsTemplate(
            ['aider', '--file {sourceFiles:-*.ts}'],
            { config, instructions: '' }
        );
        expect(args).toEqual(['bash', '/path/run-agent.sh', 'aider', '--file', '*.ts']);
    });

    it('bare {sourceFiles} expands to nothing when the list is empty', () => {
        const args = expandArgsTemplate(
            ['cursor-agent', '-p', '{instructions}', '{sourceFiles}'],
            { config, instructions: 'task' }
        );
        expect(args).toEqual(['bash', '/path/run-agent.sh', 'cursor-agent', '-p', 'task']);
    });
});

describe('Env policy: blanks, drops, and require', () => {
    const config: AgentConfig = {
        model: undefined,
        containerName: 'container',
        agentScriptPath: '/path/run-agent.sh'
    };

    const baseSchema = {
        name: 'env-bot',
        defaultProvider: 'openai' as const,
        install: { method: 'curl' as const, url: 'https://example.com/install.sh', bin: 'env-bot' },
        command: ['env-bot']
    };

    it('keeps literal blank overrides but drops values that expanded to empty', () => {
        delete process.env.LOADER_TEST_UNSET_VAR;
        const def = createAgentDefinitionFromSchema({
            ...baseSchema,
            env: {
                DELIBERATE_BLANK: '',
                FROM_UNSET: '${LOADER_TEST_UNSET_VAR}',
                FROM_MODEL: '{model}'
            }
        });
        const env = def.getEnv(config);
        expect(env.DELIBERATE_BLANK).toBe('');
        expect('FROM_UNSET' in env).toBe(false);
        expect('FROM_MODEL' in env).toBe(false);
    });

    it('fails fast when a required env var is missing', () => {
        delete process.env.LOADER_TEST_UNSET_A;
        delete process.env.LOADER_TEST_UNSET_B;
        const def = createAgentDefinitionFromSchema({
            ...baseSchema,
            require: [['LOADER_TEST_UNSET_A', 'LOADER_TEST_UNSET_B']]
        });
        expect(() => def.getEnv(config)).toThrow(/Missing one of LOADER_TEST_UNSET_A, LOADER_TEST_UNSET_B/);
    });

    it('pins AGENT_TOOL with the explicit agent version', () => {
        const def = createAgentDefinitionFromSchema({
            ...baseSchema,
            install: { method: 'mise' as const, tool: 'npm:foo', bin: 'foo' }
        });
        const env = def.getEnv({ ...config, agentVersion: '1.2.3' });
        expect(env.AGENT_TOOL).toBe('npm:foo@1.2.3');
    });
});

describe('Kimi --config generation', () => {
    it('registers the moonshot provider and the selected model', () => {
        const registry = loadAgentRegistryFromDir();
        const args = registry.kimi!.buildArgs(
            { model: 'kimi-k2', provider: 'moonshot', containerName: 'c', agentScriptPath: '/path/run-agent.sh' },
            'do the task'
        );
        const configIdx = args.indexOf('--config');
        expect(configIdx).toBeGreaterThan(-1);
        const parsed = JSON.parse(args[configIdx + 1]!);
        expect(parsed.default_model).toBe('kimi-k2');
        expect(parsed.providers.moonshot.type).toBe('kimi');
        expect(parsed.models['kimi-k2'].max_context_size).toBe(262144);
        expect(args).toContain('--model');
        expect(args).toContain('kimi-k2');
    });
});

describe('dns (dsh headless) agent', () => {
    const config: AgentConfig = {
        model: undefined,
        provider: 'deepseek',
        containerName: 'container',
        agentScriptPath: '/path/run-agent.sh'
    };

    it('builds the dsh headless command with the task as the positional argument', () => {
        const registry = loadAgentRegistryFromDir();
        const args = registry.dns!.buildArgs(config, 'Fix the two-fer exercise');
        expect(args).toEqual([
            'bash',
            '/path/run-agent.sh',
            'dsh',
            '--profile',
            'headless',
            'Fix the two-fer exercise'
        ]);
    });

    it('forwards DEEPSEEK_API_KEY and fails fast without it', () => {
        const origKey = process.env.DEEPSEEK_API_KEY;
        try {
            delete process.env.DEEPSEEK_API_KEY;
            const registry = loadAgentRegistryFromDir();
            expect(() => registry.dns!.getEnv(config)).toThrow(/DEEPSEEK_API_KEY/);

            process.env.DEEPSEEK_API_KEY = 'sk-test-key';
            expect(registry.dns!.getEnv(config).DEEPSEEK_API_KEY).toBe('sk-test-key');
        } finally {
            if (origKey !== undefined) process.env.DEEPSEEK_API_KEY = origKey;
            else delete process.env.DEEPSEEK_API_KEY;
        }
    });
});

describe('grok (Grok Build) agent', () => {
    const config: AgentConfig = {
        model: 'grok-build-0.1',
        provider: 'xai',
        containerName: 'container',
        agentScriptPath: '/path/run-agent.sh'
    };

    it('builds the grok headless prompt command', () => {
        const registry = loadAgentRegistryFromDir();
        const args = registry.grok!.buildArgs(config, 'Fix the two-fer exercise');
        expect(args).toEqual([
            'bash',
            '/path/run-agent.sh',
            'grok',
            '-p',
            'Fix the two-fer exercise',
            '-m',
            'grok-build-0.1'
        ]);
    });

    it('omits -m when no model is given', () => {
        const registry = loadAgentRegistryFromDir();
        const args = registry.grok!.buildArgs({ ...config, model: undefined }, 'task');
        expect(args).toEqual(['bash', '/path/run-agent.sh', 'grok', '-p', 'task']);
    });

    it('forwards XAI_API_KEY as GROK_CODE_XAI_API_KEY and fails fast without it', () => {
        const origKey = process.env.XAI_API_KEY;
        try {
            delete process.env.XAI_API_KEY;
            const registry = loadAgentRegistryFromDir();
            expect(() => registry.grok!.getEnv(config)).toThrow(/XAI_API_KEY/);

            process.env.XAI_API_KEY = 'xai-test-key';
            const env = registry.grok!.getEnv(config);
            expect(env.XAI_API_KEY).toBe('xai-test-key');
            expect(env.GROK_CODE_XAI_API_KEY).toBe('xai-test-key');
        } finally {
            if (origKey !== undefined) process.env.XAI_API_KEY = origKey;
            else delete process.env.XAI_API_KEY;
        }
    });
});
