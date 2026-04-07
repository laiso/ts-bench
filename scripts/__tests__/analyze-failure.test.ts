import { describe, expect, it } from 'bun:test';
import {
    compressDuplicateLines,
    extractPytestFailures,
    trimAgentLog,
    parseAnalysisResponse,
    buildMarkdownReport,
    truncateToMaxChars,
} from '../analyze-failure.ts';

describe('compressDuplicateLines', () => {
    it('compresses consecutive identical lines', () => {
        const input = ['error: foo', 'error: foo', 'error: foo', 'done'].join('\n');
        const result = compressDuplicateLines(input);
        expect(result).toBe('error: foo ×3\ndone');
    });

    it('leaves unique lines unchanged', () => {
        const input = 'a\nb\nc';
        expect(compressDuplicateLines(input)).toBe('a\nb\nc');
    });

    it('handles empty string', () => {
        expect(compressDuplicateLines('')).toBe('');
    });

    it('compresses a single repeated line', () => {
        const input = ['x', 'x'].join('\n');
        expect(compressDuplicateLines(input)).toBe('x ×2');
    });

    it('does not compress non-consecutive identical lines', () => {
        const input = 'a\nb\na';
        expect(compressDuplicateLines(input)).toBe('a\nb\na');
    });
});

describe('extractPytestFailures', () => {
    it('extracts from === FAILURES === onwards', () => {
        const log = [
            'platform linux',
            'collected 5 items',
            '',
            '=== FAILURES ===',
            'FAILED test_foo',
            'AssertionError: expected 1 got 2',
            '',
            'short test summary info',
        ].join('\n');

        const result = extractPytestFailures(log);
        expect(result).toContain('=== FAILURES ===');
        expect(result).toContain('AssertionError');
        expect(result).not.toContain('platform linux');
    });

    it('falls back to tail when no FAILURES section', () => {
        const lines = Array.from({ length: 300 }, (_, i) => `line ${i}`);
        const log = lines.join('\n');
        const result = extractPytestFailures(log, 200);
        expect(result).toContain('line 299');
        expect(result).not.toContain('line 0');
    });

    it('respects maxLines', () => {
        const log = '=== FAILURES ===\n' + Array.from({ length: 300 }, (_, i) => `fail ${i}`).join('\n');
        const result = extractPytestFailures(log, 50);
        expect(result.split('\n').length).toBeLessThanOrEqual(50);
    });
});

describe('trimAgentLog', () => {
    it('returns full log when short enough', () => {
        const log = 'a\nb\nc';
        expect(trimAgentLog(log, 50, 50)).toBe('a\nb\nc');
    });

    it('inserts omission marker for long logs', () => {
        const lines = Array.from({ length: 200 }, (_, i) => `line ${i}`);
        const log = lines.join('\n');
        const result = trimAgentLog(log, 10, 10);
        expect(result).toContain('line 0');
        expect(result).toContain('line 199');
        expect(result).toContain('lines omitted');
    });

    it('applies duplicate compression', () => {
        const lines = Array.from({ length: 10 }, () => 'error: same');
        const log = lines.join('\n');
        const result = trimAgentLog(log);
        expect(result).toContain('×10');
    });
});

describe('parseAnalysisResponse', () => {
    it('parses all five fields', () => {
        const text = [
            'CLASSIFICATION: WRONG_FIX',
            'ROOT_CAUSE: The agent modified the wrong function.',
            'TEST_EXPECTATION: The test expected the return value to be 42.',
            'AGENT_BEHAVIOR: The agent changed an unrelated helper.',
            'SUGGESTION: Focus on the function mentioned in the error message.',
        ].join('\n');

        const parsed = parseAnalysisResponse(text);
        expect(parsed.classification).toBe('WRONG_FIX');
        expect(parsed.rootCause).toBe('The agent modified the wrong function.');
        expect(parsed.testExpectation).toBe('The test expected the return value to be 42.');
        expect(parsed.agentBehavior).toBe('The agent changed an unrelated helper.');
        expect(parsed.suggestion).toBe('Focus on the function mentioned in the error message.');
    });

    it('returns (not provided) for missing fields', () => {
        const parsed = parseAnalysisResponse('CLASSIFICATION: NO_CHANGE');
        expect(parsed.rootCause).toBe('(not provided)');
        expect(parsed.testExpectation).toBe('(not provided)');
    });
});

describe('truncateToMaxChars', () => {
    it('returns text unchanged when under limit', () => {
        expect(truncateToMaxChars('hello', 100)).toBe('hello');
    });

    it('truncates and appends marker when over limit', () => {
        const long = 'a'.repeat(200);
        const result = truncateToMaxChars(long, 100);
        expect(result.startsWith('a'.repeat(100))).toBe(true);
        expect(result).toContain('truncated to 100 chars');
    });

    it('handles exact boundary without truncating', () => {
        const text = 'x'.repeat(50);
        expect(truncateToMaxChars(text, 50)).toBe(text);
    });
});

