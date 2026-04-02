import { describe, expect, it, afterEach } from 'bun:test';
import { ClaudeAgentBuilder } from '../claude';
import { GeminiAgentBuilder } from '../gemini';
import { CodexAgentBuilder } from '../codex';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const BASE_CONFIG = {
    model: 'test-model',
    containerName: 'test-container',
    agentScriptPath: '/tmp/scripts/run-agent.sh'
};

/** Config with Docker enabled — subscription auth only applies in Docker mode. */
const DOCKER_CONFIG = { ...BASE_CONFIG, useDocker: true };

/**
 * Helper: create a fake auth-cache directory with a dummy credentials file
 * to simulate a successful --setup-auth run.
 */
function seedAuthCache(agent: string): string {
    const dir = join(homedir(), '.cache', 'ts-bench', 'auth', agent);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'credentials.json'), '{}');
    return dir;
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

describe('Subscription auth: Claude', () => {
    const envKeys = ['ANTHROPIC_API_KEY', 'DASHSCOPE_API_KEY'];
    let originals: Record<string, string | undefined>;

    afterEach(() => {
        restoreEnvKeys(originals);
        clearAuthCache('claude');
    });

    it('does not throw when auth cache exists and no API key is set', async () => {
        originals = clearEnvKeys(envKeys);
        seedAuthCache('claude');

        const builder = new ClaudeAgentBuilder(DOCKER_CONFIG);
        const cmd = await builder.buildCommand('test');

        // No API key in env — subscription auth will be used
        expect(cmd.env?.ANTHROPIC_API_KEY).toBeUndefined();
    });

    it('throws when neither API key nor auth cache exists', async () => {
        originals = clearEnvKeys(envKeys);
        clearAuthCache('claude');

        const builder = new ClaudeAgentBuilder(DOCKER_CONFIG);
        expect(builder.buildCommand('test')).rejects.toThrow(/--setup-auth claude/);
    });

    it('uses API key when set (takes priority over auth cache)', async () => {
        originals = clearEnvKeys(envKeys);
        process.env.ANTHROPIC_API_KEY = 'test-key';
        seedAuthCache('claude');

        const builder = new ClaudeAgentBuilder(DOCKER_CONFIG);
        const cmd = await builder.buildCommand('test');

        expect(cmd.env?.ANTHROPIC_API_KEY).toBe('test-key');
    });
});

describe('Subscription auth: Gemini', () => {
    const envKeys = ['GEMINI_API_KEY', 'GOOGLE_API_KEY'];
    let originals: Record<string, string | undefined>;

    afterEach(() => {
        restoreEnvKeys(originals);
        clearAuthCache('gemini');
    });

    it('does not throw when auth cache exists and no API key is set', async () => {
        originals = clearEnvKeys(envKeys);
        seedAuthCache('gemini');

        const builder = new GeminiAgentBuilder(DOCKER_CONFIG);
        const cmd = await builder.buildCommand('test');

        expect(cmd.env?.GEMINI_API_KEY).toBeUndefined();
    });

    it('throws when neither API key nor auth cache exists', async () => {
        originals = clearEnvKeys(envKeys);
        clearAuthCache('gemini');

        const builder = new GeminiAgentBuilder(DOCKER_CONFIG);
        expect(builder.buildCommand('test')).rejects.toThrow(/--setup-auth gemini/);
    });

    it('uses API key when set (takes priority over auth cache)', async () => {
        originals = clearEnvKeys(envKeys);
        process.env.GEMINI_API_KEY = 'test-key';
        seedAuthCache('gemini');

        const builder = new GeminiAgentBuilder(DOCKER_CONFIG);
        const cmd = await builder.buildCommand('test');

        expect(cmd.env?.GEMINI_API_KEY).toBe('test-key');
    });
});

describe('Subscription auth: Codex', () => {
    const envKeys = ['CODEX_API_KEY', 'OPENAI_API_KEY'];
    let originals: Record<string, string | undefined>;

    afterEach(() => {
        restoreEnvKeys(originals);
        clearAuthCache('codex');
    });

    it('does not throw when auth cache exists and no API key is set', async () => {
        originals = clearEnvKeys(envKeys);
        seedAuthCache('codex');

        const builder = new CodexAgentBuilder(DOCKER_CONFIG);
        const cmd = await builder.buildCommand('test');

        expect(cmd.env?.CODEX_API_KEY).toBeUndefined();
    });

    it('throws when neither API key nor auth cache exists', async () => {
        originals = clearEnvKeys(envKeys);
        clearAuthCache('codex');

        const builder = new CodexAgentBuilder(DOCKER_CONFIG);
        expect(builder.buildCommand('test')).rejects.toThrow(/--setup-auth codex/);
    });

    it('uses API key when set (takes priority over auth cache)', async () => {
        originals = clearEnvKeys(envKeys);
        process.env.OPENAI_API_KEY = 'test-key';
        seedAuthCache('codex');

        const builder = new CodexAgentBuilder(DOCKER_CONFIG);
        const cmd = await builder.buildCommand('test');

        expect(cmd.env?.CODEX_API_KEY).toBe('test-key');
    });
});
