import { describe, expect, it } from 'bun:test';
import { tryAnyEnv } from '../env';

describe('tryAnyEnv', () => {
    it('returns the first matching env var', () => {
        const prev = process.env.TEST_KEY_A;
        process.env.TEST_KEY_A = 'value-a';

        const result = tryAnyEnv(['TEST_KEY_A', 'TEST_KEY_B']);
        expect(result).toEqual({ key: 'TEST_KEY_A', value: 'value-a' });

        if (prev === undefined) delete process.env.TEST_KEY_A;
        else process.env.TEST_KEY_A = prev;
    });

    it('skips empty strings and returns the next matching var', () => {
        const prevA = process.env.TEST_KEY_A;
        const prevB = process.env.TEST_KEY_B;
        process.env.TEST_KEY_A = '';
        process.env.TEST_KEY_B = 'value-b';

        const result = tryAnyEnv(['TEST_KEY_A', 'TEST_KEY_B']);
        expect(result).toEqual({ key: 'TEST_KEY_B', value: 'value-b' });

        if (prevA === undefined) delete process.env.TEST_KEY_A;
        else process.env.TEST_KEY_A = prevA;
        if (prevB === undefined) delete process.env.TEST_KEY_B;
        else process.env.TEST_KEY_B = prevB;
    });

    it('returns null when no keys are set', () => {
        const prev = process.env.TEST_NONEXISTENT;
        delete process.env.TEST_NONEXISTENT;

        const result = tryAnyEnv(['TEST_NONEXISTENT']);
        expect(result).toBeNull();

        if (prev !== undefined) process.env.TEST_NONEXISTENT = prev;
    });

    it('returns null for whitespace-only values', () => {
        const prev = process.env.TEST_KEY_WS;
        process.env.TEST_KEY_WS = '   ';

        const result = tryAnyEnv(['TEST_KEY_WS']);
        expect(result).toBeNull();

        if (prev === undefined) delete process.env.TEST_KEY_WS;
        else process.env.TEST_KEY_WS = prev;
    });
});
