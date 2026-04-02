import { describe, expect, it } from 'bun:test';
import { ClaudeAgentBuilder } from '../claude';
import { PROMPT_MOUNT_CONTAINER, PROMPT_PLACEHOLDER } from '../../prompt-files';

describe('ClaudeAgentBuilder', () => {
    const config = {
        model: 'claude-3-sonnet',
        containerName: 'test-container',
        agentScriptPath: '/tmp/scripts/run-agent.sh'
    };

    it('buildCommand should return core args and env', async () => {
        const prev = process.env.ANTHROPIC_API_KEY;
        process.env.ANTHROPIC_API_KEY = 'test-key';

        const builder = new ClaudeAgentBuilder(config);
        const cmd = await builder.buildCommand('Test instructions');

        expect(cmd.args.slice(0, 3)).toEqual(['bash', '/tmp/scripts/run-agent.sh', 'claude']);
        expect(cmd.args).toContain('--model');
        expect(cmd.args).toContain('claude-3-sonnet');
        expect(cmd.args).toContain('-p');
        expect(cmd.env?.ANTHROPIC_API_KEY).toBe('test-key');

        process.env.ANTHROPIC_API_KEY = prev;
    });

    it('buildCommand should map OpenRouter env vars for Claude', async () => {
        const prevOpenRouterKey = process.env.OPENROUTER_API_KEY;
        const prevAnthropicKey = process.env.ANTHROPIC_API_KEY;
        const prevAnthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;

        process.env.OPENROUTER_API_KEY = 'openrouter-key';
        process.env.ANTHROPIC_API_KEY = 'should-be-ignored';
        process.env.ANTHROPIC_BASE_URL = 'https://example.com/anthropic';

        const builder = new ClaudeAgentBuilder({ ...config, provider: 'openrouter' });
        const cmd = await builder.buildCommand('Test instructions');

        expect(cmd.env?.ANTHROPIC_API_KEY).toBe('');
        expect(cmd.env?.ANTHROPIC_AUTH_TOKEN).toBe('openrouter-key');
        expect(cmd.env?.ANTHROPIC_BASE_URL).toBe('https://example.com/anthropic');

        process.env.OPENROUTER_API_KEY = prevOpenRouterKey;
        process.env.ANTHROPIC_API_KEY = prevAnthropicKey;
        process.env.ANTHROPIC_BASE_URL = prevAnthropicBaseUrl;
    });

    it('v2 Docker uses prompt file mount instead of inline issue body', async () => {
        const prev = process.env.ANTHROPIC_API_KEY;
        process.env.ANTHROPIC_API_KEY = 'test-key';

        const builder = new ClaudeAgentBuilder({
            ...config,
            dataset: 'v2',
            useDocker: true,
            exercise: '16912_4'
        });
        const longBody = '## Action Performed:\n\n1. Step (with parens)\n';
        const cmd = await builder.buildCommand(longBody);

        expect(cmd.promptFileHostPath).toMatch(/\.agent-prompts\/16912_4\.txt$/);
        expect(cmd.promptFileContainerPath).toBe(PROMPT_MOUNT_CONTAINER);
        const pIdx = cmd.args.indexOf('-p');
        expect(pIdx).not.toBe(-1);
        expect(cmd.args[pIdx + 1]).toBe(PROMPT_PLACEHOLDER);

        process.env.ANTHROPIC_API_KEY = prev;
    });

    it('keeps skip-permissions enabled for Docker runs', async () => {
        const prev = process.env.ANTHROPIC_API_KEY;
        process.env.ANTHROPIC_API_KEY = 'test-key';

        const builder = new ClaudeAgentBuilder({
            ...config,
            useDocker: true
        });
        const cmd = await builder.buildCommand('Test instructions');

        expect(cmd.args).toContain('--dangerously-skip-permissions');

        process.env.ANTHROPIC_API_KEY = prev;
    });

    it('sets IS_SANDBOX=1 for Docker runs to allow skip-permissions as root', async () => {
        const prev = process.env.ANTHROPIC_API_KEY;
        process.env.ANTHROPIC_API_KEY = 'test-key';

        const builder = new ClaudeAgentBuilder({
            ...config,
            useDocker: true
        });
        const cmd = await builder.buildCommand('Test instructions');

        expect(cmd.env?.IS_SANDBOX).toBe('1');

        process.env.ANTHROPIC_API_KEY = prev;
    });

    it('does not set IS_SANDBOX when not using Docker', async () => {
        const prev = process.env.ANTHROPIC_API_KEY;
        process.env.ANTHROPIC_API_KEY = 'test-key';

        const builder = new ClaudeAgentBuilder(config);
        const cmd = await builder.buildCommand('Test instructions');

        expect(cmd.env?.IS_SANDBOX).toBeUndefined();

        process.env.ANTHROPIC_API_KEY = prev;
    });
});
