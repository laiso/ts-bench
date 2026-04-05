import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { AUTH_SENTINEL } from '../../../utils/docker';
import { PROMPT_MOUNT_CONTAINER, PROMPT_PLACEHOLDER } from '../../prompt-files';
import { AGENT_DEFAULT_PROVIDER, AGENT_REGISTRY } from '../../registry';
import type { AgentType } from '../../registry';
import { GenericAgentBuilder } from '../generic';

const SCRIPT_PATH = '/tmp/scripts/run-agent.sh';
const BASE_CONFIG = {
    containerName: 'test-container',
    agentScriptPath: SCRIPT_PATH,
    model: 'test-model'
};

function seedAuthCache(agent: string): void {
    const dir = join(homedir(), '.cache', 'ts-bench', 'auth', agent);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, AUTH_SENTINEL), new Date().toISOString());
}

function clearAuthCache(agent: string): void {
    const dir = join(homedir(), '.cache', 'ts-bench', 'auth', agent);
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
}

function clearEnvKeys(keys: string[]): Record<string, string | undefined> {
    const originals: Record<string, string | undefined> = {};
    for (const key of keys) {
        originals[key] = process.env[key];
        delete process.env[key];
    }
    return originals;
}

function restoreEnvKeys(originals: Record<string, string | undefined>): void {
    for (const [key, value] of Object.entries(originals)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
}

describe('AGENT_REGISTRY', () => {
    it('has entries for all known agents', () => {
        const agents: AgentType[] = ['claude', 'goose', 'aider', 'codex', 'copilot', 'gemini', 'opencode', 'qwen', 'cursor', 'vibe', 'kimi'];
        for (const agent of agents) {
            expect(AGENT_REGISTRY[agent]).toBeDefined();
        }
    });

    it('each definition has required fields', () => {
        for (const [name, def] of Object.entries(AGENT_REGISTRY)) {
            expect(def.defaultProvider, `${name}.defaultProvider`).toBeTruthy();
            expect(def.install, `${name}.install`).toBeDefined();
            expect(typeof def.getEnv, `${name}.getEnv`).toBe('function');
            expect(typeof def.buildArgs, `${name}.buildArgs`).toBe('function');
        }
    });

    it('AGENT_DEFAULT_PROVIDER matches registry defaultProvider', () => {
        for (const [name, def] of Object.entries(AGENT_REGISTRY)) {
            const agent = name as AgentType;
            expect(AGENT_DEFAULT_PROVIDER[agent]).toBe(def.defaultProvider);
        }
    });
});

describe('GenericAgentBuilder via registry', () => {
    it('gemini: buildArgs starts with bash + script + gemini', async () => {
        const origKey = process.env.GEMINI_API_KEY;
        process.env.GEMINI_API_KEY = 'test-gemini-key';
        try {
            const builder = new GenericAgentBuilder(BASE_CONFIG, AGENT_REGISTRY.gemini);
            const command = await builder.buildCommand('instructions');
            expect(command.args[0]).toBe('bash');
            expect(command.args[1]).toBe(SCRIPT_PATH);
            expect(command.args[2]).toBe('gemini');
            expect(command.env?.GEMINI_API_KEY).toBe('test-gemini-key');
        } finally {
            if (origKey === undefined) delete process.env.GEMINI_API_KEY;
            else process.env.GEMINI_API_KEY = origKey;
        }
    });

    it('copilot: sets COPILOT_ALLOW_ALL and COPILOT_MODEL', async () => {
        const builder = new GenericAgentBuilder(BASE_CONFIG, AGENT_REGISTRY.copilot);
        const command = await builder.buildCommand('instructions');
        expect(command.args[2]).toBe('copilot');
        expect(command.env?.COPILOT_ALLOW_ALL).toBe('1');
        expect(command.env?.COPILOT_MODEL).toBe('test-model');
    });

    it('vibe: requires MISTRAL_API_KEY', async () => {
        const origKey = process.env.MISTRAL_API_KEY;
        process.env.MISTRAL_API_KEY = 'test-mistral-key';
        try {
            const builder = new GenericAgentBuilder(BASE_CONFIG, AGENT_REGISTRY.vibe);
            const command = await builder.buildCommand('instructions');
            expect(command.args[2]).toBe('vibe');
            expect(command.env?.MISTRAL_API_KEY).toBe('test-mistral-key');
        } finally {
            if (origKey === undefined) delete process.env.MISTRAL_API_KEY;
            else process.env.MISTRAL_API_KEY = origKey;
        }
    });

    it('codex: includes model_reasoning_effort=high', async () => {
        const origKey = process.env.OPENAI_API_KEY;
        process.env.OPENAI_API_KEY = 'test-oa-key';
        try {
            const builder = new GenericAgentBuilder(BASE_CONFIG, AGENT_REGISTRY.codex);
            const command = await builder.buildCommand('instructions');
            expect(command.args[2]).toBe('codex');
            expect(command.args).toContain('model_reasoning_effort=high');
            expect(command.args).toContain('--yolo');
        } finally {
            if (origKey === undefined) delete process.env.OPENAI_API_KEY;
            else process.env.OPENAI_API_KEY = origKey;
        }
    });

    it('aider: uses fileList when provided', async () => {
        const origKey = process.env.OPENAI_API_KEY;
        process.env.OPENAI_API_KEY = 'test-oa-key';
        try {
            const builder = new GenericAgentBuilder(BASE_CONFIG, AGENT_REGISTRY.aider);
            const command = await builder.buildCommand('instructions', {
                sourceFiles: ['app.ts'],
                testFiles: ['app.test.ts']
            });
            expect(command.args[2]).toBe('aider');
            expect(command.args).toContain('app.ts');
            expect(command.args).toContain('app.test.ts');
        } finally {
            if (origKey === undefined) delete process.env.OPENAI_API_KEY;
            else process.env.OPENAI_API_KEY = origKey;
        }
    });
});

describe('claude: provider branching', () => {
    const envKeys = ['ANTHROPIC_API_KEY', 'DASHSCOPE_API_KEY', 'DEEPSEEK_API_KEY', 'MOONSHOT_API_KEY', 'ZAI_API_KEY', 'OPENROUTER_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN'];
    let originals: Record<string, string | undefined>;

    beforeEach(() => { originals = clearEnvKeys(envKeys); });
    afterEach(() => restoreEnvKeys(originals));

    it('anthropic (default): uses ANTHROPIC_API_KEY', async () => {
        process.env.ANTHROPIC_API_KEY = 'anthropic-key';
        const builder = new GenericAgentBuilder(BASE_CONFIG, AGENT_REGISTRY.claude);
        const command = await builder.buildCommand('instructions');
        expect(command.args.slice(0, 3)).toEqual(['bash', SCRIPT_PATH, 'claude']);
        expect(command.args).toContain('--model');
        expect(command.args).toContain('-p');
        expect(command.env?.ANTHROPIC_API_KEY).toBe('anthropic-key');
    });

    it('dashscope: maps DASHSCOPE_API_KEY to ANTHROPIC_* vars and sets default dashscope base URL', async () => {
        process.env.DASHSCOPE_API_KEY = 'dashscope-key';
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, provider: 'dashscope' }, AGENT_REGISTRY.claude);
        const command = await builder.buildCommand('instructions');
        expect(command.env?.ANTHROPIC_API_KEY).toBe('dashscope-key');
        expect(command.env?.ANTHROPIC_AUTH_TOKEN).toBe('dashscope-key');
        expect(command.env?.ANTHROPIC_BASE_URL).toBe('https://dashscope-intl.aliyuncs.com/api/v2/apps/claude-code-proxy');
        expect(command.env?.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('test-model');
        expect(command.env?.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('test-model');
        expect(command.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('test-model');
    });

    it('dashscope: respects ANTHROPIC_BASE_URL env override', async () => {
        process.env.DASHSCOPE_API_KEY = 'dashscope-key';
        process.env.ANTHROPIC_BASE_URL = 'https://custom.example.com';
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, provider: 'dashscope' }, AGENT_REGISTRY.claude);
        const command = await builder.buildCommand('instructions');
        expect(command.env?.ANTHROPIC_BASE_URL).toBe('https://custom.example.com');
    });

    it('deepseek: maps DEEPSEEK_API_KEY to ANTHROPIC_* vars with deepseek base URL', async () => {
        process.env.DEEPSEEK_API_KEY = 'deepseek-key';
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, provider: 'deepseek' }, AGENT_REGISTRY.claude);
        const command = await builder.buildCommand('instructions');
        expect(command.env?.ANTHROPIC_API_KEY).toBe('deepseek-key');
        expect(command.env?.ANTHROPIC_AUTH_TOKEN).toBe('deepseek-key');
        expect(command.env?.ANTHROPIC_BASE_URL).toBe('https://api.deepseek.com/anthropic');
        expect(command.env?.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('test-model');
    });

    it('moonshot: maps MOONSHOT_API_KEY to ANTHROPIC_* vars with moonshot base URL', async () => {
        process.env.MOONSHOT_API_KEY = 'moonshot-key';
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, provider: 'moonshot' }, AGENT_REGISTRY.claude);
        const command = await builder.buildCommand('instructions');
        expect(command.env?.ANTHROPIC_API_KEY).toBe('moonshot-key');
        expect(command.env?.ANTHROPIC_AUTH_TOKEN).toBe('moonshot-key');
        expect(command.env?.ANTHROPIC_BASE_URL).toBe('https://api.moonshot.ai/anthropic');
        expect(command.env?.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('test-model');
    });

    it('zai: maps ZAI_API_KEY to ANTHROPIC_* vars with zai base URL', async () => {
        process.env.ZAI_API_KEY = 'zai-key';
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, provider: 'zai' }, AGENT_REGISTRY.claude);
        const command = await builder.buildCommand('instructions');
        expect(command.env?.ANTHROPIC_API_KEY).toBe('zai-key');
        expect(command.env?.ANTHROPIC_AUTH_TOKEN).toBe('zai-key');
        expect(command.env?.ANTHROPIC_BASE_URL).toBe('https://api.z.ai/api/anthropic');
        expect(command.env?.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('test-model');
    });

    it('openrouter: sets ANTHROPIC_API_KEY="" and ANTHROPIC_AUTH_TOKEN=key with openrouter base URL', async () => {
        process.env.OPENROUTER_API_KEY = 'router-key';
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, provider: 'openrouter' }, AGENT_REGISTRY.claude);
        const command = await builder.buildCommand('instructions');
        expect(command.env?.ANTHROPIC_API_KEY).toBe('');
        expect(command.env?.ANTHROPIC_AUTH_TOKEN).toBe('router-key');
        expect(command.env?.ANTHROPIC_BASE_URL).toBe('https://openrouter.ai/api');
        expect(command.env?.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('test-model');
    });

    it('openrouter: respects ANTHROPIC_BASE_URL env override', async () => {
        process.env.OPENROUTER_API_KEY = 'router-key';
        process.env.ANTHROPIC_BASE_URL = 'https://proxy.example.com';
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, provider: 'openrouter' }, AGENT_REGISTRY.claude);
        const command = await builder.buildCommand('instructions');
        expect(command.env?.ANTHROPIC_BASE_URL).toBe('https://proxy.example.com');
    });

    it('sets IS_SANDBOX=1 when useDocker is true', async () => {
        process.env.ANTHROPIC_API_KEY = 'test-key';
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, useDocker: true }, AGENT_REGISTRY.claude);
        const command = await builder.buildCommand('instructions');
        expect(command.env?.IS_SANDBOX).toBe('1');
    });

    it('does not set IS_SANDBOX when useDocker is false', async () => {
        process.env.ANTHROPIC_API_KEY = 'test-key';
        const builder = new GenericAgentBuilder(BASE_CONFIG, AGENT_REGISTRY.claude);
        const command = await builder.buildCommand('instructions');
        expect(command.env?.IS_SANDBOX).toBeUndefined();
    });

    it('v2 Docker: uses prompt file mount instead of inline instructions', async () => {
        process.env.ANTHROPIC_API_KEY = 'test-key';
        const builder = new GenericAgentBuilder(
            { ...BASE_CONFIG, dataset: 'v2', useDocker: true, exercise: '12345_1' },
            AGENT_REGISTRY.claude
        );
        const command = await builder.buildCommand('## Instructions\n\nDo the thing');
        expect(command.promptFileHostPath).toMatch(/\.agent-prompts\/12345_1\.txt$/);
        expect(command.promptFileContainerPath).toBe(PROMPT_MOUNT_CONTAINER);
        const pIdx = command.args.indexOf('-p');
        expect(pIdx).not.toBe(-1);
        expect(command.args[pIdx + 1]).toBe(PROMPT_PLACEHOLDER);
    });
});

