import { describe, expect, it } from 'bun:test';
import { QwenAgentBuilder } from '../qwen';

const SCRIPT_PATH = '/tmp/scripts/run-agent.sh';

const createConfig = (provider?: string) => ({
    containerName: 'test-container',
    agentScriptPath: SCRIPT_PATH,
    model: 'test-model',
    provider: provider as any
});

describe('QwenAgentBuilder', () => {
    it('uses run-agent script and sets openai env', async () => {
        const previousKey = process.env.OPENAI_API_KEY;
        process.env.OPENAI_API_KEY = 'openai-test-key';

        const builder = new QwenAgentBuilder(createConfig('openai'));
        const command = await builder.buildCommand('instructions');

        expect(command.args.slice(0, 3)).toEqual(['bash', SCRIPT_PATH, 'qwen']);
        expect(command.env).toEqual({
            OPENAI_BASE_URL: 'https://api.openai.com/v1',
            OPENAI_API_KEY: 'openai-test-key',
            OPENAI_MODEL: 'test-model',
            GEMINI_API_KEY: '',
            GOOGLE_API_KEY: '',
            GOOGLE_GENAI_USE_GCA: '',
            GOOGLE_GENAI_USE_VERTEXAI: ''
        });

        if (previousKey === undefined) {
            delete process.env.OPENAI_API_KEY;
        } else {
            process.env.OPENAI_API_KEY = previousKey;
        }
    });

    it('sets openrouter specific base url', async () => {
        const previousKey = process.env.OPENROUTER_API_KEY;
        process.env.OPENROUTER_API_KEY = 'router-key';

        const builder = new QwenAgentBuilder(createConfig('openrouter'));
        const command = await builder.buildCommand('instructions');

        expect(command.env).toEqual({
            OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
            OPENAI_API_KEY: 'router-key',
            OPENAI_MODEL: 'test-model',
            GEMINI_API_KEY: '',
            GOOGLE_API_KEY: '',
            GOOGLE_GENAI_USE_GCA: '',
            GOOGLE_GENAI_USE_VERTEXAI: ''
        });

        if (previousKey === undefined) {
            delete process.env.OPENROUTER_API_KEY;
        } else {
            process.env.OPENROUTER_API_KEY = previousKey;
        }
    });
});
