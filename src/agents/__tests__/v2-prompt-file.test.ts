import { describe, expect, it } from 'bun:test';
import { ClaudeAgentBuilder } from '../builders/claude';
import { CursorAgentBuilder } from '../builders/cursor';
import { AiderAgentBuilder } from '../builders/aider';
import { CodexAgentBuilder } from '../builders/codex';
import { GeminiAgentBuilder } from '../builders/gemini';
import { GooseAgentBuilder } from '../builders/goose';
import { OpenCodeAgentBuilder } from '../builders/opencode';
import { QwenAgentBuilder } from '../builders/qwen';
import { CopilotAgentBuilder } from '../builders/copilot';
import { VibeAgentBuilder } from '../builders/vibe';
import { KimiAgentBuilder } from '../builders/kimi';
import type { AgentBuilder } from '../types';
import { PROMPT_MOUNT_CONTAINER, PROMPT_PLACEHOLDER } from '../prompt-files';

const V2_EXERCISE = '16912_4';
const SCRIPT = '/tmp/scripts/run-agent.sh';

const baseV2 = {
    containerName: 'c',
    agentScriptPath: SCRIPT,
    model: 'm',
    dataset: 'v2' as const,
    useDocker: true,
    exercise: V2_EXERCISE
};

describe('v2 Docker: all agents use mounted prompt file', () => {
    const setKeys = (pairs: [string, string][]) => {
        const prev: Record<string, string | undefined> = {};
        for (const [k, v] of pairs) {
            prev[k] = process.env[k];
            process.env[k] = v;
        }
        return () => {
            for (const [k] of pairs) {
                const o = prev[k];
                if (o === undefined) delete process.env[k];
                else process.env[k] = o;
            }
        };
    };

    const cases: { name: string; builder: AgentBuilder; env: [string, string][] }[] = [
        { name: 'claude', builder: new ClaudeAgentBuilder(baseV2), env: [['ANTHROPIC_API_KEY', 'x']] },
        { name: 'cursor', builder: new CursorAgentBuilder(baseV2), env: [['CURSOR_API_KEY', 'x']] },
        { name: 'aider', builder: new AiderAgentBuilder(baseV2), env: [['OPENAI_API_KEY', 'x']] },
        {
            name: 'codex',
            builder: new CodexAgentBuilder({ ...baseV2, provider: 'openai' }),
            env: [['OPENAI_API_KEY', 'x']]
        },
        { name: 'gemini', builder: new GeminiAgentBuilder(baseV2), env: [['GEMINI_API_KEY', 'x']] },
        { name: 'goose', builder: new GooseAgentBuilder({ ...baseV2, provider: 'anthropic' }), env: [['ANTHROPIC_API_KEY', 'x']] },
        { name: 'opencode', builder: new OpenCodeAgentBuilder({ ...baseV2, provider: 'openai' }), env: [['OPENAI_API_KEY', 'x']] },
        {
            name: 'qwen',
            builder: new QwenAgentBuilder({ ...baseV2, provider: 'dashscope' }),
            env: [['DASHSCOPE_API_KEY', 'x']]
        },
        { name: 'copilot', builder: new CopilotAgentBuilder(baseV2), env: [] },
        { name: 'vibe', builder: new VibeAgentBuilder(baseV2), env: [['MISTRAL_API_KEY', 'x']] },
        { name: 'kimi', builder: new KimiAgentBuilder({ ...baseV2, provider: 'moonshot' }), env: [['KIMI_API_KEY', 'x']] }
    ];

    const body = '## Step (parens)\n`code` --- "quotes"';

    for (const { name, builder, env } of cases) {
        it(name, async () => {
            const restore = setKeys(env);
            try {
                const cmd = await builder.buildCommand(body);
                expect(cmd.promptFileHostPath).toMatch(new RegExp(`\\.agent-prompts/${V2_EXERCISE}\\.txt$`));
                expect(cmd.promptFileContainerPath).toBe(PROMPT_MOUNT_CONTAINER);
                const joined = cmd.args.join('\n');
                expect(joined).toContain(PROMPT_PLACEHOLDER);
                expect(joined).not.toContain('## Step');
            } finally {
                restore();
            }
        });
    }
});
