import { describe, it, expect } from 'bun:test';
import { agentDisplayName } from '../format.ts';

describe('agentDisplayName', () => {
    it('returns formal names for known slugs', () => {
        expect(agentDisplayName('claude')).toBe('Claude Code');
        expect(agentDisplayName('codex')).toBe('Codex CLI');
        expect(agentDisplayName('goose')).toBe('Goose CLI');
        expect(agentDisplayName('aider')).toBe('Aider');
        expect(agentDisplayName('gemini')).toBe('Gemini CLI');
        expect(agentDisplayName('qwen')).toBe('Qwen Code');
        expect(agentDisplayName('cursor')).toBe('Cursor Agent');
        expect(agentDisplayName('copilot')).toBe('GitHub Copilot CLI');
        expect(agentDisplayName('kimi')).toBe('Kimi Code CLI');
        expect(agentDisplayName('cline')).toBe('Cline');
        expect(agentDisplayName('windsurf')).toBe('Windsurf');
        expect(agentDisplayName('devin')).toBe('Devin');
        expect(agentDisplayName('opencode')).toBe('OpenCode');
    });

    it('is case-insensitive for known slugs', () => {
        expect(agentDisplayName('Claude')).toBe('Claude Code');
        expect(agentDisplayName('CODEX')).toBe('Codex CLI');
    });

    it('capitalizes unknown slugs', () => {
        expect(agentDisplayName('unknownagent')).toBe('Unknownagent');
        expect(agentDisplayName('MYAGENT')).toBe('Myagent');
    });
});
