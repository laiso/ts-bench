import { describe, expect, it } from 'bun:test';
import type { CommandExecutor, CommandResult, ExecuteOptions } from '../shell';
import { VersionDetector } from '../version-detector';

class MockExecutor implements CommandExecutor {
    constructor(private result: CommandResult) {}

    async execute(_args: string[], _options?: ExecuteOptions): Promise<CommandResult> {
        return this.result;
    }
}

function makeDetector(result: CommandResult): VersionDetector {
    return new VersionDetector(new MockExecutor(result));
}

describe('VersionDetector', () => {
    describe('detectAgentVersion – stdout parsing', () => {
        it('parses claude version from stdout', async () => {
            const detector = makeDetector({ exitCode: 0, stdout: 'claude-code 1.2.3', stderr: '' });
            expect(await detector.detectAgentVersion('claude')).toBe('1.2.3');
        });

        it('parses aider version from stdout', async () => {
            const detector = makeDetector({ exitCode: 0, stdout: 'aider 0.45.1', stderr: '' });
            expect(await detector.detectAgentVersion('aider')).toBe('0.45.1');
        });

        it('parses goose version from stdout', async () => {
            const detector = makeDetector({ exitCode: 0, stdout: 'goose 1.2.0', stderr: '' });
            expect(await detector.detectAgentVersion('goose')).toBe('1.2.0');
        });

        it('parses codex version from stdout', async () => {
            const detector = makeDetector({ exitCode: 0, stdout: 'codex 1.0.0', stderr: '' });
            expect(await detector.detectAgentVersion('codex')).toBe('1.0.0');
        });

        it('parses gemini version from stdout', async () => {
            const detector = makeDetector({ exitCode: 0, stdout: 'gemini 1.2.3', stderr: '' });
            expect(await detector.detectAgentVersion('gemini')).toBe('1.2.3');
        });

        it('parses qwen version from stdout', async () => {
            const detector = makeDetector({ exitCode: 0, stdout: 'qwen 2.0.1', stderr: '' });
            expect(await detector.detectAgentVersion('qwen')).toBe('2.0.1');
        });

        it('parses opencode version from stdout (bare format)', async () => {
            const detector = makeDetector({ exitCode: 0, stdout: '1.3.13', stderr: '' });
            expect(await detector.detectAgentVersion('opencode')).toBe('1.3.13');
        });

        it('parses opencode version from stdout (prefixed format)', async () => {
            const detector = makeDetector({ exitCode: 0, stdout: 'opencode 0.3.0', stderr: '' });
            expect(await detector.detectAgentVersion('opencode')).toBe('0.3.0');
        });

        it('parses copilot version from stdout', async () => {
            const detector = makeDetector({ exitCode: 0, stdout: 'copilot 1.0.0', stderr: '' });
            expect(await detector.detectAgentVersion('copilot')).toBe('1.0.0');
        });

        it('parses cursor version from stdout', async () => {
            const detector = makeDetector({ exitCode: 0, stdout: '0.2.5', stderr: '' });
            expect(await detector.detectAgentVersion('cursor')).toBe('0.2.5');
        });

        it('parses kimi version from stdout', async () => {
            const detector = makeDetector({ exitCode: 0, stdout: '1.0.0', stderr: '' });
            expect(await detector.detectAgentVersion('kimi')).toBe('1.0.0');
        });
    });

    describe('detectAgentVersion – stderr fallback', () => {
        it('falls back to stderr when stdout is empty', async () => {
            const detector = makeDetector({ exitCode: 0, stdout: '', stderr: '1.5.0' });
            expect(await detector.detectAgentVersion('gemini')).toBe('1.5.0');
        });

        it('falls back to stderr when stdout has no version', async () => {
            const detector = makeDetector({ exitCode: 0, stdout: 'no version here', stderr: 'gemini 0.9.1' });
            // stdout "no version here" has no semver, falls back to stderr
            // Note: extractGenericVersion would still return 'unknown' for purely alphabetic text
            expect(await detector.detectAgentVersion('gemini')).toBe('0.9.1');
        });

        it('uses stdout version when available, does not fall back', async () => {
            const detector = makeDetector({ exitCode: 0, stdout: 'gemini 2.0.0', stderr: 'some stderr noise 3.0.0' });
            expect(await detector.detectAgentVersion('gemini')).toBe('2.0.0');
        });

        it('stdout takes precedence over stderr when both contain parseable versions', async () => {
            const detector = makeDetector({ exitCode: 0, stdout: 'gemini 1.1.1', stderr: 'gemini 9.9.9' });
            expect(await detector.detectAgentVersion('gemini')).toBe('1.1.1');
        });
    });

    describe('detectAgentVersion – no version found', () => {
        it('returns unknown when both stdout and stderr have no version info', async () => {
            const detector = makeDetector({ exitCode: 0, stdout: '', stderr: '' });
            expect(await detector.detectAgentVersion('gemini')).toBe('unknown');
        });
    });

    describe('detectAgentVersion – non-zero exit code', () => {
        it('returns 0.0.0 when exitCode is non-zero', async () => {
            const detector = makeDetector({ exitCode: 1, stdout: '1.2.3', stderr: 'command not found' });
            expect(await detector.detectAgentVersion('gemini')).toBe('0.0.0');
        });

        it('returns 0.0.0 for any non-zero exit code', async () => {
            const detector = makeDetector({ exitCode: 127, stdout: '', stderr: '' });
            expect(await detector.detectAgentVersion('claude')).toBe('0.0.0');
        });
    });

    describe('detectAgentVersion – opencode real-world scenarios', () => {
        it('parses opencode version when models.dev error appears on stderr', async () => {
            const detector = makeDetector({
                exitCode: 0,
                stdout: '1.3.13',
                stderr: 'ERROR 2026-04-06T09:07:24 +150ms service=models.dev error=Unable to connect. Is the computer able to access the url? Failed to fetch models.dev'
            });
            expect(await detector.detectAgentVersion('opencode')).toBe('1.3.13');
        });

        it('parses opencode version from stderr when stdout is empty', async () => {
            const detector = makeDetector({
                exitCode: 0,
                stdout: '',
                stderr: '1.3.13'
            });
            expect(await detector.detectAgentVersion('opencode')).toBe('1.3.13');
        });

        it('parses opencode pre-release version', async () => {
            const detector = makeDetector({ exitCode: 0, stdout: '0.0.0-202506070331', stderr: '' });
            expect(await detector.detectAgentVersion('opencode')).toBe('0.0.0');
        });
    });

    describe('detectAgentVersion – stderr noise does not cause false matches', () => {
        it('does not match run-agent checking messages in stderr', async () => {
            const detector = makeDetector({
                exitCode: 0,
                stdout: '',
                stderr: '[run-agent] Checking for gemini...'
            });
            // No semver in that message, should return unknown
            expect(await detector.detectAgentVersion('gemini')).toBe('unknown');
        });

        it('does not match purely alphabetic stderr content', async () => {
            const detector = makeDetector({ exitCode: 0, stdout: '', stderr: 'Error: command not found' });
            expect(await detector.detectAgentVersion('gemini')).toBe('unknown');
        });
    });

    describe('VersionDetector constructor', () => {
        it('can be constructed without arguments', () => {
            expect(() => new VersionDetector()).not.toThrow();
        });

        it('accepts a custom executor', () => {
            const mock = new MockExecutor({ exitCode: 0, stdout: '1.0.0', stderr: '' });
            expect(() => new VersionDetector(mock)).not.toThrow();
        });
    });
});