describe('claude: subscription auth', () => {
    const envKeys = ['ANTHROPIC_API_KEY', 'DASHSCOPE_API_KEY'];
    let originals: Record<string, string | undefined>;

    beforeEach(() => { originals = clearEnvKeys(envKeys); });
    afterEach(() => { restoreEnvKeys(originals); clearAuthCache('claude'); });

    it('does not throw when auth cache exists and no API key is set', async () => {
        seedAuthCache('claude');
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, useDocker: true }, AGENT_REGISTRY.claude);
        const command = await builder.buildCommand('test');
        expect(command.env?.ANTHROPIC_API_KEY).toBeUndefined();
    });

    it('throws when neither API key nor auth cache exists', async () => {
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, useDocker: true }, AGENT_REGISTRY.claude);
        await expect(builder.buildCommand('test')).rejects.toThrow(/--setup-auth claude/);
    });

    it('uses API key when set (takes priority over auth cache)', async () => {
        process.env.ANTHROPIC_API_KEY = 'test-key';
        seedAuthCache('claude');
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, useDocker: true }, AGENT_REGISTRY.claude);
        const command = await builder.buildCommand('test');
        expect(command.env?.ANTHROPIC_API_KEY).toBe('test-key');
    });
});

describe('gemini: subscription auth', () => {
    const envKeys = ['GEMINI_API_KEY', 'GOOGLE_API_KEY'];
    let originals: Record<string, string | undefined>;

    beforeEach(() => { originals = clearEnvKeys(envKeys); });
    afterEach(() => { restoreEnvKeys(originals); clearAuthCache('gemini'); });

    it('does not throw when auth cache exists and no API key is set', async () => {
        seedAuthCache('gemini');
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, useDocker: true }, AGENT_REGISTRY.gemini);
        const command = await builder.buildCommand('test');
        expect(command.env?.GEMINI_API_KEY).toBeUndefined();
    });

    it('throws when neither API key nor auth cache exists', async () => {
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, useDocker: true }, AGENT_REGISTRY.gemini);
        await expect(builder.buildCommand('test')).rejects.toThrow(/--setup-auth gemini/);
    });

    it('uses API key when set (takes priority over auth cache)', async () => {
        process.env.GEMINI_API_KEY = 'test-key';
        seedAuthCache('gemini');
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, useDocker: true }, AGENT_REGISTRY.gemini);
        const command = await builder.buildCommand('test');
        expect(command.env?.GEMINI_API_KEY).toBe('test-key');
    });
});