describe('buildMarkdownReport', () => {
    const meta = {
        agent: 'claude',
        model: 'claude-3-5-sonnet',
        provider: 'anthropic',
        timestamp: '2024-01-01T00:00:00Z',
        runUrl: 'https://github.com/owner/repo/actions/runs/123',
        runId: '123',
    };
    const summary = {
        successRate: 80.0,
        successCount: 4,
        totalCount: 5,
        avgDuration: 60000,
        totalDuration: 300000,
    };

    it('includes header metadata', () => {
        const md = buildMarkdownReport(meta, summary, [], 'openai/gpt-4o-mini');
        expect(md).toContain('claude');
        expect(md).toContain('claude-3-5-sonnet');
        expect(md).toContain('4/5 passed');
        expect(md).toContain('80.0%');
        expect(md).toContain('openai/gpt-4o-mini');
    });

    it('includes task section for each analysis', () => {
        const analyses = [
            {
                taskId: 'task_123',
                classification: 'WRONG_FIX',
                rootCause: 'Wrong function modified.',
                testExpectation: 'Expected value 42.',
                agentBehavior: 'Changed unrelated code.',
                suggestion: 'Fix the right function.',
                patchLines: 10,
                agentDuration: 120,
                testDuration: 30,
                agentSuccess: false,
                testSuccess: false,
            },
        ];
        const md = buildMarkdownReport(meta, summary, analyses, 'openai/gpt-4o-mini');
        expect(md).toContain('task_123');
        expect(md).toContain('WRONG_FIX');
        expect(md).toContain('10 lines changed');
        expect(md).toContain('Wrong function modified.');
    });

    it('renders patch inline in a details block when rawPatch is provided', () => {
        const patch = `diff --git a/foo.ts b/foo.ts\n+added line\n-removed line\n`;
        const analyses = [
            {
                taskId: 'task_patch',
                classification: 'PARTIAL_FIX',
                rootCause: 'Partial fix.',
                testExpectation: 'Expected full fix.',
                agentBehavior: 'Only part fixed.',
                suggestion: 'Fix completely.',
                patchLines: 2,
                rawPatch: patch,
                agentDuration: 60,
                testDuration: 10,
                agentSuccess: true,
                testSuccess: false,
            },
        ];
        const md = buildMarkdownReport(meta, summary, analyses, 'openai/gpt-4o-mini');
        expect(md).toContain('<details>');
        expect(md).toContain('📄 Patch');
        expect(md).toContain('```diff');
        expect(md).toContain('+added line');
        expect(md).toContain('-removed line');
        expect(md).toContain('</details>');
    });

    it('does not render details block when rawPatch is absent', () => {
        const analyses = [
            {
                taskId: 'task_nopatch',
                classification: 'NO_CHANGE',
                rootCause: 'Nothing done.',
                testExpectation: 'Expected fix.',
                agentBehavior: 'No edits.',
                suggestion: 'Edit something.',
                patchLines: 0,
                agentDuration: 30,
                testDuration: 5,
                agentSuccess: false,
                testSuccess: false,
            },
        ];
        const md = buildMarkdownReport(meta, summary, analyses, 'openai/gpt-4o-mini');
        expect(md).not.toContain('<details>');
    });

    it('does not render details block when rawPatch is empty string', () => {
        const analyses = [
            {
                taskId: 'task_emptypatch',
                classification: 'NO_CHANGE',
                rootCause: 'Nothing done.',
                testExpectation: 'Expected fix.',
                agentBehavior: 'No edits.',
                suggestion: 'Edit something.',
                patchLines: 0,
                rawPatch: '   ',
                agentDuration: 30,
                testDuration: 5,
                agentSuccess: false,
                testSuccess: false,
            },
        ];
        const md = buildMarkdownReport(meta, summary, analyses, 'openai/gpt-4o-mini');
        expect(md).not.toContain('<details>');
    });

    it('shows API error when present', () => {
        const analyses = [
            {
                taskId: 'task_456',
                classification: 'UNKNOWN',
                rootCause: '',
                testExpectation: '',
                agentBehavior: '',
                suggestion: '',
                patchLines: 0,
                agentDuration: 60,
                testDuration: 10,
                agentSuccess: false,
                testSuccess: false,
                error: 'HTTP 429: rate limited',
            },
        ];
        const md = buildMarkdownReport(meta, summary, analyses, 'openai/gpt-4o-mini');
        expect(md).toContain('HTTP 429: rate limited');
    });

    it('shows empty patch correctly', () => {
        const analyses = [
            {
                taskId: 'task_789',
                classification: 'NO_CHANGE',
                rootCause: 'Agent did nothing.',
                testExpectation: 'Expected a fix.',
                agentBehavior: 'No edits.',
                suggestion: 'Make changes.',
                patchLines: 0,
                agentDuration: 30,
                testDuration: 5,
                agentSuccess: false,
                testSuccess: false,
            },
        ];
        const md = buildMarkdownReport(meta, summary, analyses, 'openai/gpt-4o-mini');
        expect(md).toContain('empty');
    });
});
