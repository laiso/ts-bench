import { existsSync, statSync } from 'fs';
import type { TestResult, BenchmarkConfig } from '../config/types';
import { AgentRunner } from './agent';
import { TestRunner } from './test';
import { ExerciseResetter } from '../exercises/reset';
import type { Logger } from '../utils/logger';
import { join } from 'path';
import { SWELANCER_IMAGE, SWELANCER_REPO_PATH } from '../config/constants';
import type { DatasetReader } from '../datasets/types';
import type { TestContext } from './test';
import type { CommandExecutor } from '../utils/shell';
import { V2ContainerManager, V2DockerExecStrategy } from '../execution/v2-container';

export class ExerciseRunner {
    constructor(
        private executor: CommandExecutor,
        private agentRunner: AgentRunner,
        private testRunner: TestRunner,
        private exerciseResetter: ExerciseResetter,
        private logger: Logger,
        private exerciseBasePath: string,
        private datasetReader: DatasetReader
    ) { }

    async run(config: BenchmarkConfig, exercise: string): Promise<TestResult> {
        const startTime = Date.now();
        const exercisePath = config.dataset === 'v2'
            ? SWELANCER_REPO_PATH
            : join(this.exerciseBasePath, 'exercises', 'practice', exercise);

        // Get metadata early
        const metadata = await this.datasetReader.getTaskMetadata(exercise);

        this.logger.logExerciseStart(exercise);

        // Phase 0.5: Checkout & Apply Patch for V2 (Local only)
        if (config.dataset === 'v2' && !config.useDocker) {
            if (metadata.commitId) {
                console.log(`Checking out commit: ${metadata.commitId}`);
                await this.executor.execute(['git', 'reset', '--hard', metadata.commitId], { cwd: exercisePath });
                await this.executor.execute(['git', 'submodule', 'update', '--init', '--recursive'], { cwd: exercisePath });
            }

            const patchPath = join(process.cwd(), 'repos/frontier-evals/project/swelancer/issues', exercise, 'bug_reintroduce.patch');
            if (existsSync(patchPath)) {
                const patchStat = statSync(patchPath);
                if (patchStat.size > 0) {
                    console.log(`Applying bug reintroduce patch: ${patchPath}`);
                    try {
                        await this.executor.execute(['git', 'apply', patchPath], { cwd: exercisePath });
                    } catch (e) {
                        console.warn(`Failed to apply patch: ${e}`);
                    }
                }
            }
        }

        // Phase 0: Reset exercise to a clean state (only for local/V1)
        if (config.dataset !== 'v2') {
            await this.exerciseResetter.reset(exercisePath, config.verbose);
        }

        const useDocker = config.useDocker ?? true; // Default is to use Docker

        // ── V2 Docker: single-container path (setup runs once) ──────────
        if (config.dataset === 'v2' && useDocker) {
            return this.runV2Docker(config, exercise, exercisePath);
        }

        // ── V1 / local path (unchanged) ─────────────────────────────────

        // Phase 1: Run AI Agent
        const agentResult = await this.agentRunner.run(config, exercise, exercisePath, useDocker);

        // Phase 1.5: Restore test files when running locally (in case the agent modified them)
        if (config.dataset !== 'v2') {
            const testFiles = await this.agentRunner.getTestFiles(exercise);
            await this.exerciseResetter.restoreTestFiles(exercisePath, testFiles);
        }

        // Phase 1.6: Log diff after agent (only in verbose mode)
        if (config.verbose && config.dataset !== 'v2') {
            await this.exerciseResetter.logDiffAfterAgent(exercisePath);
        }

        let applyPatchPath: string | undefined;
        let commitId: string | undefined = metadata.commitId;

        if (config.dataset === 'v2') {
            // Native (non-Docker) v2: agent modified files in place
            applyPatchPath = undefined;
            commitId = undefined;
        }

        const testContext: TestContext = {
            datasetType: config.dataset,
            commitId: commitId,
            applyPatchPath: applyPatchPath
        };

        // Phase 2: Run Tests (always run, even if agent failed)
        const testResult = await this.testRunner.run(config, exercise, exercisePath, useDocker, testContext);

        const totalDuration = Date.now() - startTime;
        const overallSuccess = agentResult.success && testResult.success;

        this.logger.logExerciseResult(exercise, overallSuccess, totalDuration);

        return {
            exercise,
            agentSuccess: agentResult.success,
            testSuccess: testResult.success,
            overallSuccess,
            agentError: agentResult.error,
            testError: testResult.error,
            agentDuration: agentResult.duration,
            testDuration: testResult.duration,
            totalDuration
        };
    }

