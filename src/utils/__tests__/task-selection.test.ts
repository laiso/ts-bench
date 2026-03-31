import { describe, expect, test } from 'bun:test';
import { resolveBenchmarkSelection } from '../task-selection';
import type { CLIArgs } from '../../config/types';

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
            v1Ids
        );
        expect(ids).toEqual(['b']);
    });

    test('v1: first N', () => {
        const ids = resolveBenchmarkSelection(
            baseArgs({ exerciseCount: 2, exerciseList: undefined }),
            v1Ids
        );
        expect(ids).toEqual(['a', 'b']);
    });

    test('v2: single task (digit id)', () => {
        const ids = resolveBenchmarkSelection(
            baseArgs({
                dataset: 'v2',
                specificTask: '6883',
            }),
            ['6883', '16912_4']
        );
        expect(ids).toEqual(['6883']);
    });

    test('v2: task limit', () => {
        const ids = resolveBenchmarkSelection(
            baseArgs({
                dataset: 'v2',
                taskLimit: 2,
            }),
            ['x', 'y', 'z']
        );
        expect(ids).toEqual(['x', 'y']);
    });
});
