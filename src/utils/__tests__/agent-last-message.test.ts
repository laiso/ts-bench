import { describe, expect, test } from 'bun:test';
import {
    extractLastAgentMessageFromStdout,
    extractLastAssistantFromClaudeJsonl,
} from '../agent-last-message';

describe('extractLastAgentMessageFromStdout', () => {
    test('parses claude --print result JSON', () => {
        const out = JSON.stringify({
            type: 'result',
            subtype: 'success',
            result: 'Done.\nAll tests pass.',
        });
        expect(extractLastAgentMessageFromStdout(out)).toBe('Done.\nAll tests pass.');
    });

    test('uses last JSON line in multi-line stdout', () => {
        const out = `noise\n${JSON.stringify({ type: 'result', result: 'final reply' })}`;
        expect(extractLastAgentMessageFromStdout(out)).toBe('final reply');
    });

    test('returns null when no JSON result', () => {
        expect(extractLastAgentMessageFromStdout('plain text only')).toBeNull();
    });
});

describe('extractLastAssistantFromClaudeJsonl', () => {
    test('returns last assistant text block', () => {
        const jsonl = [
            JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'hi' }] } }),
            JSON.stringify({
                type: 'assistant',
                message: {
                    content: [{ type: 'text', text: 'First answer.' }],
                },
            }),
            JSON.stringify({
                type: 'assistant',
                message: {
                    content: [{ type: 'text', text: 'Last answer.' }],
                },
            }),
        ].join('\n');
        expect(extractLastAssistantFromClaudeJsonl(jsonl)).toBe('Last answer.');
    });

    test('returns null for empty or invalid lines', () => {
        expect(extractLastAssistantFromClaudeJsonl('')).toBeNull();
        expect(extractLastAssistantFromClaudeJsonl('not json')).toBeNull();
    });
});
