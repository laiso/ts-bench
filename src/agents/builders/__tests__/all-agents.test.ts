import { describe, expect, it } from 'bun:test';
import { AiderAgentBuilder } from '../aider';
import { CodexAgentBuilder } from '../codex';
import { GeminiAgentBuilder } from '../gemini';
import { GooseAgentBuilder } from '../goose';
import { CursorAgentBuilder } from '../cursor';
import { CopilotAgentBuilder } from '../copilot';
import { KimiAgentBuilder } from '../kimi';
import type { AgentBuilder } from '../../types';

const SCRIPT_PATH = '/tmp/scripts/run-agent.sh';
const BASE_CONFIG = {
    containerName: 'test-container',
    agentScriptPath: SCRIPT_PATH,
    model: 'test-model'
};

describe('Agent builders invoke run-agent script', () => {
    type TestCase = {
        cli: string;
        builder: AgentBuilder;
        env: ReadonlyArray<readonly [string, string]>;
        fileList?: { sourceFiles: string[]; testFiles: string[] };
        assertCommand: (command: { args: string[] }) => void;
    };

    const assertRunAgent = (command: { args: string[] }, expectedCli: string) => {
        expect(command.args[0]).toBe('bash');
        expect(command.args[1]).toBe(SCRIPT_PATH);
        expect(command.args[2]).toBe(expectedCli);
    };

    const cases: TestCase[] = [
        {
            cli: 'aider',
            builder: new AiderAgentBuilder(BASE_CONFIG),
            env: [['OPENAI_API_KEY', 'test-oa-key'] as const],
            fileList: { sourceFiles: ['app.ts'], testFiles: ['app.test.ts'] },
            assertCommand: (command) => assertRunAgent(command, 'aider')
        },
        {
            cli: 'codex',
            builder: new CodexAgentBuilder(BASE_CONFIG),
            env: [['OPENAI_API_KEY', 'test-oa-key'] as const],
            assertCommand: (command) => {
                assertRunAgent(command, 'codex');
                expect(command.args).toContain('-c');
                expect(command.args).toContain('model_reasoning_effort=high');
                expect(command.args).toContain('--yolo');
                expect(command.args).toContain('--skip-git-repo-check');
                expect(command.args).toContain('-m');
                expect(command.args.at(-1)).toBe('instructions');
            }
        },
        {
            cli: 'gemini',
            builder: new GeminiAgentBuilder(BASE_CONFIG),
            env: [['GEMINI_API_KEY', 'test-gemini-key'] as const],
            assertCommand: (command) => assertRunAgent(command, 'gemini')
        },
        {
            cli: 'goose',
            builder: new GooseAgentBuilder(BASE_CONFIG),
            env: [['ANTHROPIC_API_KEY', 'test-anthropic-key'] as const],
            assertCommand: (command) => assertRunAgent(command, 'goose')
        },
        {
            cli: 'cursor-agent',
            builder: new CursorAgentBuilder(BASE_CONFIG),
            env: [['CURSOR_API_KEY', 'test-cursor-key'] as const],
            assertCommand: (command) => assertRunAgent(command, 'cursor-agent')
        },
        {
            cli: 'copilot',
            builder: new CopilotAgentBuilder(BASE_CONFIG),
            env: [] as readonly (readonly [string, string])[],
            assertCommand: (command) => {
                assertRunAgent(command, 'copilot');
                expect(command.args).toContain('--allow-all-tools');
                expect(command.args).toContain('--add-dir');
                expect(command.args).toContain('-p');
                expect(command.env?.COPILOT_ALLOW_ALL).toBe('1');
                expect(command.env?.COPILOT_MODEL).toBe('test-model');
            }
        },
        {
            cli: 'kimi',
            builder: new KimiAgentBuilder(BASE_CONFIG),
            env: [['KIMI_API_KEY', 'test-kimi-key'] as const],
            assertCommand: (command) => {
                assertRunAgent(command, 'kimi');
                expect(command.args).toContain('--print');
                expect(command.args).toContain('--output-format');
                expect(command.args).toContain('text');
                expect(command.args).toContain('--model');
                expect(command.args).toContain('test-model');
                expect(command.args).toContain('-p');

                const configIndex = command.args.indexOf('--config');
                expect(configIndex).toBeGreaterThan(-1);
                const configArg = command.args[configIndex + 1];
                expect(configArg).toBeDefined();

                const parsed = JSON.parse(configArg as string);
                expect(parsed.default_model).toBe('test-model');
                expect(parsed.providers.moonshot.type).toBe('kimi');
                expect(parsed.providers.moonshot.base_url).toBe('https://api.moonshot.ai/v1');
                expect(parsed.models['test-model'].provider).toBe('moonshot');
                expect(parsed.models['test-model'].model).toBe('test-model');
                expect(parsed.models['test-model'].max_context_size).toBe(262144);
            }
        }
    ] as const;

    for (const { cli, builder, env, fileList, assertCommand } of cases) {
        it(`ensures ${cli} passes through run-agent`, async () => {
            const originals: Record<string, string | undefined> = {};
            for (const [key, value] of env) {
                originals[key] = process.env[key];
                process.env[key] = value;
            }

            try {
                const command = await builder.buildCommand('instructions', fileList as any);
                assertCommand(command);
            } finally {
                for (const [key] of env) {
                    const previous = originals[key];
                    if (previous === undefined) {
                        delete process.env[key];
                    } else {
                        process.env[key] = previous;
                    }
                }
            }
        });
    }
});
