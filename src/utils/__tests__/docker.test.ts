import { describe, expect, it, afterEach } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { createEnvironmentArgs, createEnvironmentFile, createAuthCacheArgs, hasAuthCache, AUTH_SENTINEL } from '../docker';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

describe('createEnvironmentArgs', () => {
    it('keeps empty ANTHROPIC_API_KEY to disable Anthropic fallback for OpenRouter', () => {
        const args = createEnvironmentArgs({
            ANTHROPIC_API_KEY: '',
            ANTHROPIC_AUTH_TOKEN: 'router-key',
            ANTHROPIC_BASE_URL: 'https://openrouter.ai/api'
        });

        expect(args).toEqual([
            '-e', 'ANTHROPIC_API_KEY=',
            '-e', 'ANTHROPIC_AUTH_TOKEN=router-key',
            '-e', 'ANTHROPIC_BASE_URL=https://openrouter.ai/api'
        ]);
    });

    it('still drops unrelated empty environment values', () => {
        const args = createEnvironmentArgs({
            EMPTY_VALUE: '',
            NON_EMPTY: 'set'
        });

        expect(args).toEqual([
            '-e', 'NON_EMPTY=set'
        ]);
    });
});

describe('createEnvironmentFile', () => {
    it('returns --env-file args pointing to an existing temp file', () => {
        const { args, cleanup } = createEnvironmentFile({ MY_KEY: 'my-value' });
        try {
            expect(args[0]).toBe('--env-file');
            expect(existsSync(args[1]!)).toBe(true);
        } finally {
            cleanup();
        }
    });

    it('writes key=value lines to the temp file', () => {
        const { args, cleanup } = createEnvironmentFile({
            FOO: 'bar',
            EMPTY_VALUE: '',
            ANTHROPIC_API_KEY: '',
        });
        try {
            const content = readFileSync(args[1]!, 'utf-8');
            expect(content).toContain('FOO=bar');
            expect(content).toContain('ANTHROPIC_API_KEY=');
            expect(content).not.toContain('EMPTY_VALUE');
        } finally {
            cleanup();
        }
    });

    it('cleanup removes the temp file', () => {
        const { args, cleanup } = createEnvironmentFile({ KEY: 'val' });
        cleanup();
        expect(existsSync(args[1]!)).toBe(false);
    });

    it('cleanup is idempotent (does not throw on second call)', () => {
        const { cleanup } = createEnvironmentFile({ KEY: 'val' });
        cleanup();
        expect(() => cleanup()).not.toThrow();
    });
});

describe('createAuthCacheArgs', () => {
    it('returns volume mount args for known agents', () => {
        const args = createAuthCacheArgs('claude');
        expect(args).toHaveLength(2);
        expect(args[0]).toBe('-v');
        expect(args[1]).toMatch(/\.cache\/ts-bench\/auth\/claude:\/root\/\.claude$/);
    });

    it('returns volume mount args for gemini', () => {
        const args = createAuthCacheArgs('gemini');
        expect(args[1]).toMatch(/\.cache\/ts-bench\/auth\/gemini:\/root\/\.gemini$/);
    });

    it('returns volume mount args for codex', () => {
        const args = createAuthCacheArgs('codex');
        expect(args[1]).toMatch(/\.cache\/ts-bench\/auth\/codex:\/root\/\.codex$/);
    });

    it('returns empty array for unknown agents', () => {
        expect(createAuthCacheArgs('unknown-agent')).toEqual([]);
    });
});

describe('hasAuthCache', () => {
    const testAgent = '__test_auth_cache__';
    const testDir = join(homedir(), '.cache', 'ts-bench', 'auth', testAgent);

    afterEach(() => {
        try { rmSync(testDir, { recursive: true, force: true }); } catch {}
    });

    it('returns false when auth cache dir does not exist', () => {
        expect(hasAuthCache(testAgent)).toBe(false);
    });

    it('returns false when auth cache dir is empty', () => {
        mkdirSync(testDir, { recursive: true });
        expect(hasAuthCache(testAgent)).toBe(false);
    });

    it('returns false when dir has files but no sentinel', () => {
        mkdirSync(testDir, { recursive: true });
        writeFileSync(join(testDir, 'credentials.json'), '{}');
        expect(hasAuthCache(testAgent)).toBe(false);
    });

    it('returns true when sentinel file exists', () => {
        mkdirSync(testDir, { recursive: true });
        writeFileSync(join(testDir, AUTH_SENTINEL), new Date().toISOString());
        expect(hasAuthCache(testAgent)).toBe(true);
    });
});
