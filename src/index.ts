#!/usr/bin/env bun

import { CLAUDE_CODE_CONTAINER, EXERCISM_PRACTICE_PATH, HEADER_INSTRUCTION } from './config/constants';
import { BunCommandExecutor } from './utils/shell';
import { ConsoleLogger } from './utils/logger';
import { parseCommandLineArgs, printHelp } from './utils/cli';
import { ExerciseReader } from './exercises/reader';
import { ExerciseResetter } from './exercises/reset';
import { AgentRunner } from './runners/agent';
import { TestRunner } from './runners/test';
import { TestOnlyRunner } from './runners/test-only';
import { ExerciseRunner } from './runners/exercise';
import { BenchmarkRunner } from './benchmark/runner';
import { BenchmarkReporter } from './benchmark/reporter';
import type { CLIArgs, TestOnlyResult } from './config/types';

async function main(): Promise<void> {
    // Display help if requested
    if (process.argv.includes('--help')) {
        printHelp();
        return;
    }

    const args = await parseCommandLineArgs();
    
    // Get exercism path from CLI options or default value
    const exercismPath = args.exercismPath || EXERCISM_PRACTICE_PATH;
    
    // Initialize dependencies
    const executor = new BunCommandExecutor();
    const logger = new ConsoleLogger();
    const exerciseReader = new ExerciseReader(exercismPath);
    const exerciseResetter = new ExerciseResetter();
    
    if (args.testOnly) {
        // Test-only mode: run tests against current code
        const testOnlyRunner = new TestOnlyRunner(
            executor,
            logger,
            exercismPath
        );
        
        await runTestOnlyMode(args, exerciseReader, testOnlyRunner);
    } else if (args.printInstructions) {
        // Print instructions mode: show instructions that would be sent to agent
        await runPrintInstructionsMode(args, exerciseReader);
    } else {
        // Normal mode: full benchmark with agent execution
        const agentRunner = new AgentRunner(
            executor,
            exerciseReader,
            logger,
            CLAUDE_CODE_CONTAINER,
            HEADER_INSTRUCTION,
            args.customInstruction
        );
        
        const testRunner = new TestRunner(
            executor,
            logger,
            CLAUDE_CODE_CONTAINER
        );
        
        const exerciseRunner = new ExerciseRunner(
            agentRunner,
            testRunner,
            exerciseResetter,
            logger,
            exercismPath
        );
        
        // Execute benchmark
        const reporter = new BenchmarkReporter();
        const benchmarkRunner = new BenchmarkRunner(
            exerciseReader,
            exerciseRunner,
            reporter
        );
        
        await benchmarkRunner.run(args);
    }
}

async function runTestOnlyMode(
    args: CLIArgs, 
    exerciseReader: ExerciseReader, 
    testOnlyRunner: TestOnlyRunner
): Promise<void> {
    const testCommand = 'corepack yarn && corepack yarn test';
    const config = {
        testCommand,
        agent: args.agent,
        model: args.model,
        provider: args.provider,
        verbose: args.verbose,
        useDocker: args.useDocker,
        timeout: args.timeout
    };

    let exercises: string[] = [];
    
    if (args.specificExercise) {
        exercises = [args.specificExercise];
    } else if (args.exerciseList) {
        exercises = args.exerciseList;
    } else if (args.exerciseCount) {
        const allExercises = await exerciseReader.getExercises();
        exercises = allExercises.slice(0, args.exerciseCount);
    } else {
        exercises = await exerciseReader.getExercises();
    }

    const results: TestOnlyResult[] = [];
    let totalPassed = 0;
    
    for (const exercise of exercises) {
        const result = await testOnlyRunner.run(config, exercise);
        results.push(result);
        if (result.testSuccess) {
            totalPassed++;
        }
    }

    // Output summary
    console.log(`\n=== Test Results Summary ===`);
    console.log(`Total exercises: ${results.length}`);
    console.log(`Passed: ${totalPassed}`);
    console.log(`Failed: ${results.length - totalPassed}`);
    console.log(`Success rate: ${((totalPassed / results.length) * 100).toFixed(1)}%`);
    
    if (args.verbose) {
        console.log(`\n=== Detailed Results ===`);
        for (const result of results) {
            const status = result.testSuccess ? '✅ PASS' : '❌ FAIL';
            console.log(`${status} ${result.exercise} (${result.testDuration}ms)`);
            if (!result.testSuccess && result.testError) {
                console.log(`  Error: ${result.testError.split('\n')[0]}`);
            }
        }
    }
}

async function runPrintInstructionsMode(
    args: CLIArgs,
    exerciseReader: ExerciseReader
): Promise<void> {
    let exercises: string[] = [];
    
    if (args.specificExercise) {
        exercises = [args.specificExercise];
    } else if (args.exerciseList) {
        exercises = args.exerciseList;
    } else if (args.exerciseCount) {
        const allExercises = await exerciseReader.getExercises();
        exercises = allExercises.slice(0, args.exerciseCount);
    } else {
        // Default: show instructions for first exercise only
        const allExercises = await exerciseReader.getExercises();
        exercises = allExercises.slice(0, 1);
    }

    for (const exercise of exercises) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Instructions for exercise: ${exercise}`);
        console.log(`${'='.repeat(60)}\n`);
        
        try {
            const instructions = await exerciseReader.getInstructions(exercise, HEADER_INSTRUCTION, args.customInstruction);
            console.log(instructions);
        } catch (error) {
            console.error(`Error reading instructions for ${exercise}:`, error);
        }
        
        if (exercises.length > 1) {
            console.log(`\n${'='.repeat(60)}`);
        }
    }
}

if (import.meta.main) {
    main().catch(console.error);
}
