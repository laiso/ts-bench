import { describe, expect, test } from 'bun:test';
import { parseCliArgsFromArgv } from '../cli';

/** Parse argv slice (no node/script prefix) with a fake exit that throws. */
async function parseTestArgv(args: string[]) {
    return parseCliArgsFromArgv(['node', 'ts-bench', ...args], {
        exit: (code: number): never => {
            const err = new Error(`EXIT_${code}`);
            throw err;
        },
    });
}

describe('parseCliArgsFromArgv — v1 / v2 selection flags', () => {
    test('v2: --task keeps digit-only ids as task id (not exercise count)', async () => {
        const a = await parseTestArgv(['--dataset', 'v2', '--task', '6883']);
        expect(a.specificTask).toBe('6883');
        expect(a.taskLimit).toBeNull();
        expect(a.exerciseCount).toBeNull();
        expect(a.specificExercise).toBeNull();
        expect(a.useDocker).toBe(true);
    });

    test('v2: --tasks parses comma-separated ids', async () => {
        const a = await parseTestArgv(['--dataset', 'v2', '--tasks', '16912_4,6883']);
        expect(a.taskList).toEqual(['16912_4', '6883']);
        expect(a.specificTask).toBeNull();
    });

    test('v2: --task-limit', async () => {
        const a = await parseTestArgv(['--dataset', 'v2', '--task-limit', '5']);
        expect(a.taskLimit).toBe(5);
    });

    test('v2: rejects --exercise', async () => {
        await expect(
            parseTestArgv(['--dataset', 'v2', '--exercise', '16912_4'])
        ).rejects.toThrow('EXIT_1');
    });

    test('v1: rejects --task', async () => {
        await expect(parseTestArgv(['--task', '16912_4'])).rejects.toThrow('EXIT_1');
    });

    test('v1: rejects --tasks', async () => {
        await expect(parseTestArgv(['--tasks', 'a,b'])).rejects.toThrow('EXIT_1');
    });

    test('v1: rejects --task-limit', async () => {
        await expect(parseTestArgv(['--task-limit', '3'])).rejects.toThrow('EXIT_1');
    });

    test('v2: rejects mixing --task and --tasks', async () => {
        await expect(
            parseTestArgv(['--dataset', 'v2', '--task', 'a', '--tasks', 'b,c'])
        ).rejects.toThrow('EXIT_1');
    });

    test('v2: rejects non-numeric --task-limit', async () => {
        await expect(
            parseTestArgv(['--dataset', 'v2', '--task-limit', 'nope'])
        ).rejects.toThrow('EXIT_1');
    });

    test('v1: numeric --exercise is first-N count', async () => {
        const a = await parseTestArgv(['--exercise', '3']);
        expect(a.exerciseCount).toBe(3);
        expect(a.specificExercise).toBeNull();
    });

    test('v1: single slug --exercise', async () => {
        const a = await parseTestArgv(['--exercise', 'acronym']);
        expect(a.specificExercise).toBe('acronym');
        expect(a.exerciseCount).toBeNull();
    });
});