describe('codex: subscription auth', () => {
    const envKeys = ['CODEX_API_KEY', 'OPENAI_API_KEY'];
    let originals: Record<string, string | undefined>;

    beforeEach(() => { originals = clearEnvKeys(envKeys); });
    afterEach(() => { restoreEnvKeys(originals); clearAuthCache('codex'); });

    it('does not throw when auth cache exists and no API key is set', async () => {
        seedAuthCache('codex');
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, useDocker: true }, AGENT_REGISTRY.codex);
        const command = await builder.buildCommand('test');
        expect(command.env?.CODEX_API_KEY).toBeUndefined();
    });

    it('throws when neither API key nor auth cache exists', async () => {
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, useDocker: true }, AGENT_REGISTRY.codex);
        await expect(builder.buildCommand('test')).rejects.toThrow(/--setup-auth codex/);
    });

    it('uses API key when set (takes priority over auth cache)', async () => {
        process.env.OPENAI_API_KEY = 'test-key';
        seedAuthCache('codex');
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, useDocker: true }, AGENT_REGISTRY.codex);
        const command = await builder.buildCommand('test');
        expect(command.env?.CODEX_API_KEY).toBe('test-key');
    });
});

describe('opencode: provider branching', () => {
    const envKeys = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'XAI_API_KEY', 'DASHSCOPE_API_KEY', 'DEEPSEEK_API_KEY'];
    let originals: Record<string, string | undefined>;

    beforeEach(() => { originals = clearEnvKeys(envKeys); });
    afterEach(() => restoreEnvKeys(originals));

    it('openai (default): buildArgs has opencode/run/-m and uses OPENAI_API_KEY', async () => {
        process.env.OPENAI_API_KEY = 'openai-key';
        const builder = new GenericAgentBuilder(BASE_CONFIG, AGENT_REGISTRY.opencode);
        const command = await builder.buildCommand('instructions');
        expect(command.args.slice(0, 3)).toEqual(['bash', SCRIPT_PATH, 'opencode']);
        expect(command.args).toContain('run');
        expect(command.args).toContain('-m');
        expect(command.env).toEqual({ OPENAI_API_KEY: 'openai-key' });
    });

    it('openrouter: sets OPENROUTER_API_KEY', async () => {
        process.env.OPENROUTER_API_KEY = 'router-key';
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, provider: 'openrouter' }, AGENT_REGISTRY.opencode);
        const command = await builder.buildCommand('instructions');
        expect(command.env).toEqual({ OPENROUTER_API_KEY: 'router-key' });
    });

    it('google: prefers GOOGLE_GENERATIVE_AI_API_KEY', async () => {
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'gen-key';
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, provider: 'google' }, AGENT_REGISTRY.opencode);
        const command = await builder.buildCommand('instructions');
        expect(command.env).toEqual({ GOOGLE_GENERATIVE_AI_API_KEY: 'gen-key' });
    });

    it('google: falls back to GOOGLE_API_KEY and sets GOOGLE_GENERATIVE_AI_API_KEY alias', async () => {
        process.env.GOOGLE_API_KEY = 'legacy-key';
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, provider: 'google' }, AGENT_REGISTRY.opencode);
        const command = await builder.buildCommand('instructions');
        expect(command.env?.GOOGLE_GENERATIVE_AI_API_KEY).toBe('legacy-key');
        expect(command.env?.GOOGLE_API_KEY).toBe('legacy-key');
    });

    it('xai: sets XAI_API_KEY', async () => {
        process.env.XAI_API_KEY = 'xai-key';
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, provider: 'xai' }, AGENT_REGISTRY.opencode);
        const command = await builder.buildCommand('instructions');
        expect(command.env).toEqual({ XAI_API_KEY: 'xai-key' });
    });

    it('dashscope: sets DASHSCOPE_API_KEY', async () => {
        process.env.DASHSCOPE_API_KEY = 'dashscope-key';
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, provider: 'dashscope' }, AGENT_REGISTRY.opencode);
        const command = await builder.buildCommand('instructions');
        expect(command.env).toEqual({ DASHSCOPE_API_KEY: 'dashscope-key' });
    });

    it('deepseek: sets DEEPSEEK_API_KEY', async () => {
        process.env.DEEPSEEK_API_KEY = 'deepseek-key';
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, provider: 'deepseek' }, AGENT_REGISTRY.opencode);
        const command = await builder.buildCommand('instructions');
        expect(command.env).toEqual({ DEEPSEEK_API_KEY: 'deepseek-key' });
    });

    it('model is prefixed with provider when no slash in model name', async () => {
        process.env.OPENAI_API_KEY = 'openai-key';
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, provider: 'openai', model: 'gpt-4o' }, AGENT_REGISTRY.opencode);
        const command = await builder.buildCommand('instructions');
        const mIdx = command.args.indexOf('-m');
        expect(command.args[mIdx + 1]).toBe('openai/gpt-4o');
    });

    it('model is not re-prefixed when it already contains a slash', async () => {
        process.env.OPENAI_API_KEY = 'openai-key';
        const builder = new GenericAgentBuilder({ ...BASE_CONFIG, provider: 'openai', model: 'openai/gpt-4o' }, AGENT_REGISTRY.opencode);
        const command = await builder.buildCommand('instructions');
        const mIdx = command.args.indexOf('-m');
        expect(command.args[mIdx + 1]).toBe('openai/gpt-4o');
    });
});
