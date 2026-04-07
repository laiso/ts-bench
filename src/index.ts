#!/usr/bin/env bun

import { TS_BENCH_CONTAINER, EXERCISM_PRACTICE_PATH, HEADER_INSTRUCTION, SWELANCER_IMAGE, SETUP_AUTH_IMAGE } from './config/constants';
import { join, resolve } from 'path';
import { AUTH_CACHE_AGENTS, AUTH_LOGIN_ARGS, AUTH_SENTINEL, createAuthCacheArgs, createCliCacheArgs, hasCredentialFile, resolveAuthCachePath } from './utils/docker';
import { BunCommandExecutor } from './utils/shell';
import { ConsoleLogger } from './utils/logger';
import { parseCommandLineArgs, printHelp } from './utils/cli';
import { resolveBenchmarkSelection } from './utils/task-selection';
import { ExerciseReader } from './exercises/reader';
import { ExercismDataset } from './datasets/exercism';
import { SweLancerDataset } from './datasets/swelancer';
import type { DatasetReader } from './datasets/types';
import { ExerciseResetter } from './exercises/reset';
import { AgentRunner } from './runners/agent';
import { TestRunner } from './runners/test';
import { TestOnlyRunner } from './runners/test-only';
import { ExerciseRunner } from './runners/exercise';
import { BenchmarkRunner } from './benchmark/runner';
import { BenchmarkReporter } from './benchmark/reporter';
import type { CLIArgs, TestOnlyResult } from './config/types';
import { buildTestCommand, getExerciseTimeout } from './config/test-commands';

async function main(): Promise<void> {
    // Display help if requested
    if (process.argv.includes('--help')) {
        printHelp();
        return;
    }

    // --propose-update <path>: run update-leaderboard script and open a PR
    const proposeUpdateIndex = process.argv.indexOf('--propose-update');
    if (proposeUpdateIndex !== -1) {
        const resultJsonPath = process.argv[proposeUpdateIndex + 1];
        if (!resultJsonPath || resultJsonPath.startsWith('--')) {
            console.error('Usage: --propose-update <path-to-result.json> [--source-label <label>]');
            process.exit(1);
        }
        const sourceLabelIndex = process.argv.indexOf('--source-label');
        const sourceLabel = (sourceLabelIndex !== -1 && process.argv[sourceLabelIndex + 1] && !process.argv[sourceLabelIndex + 1]!.startsWith('--'))
            ? process.argv[sourceLabelIndex + 1]!
            : 'local';
        await runProposeUpdate(resultJsonPath, sourceLabel);
        return;
    }

    // --setup-auth <agent>: interactive Docker login for subscription auth
    const setupAuthIndex = process.argv.indexOf('--setup-auth');
    if (setupAuthIndex !== -1) {
        const agent = process.argv[setupAuthIndex + 1];
        if (!agent) {
            console.error('Usage: --setup-auth <agent>  (claude, gemini, codex)');
            process.exit(1);
        }
        await runSetupAuth(agent);
        return;
    }

    const args = await parseCommandLineArgs();

    // Get exercism path from CLI options or default value
    const exercismPath = args.exercismPath || EXERCISM_PRACTICE_PATH;

    // Initialize dependencies
    const executor = new BunCommandExecutor();
    const logger = new ConsoleLogger();

    const datasetReader: DatasetReader = args.dataset === 'v2'
        ? new SweLancerDataset()
        : new ExercismDataset(exercismPath);

    // Keep ExerciseReader for legacy/test-only compatibility if needed or migrate
    // But TestOnlyRunner likely needs ExerciseReader or DatasetReader.
    // For now we assume test-only works with V1 logic or needs update.
    const exerciseReader = new ExerciseReader(exercismPath); // Legacy

    const exerciseResetter = new ExerciseResetter();

    if (args.testOnly) {
        // Test-only mode: run tests against current code
        const testOnlyRunner = new TestOnlyRunner(
            executor,
            logger,
            exercismPath
        );

        await runTestOnlyMode(args, datasetReader, testOnlyRunner);
    } else if (args.printInstructions) {
        // Print instructions mode: show instructions that would be sent to agent
        await runPrintInstructionsMode(args, datasetReader);
    } else {
        const containerName = args.dataset === 'v2' ? SWELANCER_IMAGE : TS_BENCH_CONTAINER;

        // Normal mode: full benchmark with agent execution
        const agentRunner = new AgentRunner(
            executor,
            datasetReader,
            logger,
            containerName,
            HEADER_INSTRUCTION,
            args.customInstruction
        );

        const testRunner = new TestRunner(
            executor,
            logger,
            containerName
        );

        const exerciseRunner = new ExerciseRunner(
            executor,
            agentRunner,
            testRunner,
            exerciseResetter,
            logger,
            exercismPath,
            datasetReader
        );

        // Execute benchmark
        const reporter = new BenchmarkReporter();
        const benchmarkRunner = new BenchmarkRunner(
            datasetReader,
            exerciseRunner,
            reporter
        );

        await benchmarkRunner.run(args);
    }
}

