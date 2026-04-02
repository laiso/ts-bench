import { describe, expect, it } from 'bun:test';
import { buildTestCommand, getExerciseTimeout } from '../test-commands';

describe('buildTestCommand', () => {
    it('keeps Claude-compatible v2 Docker test command on the supported run.sh path', () => {
        const command = buildTestCommand('v2', true);

        expect(command).toContain('/app/tests/run.sh');
        expect(command).toContain('unset RUNTIME_SETUP');
        expect(command).toContain('/app/tests/run_tests.yml');
        expect(command).not.toContain('/patches/v2-test-runner.sh');
    });

    it('uses native v2 command outside Docker', () => {
        expect(buildTestCommand('v2', false)).toBe('npm rebuild canvas && npm test -- -o');
    });

    it('uses Exercism command for v1', () => {
        expect(buildTestCommand('v1', false)).toBe('corepack yarn && corepack yarn test');
    });
});

describe('getExerciseTimeout', () => {
    it('extends v2 timeout to at least one hour', () => {
        expect(getExerciseTimeout('v2', 300)).toBe(3600);
    });

    it('preserves higher explicit v2 timeout', () => {
        expect(getExerciseTimeout('v2', 7200)).toBe(7200);
    });

    it('keeps default timeout for v1', () => {
        expect(getExerciseTimeout('v1', undefined)).toBe(300);
    });
});
