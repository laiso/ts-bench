import { describe, expect, it } from 'bun:test';
import { GooseAgentBuilder } from '../goose';

const SCRIPT_PATH = '/tmp/scripts/run-agent.sh';

const createConfig = (provider?: string) => ({
    containerName: 'test-container',
    agentScriptPath: SCRIPT_PATH,
    model: 'test-model',
    provider
});

describe('GooseAgentBuilder', () => {
    it('sets OpenRouter specific environment variables', async () => {
        const previousKey = process.env.OPENROUTER_API_KEY;
        process.env.OPENROUTER_API_KEY = 'router-key';

        const builder = new GooseAgentBuilder(createConfig('openrouter'));
        const command = await builder.buildCommand('instructions');

        expect(command.args.slice(0, 4)).toEqual(['bash', SCRIPT_PATH, 'goose', 'run']);
        expect(command.env).toEqual({
            GOOSE_MODEL: 'test-model',
            GOOSE_PROVIDER: 'openrouter',
            GOOSE_DISABLE_KEYRING: '1',
            OPENROUTER_API_KEY: 'router-key'
        });

        if (previousKey === undefined) {
            delete process.env.OPENROUTER_API_KEY;
        } else {
            process.env.OPENROUTER_API_KEY = previousKey;
        }
    });
});
