import { describe, expect, test } from 'bun:test';
import { resolveBenchmarkSelection } from '../task-selection';
import type { CLIArgs } from '../../config/types';

const throwExit = (code: number): never => {
    throw new Error(`EXIT_${code}`);
};

function baseArgs(overrides: Partial<CLIArgs>): CLIArgs {
    return {
        model: 'sonnet',
        agent: 'claude',
        provider: 'anthropic',
        verbose: false,
        specificExercise: null,
        exerciseCount: null,
        exerciseList: undefined,
        specificTask: null,
        taskList: undefined,
        taskLimit: null,
        listExercises: false,
        dataset: 'v1',
        ...overrides,
    } as CLIArgs;
}

describe('resolveBenchmarkSelection', () => {
    const v1Ids = ['a', 'b', 'c'];

    test('v1: single exercise', () => {
        const ids = resolveBenchmarkSelection(
            baseArgs({ specificExercise: 'b', exerciseList: undefined, exerciseCount: null }),
            v1Ids,
            { exit: throwExit }
        );
        expect(ids).toEqual(['b']);
    });

    test('v1: first N', () => {
        const ids = resolveBenchmarkSelection(
            baseArgs({ exerciseCount: 2, exerciseList: undefined }),
            v1Ids,
            { exit: throwExit }
        );
        expect(ids).toEqual(['a', 'b']);
    });

    test('v2: single task (digit id)', () => {
        const ids = resolveBenchmarkSelection(
            baseArgs({
                dataset: 'v2',
                specificTask: '6883',
            }),
            ['6883', '16912_4'],
            { exit: throwExit }
        );
        expect(ids).toEqual(['6883']);
    });

    test('v2: task limit', () => {
        const ids = resolveBenchmarkSelection(
            baseArgs({
                dataset: 'v2',
                taskLimit: 2,
            }),
            ['x', 'y', 'z'],
            { exit: throwExit }
        );
        expect(ids).toEqual(['x', 'y']);
    });

    test('v2: multiple tasks via taskList', () => {
        const ids = resolveBenchmarkSelection(
            baseArgs({
                dataset: 'v2',
                taskList: ['16912_4', '6883'],
            }),
            ['6883', '16912_4'],
            { exit: throwExit }
        );
        expect(ids).toEqual(['16912_4', '6883']);
    });

    test('v2: default is first task only when no task flags', () => {
        const ids = resolveBenchmarkSelection(
            baseArgs({ dataset: 'v2' }),
            ['first', 'second'],
            { exit: throwExit }
        );
        expect(ids).toEqual(['first']);
    });

    test('v2: invalid task id exits', () => {
        expect(() =>
            resolveBenchmarkSelection(
                baseArgs({ dataset: 'v2', specificTask: 'missing' }),
                ['ok'],
                { exit: throwExit }
            )
        ).toThrow('EXIT_1');
    });

    test('v2: conflicting selection modes exits', () => {
        expect(() =>
            resolveBenchmarkSelection(
                baseArgs({
                    dataset: 'v2',
                    specificTask: 'a',
                    taskLimit: 2,
                }),
                ['a', 'b'],
                { exit: throwExit }
            )
        ).toThrow('EXIT_1');
    });
});
