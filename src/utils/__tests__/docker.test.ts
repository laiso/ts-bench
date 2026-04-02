import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { createEnvironmentArgs, createEnvironmentFile } from '../docker';

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