async function runTestOnlyMode(
    args: CLIArgs,
    datasetReader: DatasetReader,
    testOnlyRunner: TestOnlyRunner
): Promise<void> {
    const testCommand = buildTestCommand(args.dataset, args.useDocker ?? false);
    const config = {
        testCommand,
        agent: args.agent,
        model: args.model,
        provider: args.provider,
        verbose: args.verbose,
        useDocker: args.useDocker,
        timeout: getExerciseTimeout(args.dataset, args.timeout)
    };

    const allIds = await datasetReader.getTasks();
    const exercises = resolveBenchmarkSelection(args, allIds);

    const results: TestOnlyResult[] = [];
    let totalPassed = 0;

    for (const exercise of exercises) {
        const metadata = args.dataset === 'v2' ? await datasetReader.getTaskMetadata(exercise) : {};
        const result = await testOnlyRunner.run(config, exercise, args.dataset, metadata.commitId);
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
    datasetReader: DatasetReader
): Promise<void> {
    const allIds = await datasetReader.getTasks();
    const exercises = resolveBenchmarkSelection(args, allIds);
    const label = args.dataset === 'v2' ? 'task' : 'exercise';

    for (const exercise of exercises) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Instructions for ${label}: ${exercise}`);
        console.log(`${'='.repeat(60)}\n`);

        try {
            const instructions = await datasetReader.getInstructions(exercise, HEADER_INSTRUCTION, args.customInstruction);
            console.log(instructions);
        } catch (error) {
            console.error(`Error reading instructions for ${exercise}:`, error);
        }

        if (exercises.length > 1) {
            console.log(`\n${'='.repeat(60)}`);
        }
    }
}

/**
 * --propose-update <path>: Run the leaderboard update script against the
 * given result JSON, then create a git branch, commit, push, and open a PR.
 */
export async function runProposeUpdate(
    resultJsonPath: string,
    sourceLabel: string,
    deps?: {
        spawnSync?: typeof import('child_process').spawnSync;
        existsSync?: typeof import('fs').existsSync;
        readFileSync?: (path: string, enc: BufferEncoding) => string;
        writeFileSync?: typeof import('fs').writeFileSync;
    }
): Promise<void> {
    const { spawnSync: _spawnSync } = await import('child_process');
    const { existsSync: _existsSync, readFileSync: _readFileSync, writeFileSync: _writeFileSync } = await import('fs');

    const spawnSync = deps?.spawnSync ?? _spawnSync;
    const existsSync = deps?.existsSync ?? _existsSync;
    const readFileSync = deps?.readFileSync ?? ((p: string, enc: BufferEncoding) => _readFileSync(p, enc) as string);
    const writeFileSync = deps?.writeFileSync ?? _writeFileSync;

    // 1. Run update-leaderboard.ts
    const updateResult = spawnSync('bun', ['scripts/update-leaderboard.ts', resultJsonPath], {
        stdio: 'inherit',
    });
    if (updateResult.status !== 0) {
        console.error(`update-leaderboard.ts failed with exit code ${updateResult.status}`);
        process.exit(updateResult.status ?? 1);
    }

    // 2. Stage leaderboard result files
    spawnSync('git', ['add', 'public/data/results/'], { stdio: 'inherit' });

    // 3. Check for staged changes
    const diffResult = spawnSync('git', ['diff', '--cached', '--quiet'], { stdio: 'inherit' });
    if (diffResult.status === 0) {
        console.log('No changes to commit.');
        return;
    }

    // 4. Determine commit message
    let prTitle = `feat(leaderboard): Update from ${sourceLabel} result`;
    if (existsSync('pr-title.txt')) {
        const titleFromFile = readFileSync('pr-title.txt', 'utf-8').trim();
        if (titleFromFile) prTitle = titleFromFile;
    }

    let commitMessage = prTitle + '\n\n';
    if (existsSync('commit-body.md')) {
        const body = readFileSync('commit-body.md', 'utf-8').trim();
        if (body) commitMessage += body;
    } else {
        commitMessage += 'No detailed diff generated.';
    }

    // 5. Create branch, commit, push
    const timestamp = Math.floor(Date.now() / 1000);
    const branch = `leaderboard-update/local-${timestamp}`;

    const gitConfig = [
        ['git', 'config', 'user.name', 'github-actions[bot]'],
        ['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'],
    ];
    for (const [cmd, ...args] of gitConfig) {
        spawnSync(cmd!, args, { stdio: 'inherit' });
    }

    const checkoutResult = spawnSync('git', ['checkout', '-B', branch], { stdio: 'inherit' });
    if (checkoutResult.status !== 0) {
        console.error('Failed to create git branch.');
        process.exit(checkoutResult.status ?? 1);
    }

    const msgFile = '/tmp/ts-bench-commit-message.txt';
    writeFileSync(msgFile, commitMessage, 'utf-8');

    const commitResult = spawnSync('git', ['commit', '-F', msgFile], { stdio: 'inherit' });
    if (commitResult.status !== 0) {
        console.error('Failed to commit changes.');
        process.exit(commitResult.status ?? 1);
    }

    const pushResult = spawnSync('git', ['push', '-u', 'origin', branch, '--force-with-lease'], { stdio: 'inherit' });
    if (pushResult.status !== 0) {
        console.error('Failed to push branch.');
        process.exit(pushResult.status ?? 1);
    }

    // 6. Create pull request
    const bodyArgs: string[] = existsSync('commit-body.md')
        ? ['--body-file', 'commit-body.md']
        : ['--body', ''];

    const prResult = spawnSync(
        'gh',
        ['pr', 'create', '--base', 'main', '--head', branch, '--title', prTitle, ...bodyArgs, '--label', 'leaderboard'],
        { stdio: 'inherit' }
    );
    if (prResult.status !== 0) {
        const { execSync } = await import('child_process');
        try {
            const encoded = encodeURIComponent(branch);
            const repo = execSync('gh repo view --json nameWithOwner --jq .nameWithOwner', { encoding: 'utf-8' }).trim();
            console.warn('\n⚠ PR creation failed. Create manually:');
            console.warn(`  https://github.com/${repo}/compare/main...${encoded}?expand=1`);
        } catch {
            console.warn('\n⚠ PR creation failed. Please create the PR manually.');
        }
    }
}

