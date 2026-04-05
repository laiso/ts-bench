import { describe, expect, it } from 'bun:test';
import { parseClaudeJsonl, parseStdoutTokenUsage, sumTokenUsages } from '../token-parser';
import type { TokenUsage } from '../../config/types';

describe('parseClaudeJsonl', () => {
    it('sums usage fields from top-level usage objects', () => {
        const content = [
            JSON.stringify({ type: 'message_start', usage: { input_tokens: 100, output_tokens: 0 } }),
            JSON.stringify({ type: 'message_delta', usage: { input_tokens: 0, output_tokens: 200 } }),
        ].join('\n');

        const result = parseClaudeJsonl(content);
        expect(result).not.toBeUndefined();
        expect(result!.inputTokens).toBe(100);
        expect(result!.outputTokens).toBe(200);
        expect(result!.totalTokens).toBe(300);
    });

    it('sums usage fields from message.usage objects', () => {
        const content = [
            JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 150, output_tokens: 75 } } }),
            JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 50, output_tokens: 25 } } }),
        ].join('\n');

        const result = parseClaudeJsonl(content);
        expect(result).not.toBeUndefined();
        expect(result!.inputTokens).toBe(200);
        expect(result!.outputTokens).toBe(100);
        expect(result!.totalTokens).toBe(300);
    });

    it('handles mixed top-level and nested usage', () => {
        const content = [
            JSON.stringify({ usage: { input_tokens: 100, output_tokens: 50 } }),
            JSON.stringify({ message: { usage: { input_tokens: 30, output_tokens: 20 } } }),
        ].join('\n');

        const result = parseClaudeJsonl(content);
        expect(result!.inputTokens).toBe(130);
        expect(result!.outputTokens).toBe(70);
    });

    it('returns undefined for content with no usage fields', () => {
        const content = [
            JSON.stringify({ type: 'text', content: 'hello world' }),
            JSON.stringify({ type: 'ping' }),
        ].join('\n');

        expect(parseClaudeJsonl(content)).toBeUndefined();
    });

    it('skips non-JSON lines gracefully', () => {
        const content = [
            'not valid json',
            JSON.stringify({ usage: { input_tokens: 10, output_tokens: 5 } }),
            '{}',
        ].join('\n');

        const result = parseClaudeJsonl(content);
        expect(result!.inputTokens).toBe(10);
        expect(result!.outputTokens).toBe(5);
    });

    it('handles empty content', () => {
        expect(parseClaudeJsonl('')).toBeUndefined();
    });
});

describe('parseStdoutTokenUsage', () => {
    it('parses JSON blob with input_tokens and output_tokens', () => {
        const stdout = 'Done. {"input_tokens":1234,"output_tokens":567} completed.';
        const result = parseStdoutTokenUsage(stdout);
        expect(result).not.toBeUndefined();
        expect(result!.inputTokens).toBe(1234);
        expect(result!.outputTokens).toBe(567);
        expect(result!.totalTokens).toBe(1801);
    });

    it('parses "input tokens: N" style lines', () => {
        const stdout = 'Input tokens: 1000\nOutput tokens: 500\n';
        const result = parseStdoutTokenUsage(stdout);
        expect(result!.inputTokens).toBe(1000);
        expect(result!.outputTokens).toBe(500);
        expect(result!.totalTokens).toBe(1500);
    });

    it('parses "total tokens: N" when only total is available', () => {
        const stdout = 'Total tokens: 2000\n';
        const result = parseStdoutTokenUsage(stdout);
        expect(result!.totalTokens).toBe(2000);
    });

    it('parses aider-style "Tokens: N sent, N received"', () => {
        const stdout = 'Tokens: 1,200 sent, 340 received\n';
        const result = parseStdoutTokenUsage(stdout);
        expect(result!.inputTokens).toBe(1200);
        expect(result!.outputTokens).toBe(340);
    });

    it('parses Codex-style "Usage: prompt=N completion=N"', () => {
        const stdout = 'Usage: prompt=800 completion=200\n';
        const result = parseStdoutTokenUsage(stdout);
        expect(result!.inputTokens).toBe(800);
        expect(result!.outputTokens).toBe(200);
    });

    it('returns undefined for empty output', () => {
        expect(parseStdoutTokenUsage('')).toBeUndefined();
    });

    it('returns undefined when no token patterns found', () => {
        const stdout = 'All tests passed successfully!\n';
        expect(parseStdoutTokenUsage(stdout)).toBeUndefined();
    });
});

describe('sumTokenUsages', () => {
    it('sums multiple TokenUsage objects', () => {
        const usages: TokenUsage[] = [
            { inputTokens: 100, outputTokens: 50, totalTokens: 150, cost: 0.001 },
            { inputTokens: 200, outputTokens: 80, totalTokens: 280, cost: 0.002 },
        ];
        const result = sumTokenUsages(usages);
        expect(result!.inputTokens).toBe(300);
        expect(result!.outputTokens).toBe(130);
        expect(result!.totalTokens).toBe(430);
        expect(result!.cost).toBeCloseTo(0.003, 6);
    });

    it('ignores undefined entries', () => {
        const usages: (TokenUsage | undefined)[] = [
            { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            undefined,
            { inputTokens: 200, outputTokens: 80, totalTokens: 280 },
        ];
        const result = sumTokenUsages(usages);
        expect(result!.inputTokens).toBe(300);
        expect(result!.outputTokens).toBe(130);
    });

    it('returns undefined for an empty array', () => {
        expect(sumTokenUsages([])).toBeUndefined();
    });

    it('returns undefined when all entries are undefined', () => {
        expect(sumTokenUsages([undefined, undefined])).toBeUndefined();
    });

    it('omits cost when no entry has cost', () => {
        const usages: TokenUsage[] = [
            { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        ];
        const result = sumTokenUsages(usages);
        expect(result!.cost).toBeUndefined();
    });
});
