import { describe, expect, it } from 'bun:test';
import { AGENT_REGISTRY } from '../registry';
import { GenericAgentBuilder } from '../builders/generic';
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

    const cases: { name: string; builder: GenericAgentBuilder; env: [string, string][] }[] = [
        { name: 'claude', builder: new GenericAgentBuilder(baseV2, AGENT_REGISTRY.claude), env: [['ANTHROPIC_API_KEY', 'x']] },
        { name: 'cursor', builder: new GenericAgentBuilder(baseV2, AGENT_REGISTRY.cursor), env: [['CURSOR_API_KEY', 'x']] },
        { name: 'aider', builder: new GenericAgentBuilder(baseV2, AGENT_REGISTRY.aider), env: [['OPENAI_API_KEY', 'x']] },
        {
            name: 'codex',
            builder: new GenericAgentBuilder({ ...baseV2, provider: 'openai' }, AGENT_REGISTRY.codex),
            env: [['OPENAI_API_KEY', 'x']]
        },
        { name: 'gemini', builder: new GenericAgentBuilder(baseV2, AGENT_REGISTRY.gemini), env: [['GEMINI_API_KEY', 'x']] },
        { name: 'goose', builder: new GenericAgentBuilder({ ...baseV2, provider: 'anthropic' }, AGENT_REGISTRY.goose), env: [['ANTHROPIC_API_KEY', 'x']] },
        { name: 'opencode', builder: new GenericAgentBuilder({ ...baseV2, provider: 'openai' }, AGENT_REGISTRY.opencode), env: [['OPENAI_API_KEY', 'x']] },
        {
            name: 'qwen',
            builder: new GenericAgentBuilder({ ...baseV2, provider: 'dashscope' }, AGENT_REGISTRY.qwen),
            env: [['DASHSCOPE_API_KEY', 'x']]
        },
        { name: 'copilot', builder: new GenericAgentBuilder(baseV2, AGENT_REGISTRY.copilot), env: [['COPILOT_GITHUB_TOKEN', 'x']] },
        { name: 'vibe', builder: new GenericAgentBuilder(baseV2, AGENT_REGISTRY.vibe), env: [['MISTRAL_API_KEY', 'x']] },
        { name: 'kimi', builder: new GenericAgentBuilder({ ...baseV2, provider: 'moonshot' }, AGENT_REGISTRY.kimi), env: [['KIMI_API_KEY', 'x']] }
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