    // ------------------------------------------------------------------
    // V2 Docker: single-container execution (setup runs once)
    // ------------------------------------------------------------------

    private async runV2Docker(
        config: BenchmarkConfig,
        exercise: string,
        exercisePath: string,
    ): Promise<TestResult> {
        const startTime = Date.now();
        const container = new V2ContainerManager(this.executor, this.logger, SWELANCER_IMAGE);
        const containerOpts = { issueId: exercise, timeout: config.timeout, verbose: config.verbose };

        try {
            // Phase 0: Create container & run setup (ONCE)
            await container.create(containerOpts);
            const setupResult = await container.setup(containerOpts);
            if (setupResult.exitCode !== 0) {
                const duration = Date.now() - startTime;
                this.logger.info(`[v2] Setup failed for ${exercise}`);
                return {
                    exercise,
                    agentSuccess: false,
                    testSuccess: false,
                    overallSuccess: false,
                    agentError: `Setup failed: ${setupResult.stderr}`,
                    agentDuration: duration,
                    testDuration: 0,
                    totalDuration: duration,
                };
            }

            // Build strategy that targets this container via `docker exec`
            const containerId = container.getId()!;
            const execStrategy = new V2DockerExecStrategy(containerId);

            // IMPORTANT: `return await` is required here so the finally block
            // waits for runV2Task to complete before destroying the container.
            // Using bare `return` would let the finally block run immediately,
            // killing the container while the agent is still executing.
            return await this.runV2Task(config, exercise, exercisePath, execStrategy);
        } finally {
            await container.destroy();
        }
    }

    /**
     * Run agent + test for a single v2 task inside an already-set-up container.
     * Used by both single-task mode (`runV2Docker`) and grouped mode
     * (`runV2CommitGroup` in BenchmarkRunner).
     */
    async runV2Task(
        config: BenchmarkConfig,
        exercise: string,
        exercisePath: string,
        execStrategy: V2DockerExecStrategy,
    ): Promise<TestResult> {
        const startTime = Date.now();

        this.logger.logExerciseStart(exercise);

        // Phase 1: Run AI Agent (inside the already-set-up container)
        const agentResult = await this.agentRunner.run(
            config, exercise, exercisePath, true, execStrategy,
        );

        // Phase 2: Run Tests (same container, no second setup)
        const testContext: TestContext = {
            datasetType: 'v2',
        };
        const testResult = await this.testRunner.run(
            config, exercise, exercisePath, true, testContext, execStrategy,
        );

        const totalDuration = Date.now() - startTime;
        const overallSuccess = agentResult.success && testResult.success;
        this.logger.logExerciseResult(exercise, overallSuccess, totalDuration);

        return {
            exercise,
            agentSuccess: agentResult.success,
            testSuccess: testResult.success,
            overallSuccess,
            agentError: agentResult.error,
            testError: testResult.error,
            agentDuration: agentResult.duration,
            testDuration: testResult.duration,
            totalDuration,
        };
    }

    /** Expose internals needed by BenchmarkRunner for grouped execution */
    getExecutor(): CommandExecutor { return this.executor; }
    getLogger(): Logger { return this.logger; }
}
