import { describe, expect, it } from 'bun:test';
import { createEnvironmentArgs } from '../docker';

describe('createEnvironmentArgs', () => {
    it('keeps empty ANTHROPIC_API_KEY to disable Anthropic fallback for OpenRouter', () => {
        const args = createEnvironmentArgs({
            ANTHROPIC_API_KEY: '',
            ANTHROPIC_AUTH_TOKEN: 'router-key',
            ANTHROPIC_BASE_URL: 'https://openrouter.ai/api'
        });

        expect(args).toEqual([
            '-e', 'ANTHROPIC_API_KEY=',
            '-e', 'ANTHROPIC_AUTH_TOKEN=router-key',
            '-e', 'ANTHROPIC_BASE_URL=https://openrouter.ai/api'
        ]);
    });

    it('still drops unrelated empty environment values', () => {
        const args = createEnvironmentArgs({
            EMPTY_VALUE: '',
            NON_EMPTY: 'set'
        });

        expect(args).toEqual([
            '-e', 'NON_EMPTY=set'
        ]);
    });
});