/**
 * --setup-auth <agent>: Start an interactive Docker container to run the
 * agent's login command.  Auth state is persisted in a Docker volume so
 * future benchmark runs can use subscription auth without API keys.
 */
async function runSetupAuth(agent: string): Promise<void> {
    const supportedAgents = Object.keys(AUTH_CACHE_AGENTS);
    if (!supportedAgents.includes(agent)) {
        console.error(`Unsupported agent for --setup-auth: ${agent}`);
        console.error(`Supported agents: ${supportedAgents.join(', ')}`);
        process.exit(1);
    }

    console.log(`Setting up subscription auth for ${agent} inside Docker...`);
    console.log('An interactive container will start. Complete the login flow in your browser.');
    console.log('Auth state will be saved and reused for future --docker runs.\n');

    // Mount the local run-agent.sh into the container so we can use the
    // lightweight node:lts image instead of requiring ts-bench-container.
    const scriptHost = resolve(process.cwd(), 'scripts', 'run-agent.sh');
    const scriptContainer = '/tmp/run-agent.sh';

    const command = [
        'docker', 'run', '--rm', '-it',
        ...createCliCacheArgs(),
        ...createAuthCacheArgs(agent),
        '-v', `${scriptHost}:${scriptContainer}:ro`,
        SETUP_AUTH_IMAGE,
        'bash', scriptContainer, agent, ...(AUTH_LOGIN_ARGS[agent] ?? []),
    ];

    const { spawnSync } = await import('child_process');
    const result = spawnSync(command[0]!, command.slice(1), {
        stdio: 'inherit',
    });

    // Some agent CLIs (Claude, Gemini) enter interactive chat mode after a
    // successful login, so the user must Ctrl-C to exit — which produces a
    // non-zero exit code.  We therefore check for the actual credential file
    // in the auth cache rather than relying solely on the exit code.
    const authSucceeded = result.status === 0 || hasCredentialFile(agent);

    if (authSucceeded) {
        // Write sentinel so hasAuthCache() recognises a completed login
        const { writeFileSync } = await import('fs');
        const sentinelPath = join(resolveAuthCachePath(agent), AUTH_SENTINEL);
        writeFileSync(sentinelPath, new Date().toISOString(), 'utf-8');

        console.log(`\n✓ Auth setup complete for ${agent}.`);
        console.log(`  You can now run benchmarks without an API key:`);
        console.log(`  bun src/index.ts --agent ${agent} --exercise acronym --docker`);
    } else {
        console.error(`\n✗ Auth setup failed for ${agent} (exit code: ${result.status}).`);
        process.exit(result.status ?? 1);
    }
}

if (import.meta.main) {
    main().catch(console.error);
}
