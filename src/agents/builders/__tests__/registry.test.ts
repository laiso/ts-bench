import { describe, expect, it } from 'bun:test';
import { AGENT_REGISTRY, AGENT_DEFAULT_PROVIDER } from '../../registry';
import type { AgentType } from '../../registry';
import { GenericAgentBuilder } from '../generic';

const SCRIPT_PATH = '/tmp/scripts/run-agent.sh';
const BASE_CONFIG = {
    containerName: 'test-container',
    agentScriptPath: SCRIPT_PATH,
    model: 'test-model'
};

describe('AGENT_REGISTRY', () => {
    it('has entries for all known agents', () => {
        const agents: AgentType[] = ['claude', 'goose', 'aider', 'codex', 'copilot', 'gemini', 'opencode', 'qwen', 'cursor', 'vibe', 'kimi'];
        for (const agent of agents) {
            expect(AGENT_REGISTRY[agent]).toBeDefined();
        }
    });

    it('each definition has required fields', () => {
        for (const [name, def] of Object.entries(AGENT_REGISTRY)) {
            expect(def.defaultProvider, `${name}.defaultProvider`).toBeTruthy();
            expect(def.install, `${name}.install`).toBeDefined();
            expect(typeof def.getEnv, `${name}.getEnv`).toBe('function');
            expect(typeof def.buildArgs, `${name}.buildArgs`).toBe('function');
        }
    });

    it('AGENT_DEFAULT_PROVIDER matches registry defaultProvider', () => {
        for (const [name, def] of Object.entries(AGENT_REGISTRY)) {
            const agent = name as AgentType;
            expect(AGENT_DEFAULT_PROVIDER[agent]).toBe(def.defaultProvider);
        }
    });
});

describe('GenericAgentBuilder via registry', () => {
    it('gemini: buildArgs starts with bash + script + gemini', async () => {
        const origKey = process.env.GEMINI_API_KEY;
        process.env.GEMINI_API_KEY = 'test-gemini-key';
        try {
            const builder = new GenericAgentBuilder(BASE_CONFIG, AGENT_REGISTRY.gemini);
            const command = await builder.buildCommand('instructions');
            expect(command.args[0]).toBe('bash');
            expect(command.args[1]).toBe(SCRIPT_PATH);
            expect(command.args[2]).toBe('gemini');
            expect(command.env?.GEMINI_API_KEY).toBe('test-gemini-key');
        } finally {
            if (origKey === undefined) delete process.env.GEMINI_API_KEY;
            else process.env.GEMINI_API_KEY = origKey;
        }
    });

    it('copilot: sets COPILOT_ALLOW_ALL and COPILOT_MODEL', async () => {
        const builder = new GenericAgentBuilder(BASE_CONFIG, AGENT_REGISTRY.copilot);
        const command = await builder.buildCommand('instructions');
        expect(command.args[2]).toBe('copilot');
        expect(command.env?.COPILOT_ALLOW_ALL).toBe('1');
        expect(command.env?.COPILOT_MODEL).toBe('test-model');
    });

    it('vibe: requires MISTRAL_API_KEY', async () => {
        const origKey = process.env.MISTRAL_API_KEY;
        process.env.MISTRAL_API_KEY = 'test-mistral-key';
        try {
            const builder = new GenericAgentBuilder(BASE_CONFIG, AGENT_REGISTRY.vibe);
            const command = await builder.buildCommand('instructions');
            expect(command.args[2]).toBe('vibe');
            expect(command.env?.MISTRAL_API_KEY).toBe('test-mistral-key');
        } finally {
            if (origKey === undefined) delete process.env.MISTRAL_API_KEY;
            else process.env.MISTRAL_API_KEY = origKey;
        }
    });

    it('codex: includes model_reasoning_effort=high', async () => {
        const origKey = process.env.OPENAI_API_KEY;
        process.env.OPENAI_API_KEY = 'test-oa-key';
        try {
            const builder = new GenericAgentBuilder(BASE_CONFIG, AGENT_REGISTRY.codex);
            const command = await builder.buildCommand('instructions');
            expect(command.args[2]).toBe('codex');
            expect(command.args).toContain('model_reasoning_effort=high');
            expect(command.args).toContain('--yolo');
        } finally {
            if (origKey === undefined) delete process.env.OPENAI_API_KEY;
            else process.env.OPENAI_API_KEY = origKey;
        }
    });

    it('aider: uses fileList when provided', async () => {
        const origKey = process.env.OPENAI_API_KEY;
        process.env.OPENAI_API_KEY = 'test-oa-key';
        try {
            const builder = new GenericAgentBuilder(BASE_CONFIG, AGENT_REGISTRY.aider);
            const command = await builder.buildCommand('instructions', {
                sourceFiles: ['app.ts'],
                testFiles: ['app.test.ts']
            });
            expect(command.args[2]).toBe('aider');
            expect(command.args).toContain('app.ts');
            expect(command.args).toContain('app.test.ts');
        } finally {
            if (origKey === undefined) delete process.env.OPENAI_API_KEY;
            else process.env.OPENAI_API_KEY = origKey;
        }
    });
});
