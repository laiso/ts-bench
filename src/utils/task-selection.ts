import type { CLIArgs } from '../config/types';

/**
 * Resolve which problem ids to run for benchmark, test-only, or print-instructions.
 * v1: --exercise (name | first N | comma list); default TOP_25 from CLI parse.
 * v2: --task | --tasks | --task-limit; default first task in dataset order.
 */
export function resolveBenchmarkSelection(args: CLIArgs, allIds: string[]): string[] {
    const dataset = args.dataset ?? 'v1';

    if (dataset === 'v1') {
        return resolveV1(args, allIds);
    }
    return resolveV2(args, allIds);
}

function resolveV1(args: CLIArgs, allIds: string[]): string[] {
    if (args.specificExercise) {
        if (!allIds.includes(args.specificExercise)) {
            console.error(`❌ Specified exercise '${args.specificExercise}' not found`);
            console.log('Use --list option to see available exercises');
            process.exit(1);
        }
        console.log(`🎯 Specified exercise: ${args.specificExercise}\n`);
        return [args.specificExercise];
    }
    if (args.exerciseList && args.exerciseList.length > 0) {
        const invalid = args.exerciseList.filter(id => !allIds.includes(id));
        if (invalid.length > 0) {
            console.error(`❌ Invalid exercise(s): ${invalid.join(', ')}`);
            console.log('Use --list option to see available exercises');
            process.exit(1);
        }
        console.log(`📋 Selected exercises: ${args.exerciseList.join(', ')} (${args.exerciseList.length})\n`);
        return args.exerciseList;
    }
    if (args.exerciseCount !== null && args.exerciseCount !== undefined) {
        const count = Math.min(args.exerciseCount, allIds.length);
        console.log(`🔢 Number of exercises: ${count} (out of ${allIds.length})\n`);
        return allIds.slice(0, count);
    }
    console.log(`📊 Found exercises: ${allIds.length} (testing only the first one)\n`);
    return allIds.slice(0, 1);
}

function resolveV2(args: CLIArgs, allIds: string[]): string[] {
    const hasTask = args.specificTask !== null && args.specificTask !== undefined;
    const hasTasks = args.taskList !== undefined && args.taskList.length > 0;
    const hasLimit = args.taskLimit !== null && args.taskLimit !== undefined && !Number.isNaN(args.taskLimit);

    const modes = (hasTask ? 1 : 0) + (hasTasks ? 1 : 0) + (hasLimit ? 1 : 0);
    if (modes > 1) {
        console.error('❌ Use only one of --task, --tasks, or --task-limit for v2');
        process.exit(1);
    }

    if (hasTask) {
        const id = args.specificTask!;
        if (!allIds.includes(id)) {
            console.error(`❌ Specified task '${id}' not found`);
            console.log('Use --list --dataset v2 to see available task ids');
            process.exit(1);
        }
        console.log(`🎯 Specified task: ${id}\n`);
        return [id];
    }
    if (hasTasks) {
        const invalid = args.taskList!.filter(tid => !allIds.includes(tid));
        if (invalid.length > 0) {
            console.error(`❌ Invalid task id(s): ${invalid.join(', ')}`);
            console.log('Use --list --dataset v2 to see available task ids');
            process.exit(1);
        }
        console.log(`📋 Selected tasks: ${args.taskList!.join(', ')} (${args.taskList!.length})\n`);
        return args.taskList!;
    }
    if (hasLimit) {
        const n = args.taskLimit!;
        if (n < 1) {
            console.error('❌ --task-limit must be at least 1');
            process.exit(1);
        }
        const count = Math.min(n, allIds.length);
        console.log(`🔢 Number of tasks: ${count} (out of ${allIds.length})\n`);
        return allIds.slice(0, count);
    }
    console.log(`📊 Found tasks: ${allIds.length} (running only the first one)\n`);
    return allIds.slice(0, 1);
}
