import type { TestResult, BenchmarkConfig, CLIArgs } from '../config/types';
import type { DatasetReader } from '../datasets/types';
import { ExerciseRunner } from '../runners/exercise';
import { BenchmarkReporter } from './reporter';
import { LeaderboardGenerator } from '../utils/leaderboard-generator';
import { VersionDetector } from '../utils/version-detector';
import { getAgentScriptPath } from '../config/paths';
import { SWELANCER_IMAGE, SWELANCER_REPO_PATH, TS_BENCH_CONTAINER } from '../config/constants';
import { SWELANCER_CLI_CACHE_CONTAINER_PATH } from '../utils/docker';
import { sanitizeFilenameSegment } from '../utils/file-name';
import { resolveBenchmarkSelection } from '../utils/task-selection';
import { buildTestCommand, getExerciseTimeout } from '../config/test-commands';
import { V2ContainerManager, V2DockerExecStrategy } from '../execution/v2-container';

export class BenchmarkRunner {
    constructor(
        private datasetReader: DatasetReader,
        private exerciseRunner: ExerciseRunner,
        private reporter: BenchmarkReporter
    ) { }

    async run(args: CLIArgs): Promise<void> {
        const allExercises = await this.datasetReader.getTasks();

        if (args.listExercises) {
            this.printExerciseList(allExercises);
            return;
        }

        console.log(`🚀 Starting Benchmark (Dataset: ${args.dataset || 'v1'})`);
        const modelLabel = args.model ? `${args.model} model` : 'default model';
        console.log(`📋 Solving TypeScript problems with ${args.agent} agent (${modelLabel})\n`);

        const useDocker = args.useDocker ?? true;
        const agentScriptPath = getAgentScriptPath(useDocker, args.dataset);
        let agentVersion = args.version;
        if (!agentVersion) {
            console.log(`🔍 Detecting ${args.agent} version...`);
            const versionDetector = new VersionDetector();
            const versionContainer = args.dataset === 'v2' ? SWELANCER_IMAGE : TS_BENCH_CONTAINER;
            agentVersion = await versionDetector.detectAgentVersion(args.agent, {
                useDocker,
                containerName: versionContainer,
                agentScriptPath,
                ...(args.dataset === 'v2'
                    ? { dockerCliCacheMount: SWELANCER_CLI_CACHE_CONTAINER_PATH }
                    : {})
            });
            console.log(`📦 Detected ${args.agent} version: ${agentVersion}\n`);
        } else {
            console.log(`📦 Using specified ${args.agent} version: ${agentVersion}\n`);
        }

        const exercises = resolveBenchmarkSelection(args, allExercises);
        const results: TestResult[] = [];

        // Display titles for selected exercises
        if (exercises.length === 1 && exercises[0]) {
            const metadata = await this.datasetReader.getTaskMetadata(exercises[0]);
            if (metadata.title && metadata.title !== exercises[0]) {
                console.log(`📝 Title: ${metadata.title}\n`);
            }
        }

        const testCommand = buildTestCommand(args.dataset, useDocker);
        const exerciseTimeout = getExerciseTimeout(args.dataset, args.timeout);

        const config: BenchmarkConfig = {
            testCommand,
            agent: args.agent,
            model: args.model,
            provider: args.provider,
            verbose: args.verbose,
            useDocker,
            version: agentVersion,
            showProgress: args.showProgress,
            timeout: exerciseTimeout,
            outputDir: args.outputDir,
            dataset: args.dataset
        };

        // V2 Docker with multiple tasks: use commit-grouped execution
        const isV2DockerMulti = args.dataset === 'v2' && useDocker && exercises.length > 1;

        if (isV2DockerMulti) {
            const grouped = await this.runV2CommitGroups(config, exercises);
            results.push(...grouped);
        } else {
            for (const exercise of exercises) {
                const result = await this.exerciseRunner.run(config, exercise);
                results.push(result);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        await this.handleOutput(results, config, args);
    }

    // ------------------------------------------------------------------
    // V2 commit-grouped execution
    // ------------------------------------------------------------------

    /**
     * Group tasks by commitId, then run each group in a single long-lived
     * container.  `setupBase()` runs once per commit; each task only pays
     * the cost of `prepareTask()` (patch apply) and `resetToBaseline()`.
     *
     * Tasks whose commitId cannot be determined fall back to the normal
     * single-task-per-container path via `exerciseRunner.run()`.
     */
    private async runV2CommitGroups(
        config: BenchmarkConfig,
        exercises: string[],
    ): Promise<TestResult[]> {
        const results: TestResult[] = [];

        // Resolve commitId for every task
        const commitMap = this.datasetReader.getCommitIds
            ? await this.datasetReader.getCommitIds(exercises)
            : new Map<string, string>();

        // Build groups: commitId → taskId[]
        const groups = new Map<string, string[]>();
        const ungrouped: string[] = [];
        for (const taskId of exercises) {
            const cid = commitMap.get(taskId);
            if (cid) {
                const list = groups.get(cid) ?? [];
                list.push(taskId);
                groups.set(cid, list);
            } else {
                ungrouped.push(taskId);
            }
        }

        // Run each commit group in a single container
        for (const [commitId, taskIds] of groups) {
            const groupResults = await this.runOneCommitGroup(config, commitId, taskIds);
            results.push(...groupResults);
        }

        // Fallback: run ungrouped tasks one at a time (single-container mode)
        for (const taskId of ungrouped) {
            const result = await this.exerciseRunner.run(config, taskId);
            results.push(result);
        }

        return results;
    }

    /**
     * Execute all tasks that share a single commitId inside one container.
     *
     * Lifecycle:
     *   docker create → setupBase(commitId) → for each task:
     *     prepareTask() → agent + test → resetToBaseline()
     *   → docker rm
     */
    private async runOneCommitGroup(
        config: BenchmarkConfig,
        commitId: string,
        taskIds: string[],
    ): Promise<TestResult[]> {
        const results: TestResult[] = [];
        const executor = this.exerciseRunner.getExecutor();
        const logger = this.exerciseRunner.getLogger();
        const container = new V2ContainerManager(executor, logger, SWELANCER_IMAGE, config.agent);

        const firstTask = taskIds[0]!;
        console.log(
            `\n[v2-group] Commit ${commitId.slice(0, 12)} — ${taskIds.length} task(s), ` +
            `setup once then iterate\n`,
        );

        try {
            // Phase 0: Create container & run base setup (ONCE)
            await container.create({
                issueId: firstTask,
                timeout: config.timeout,
                verbose: config.verbose,
            });
            const setupResult = await container.setupBase({
                commitId,
                firstIssueId: firstTask,
                timeout: config.timeout,
                verbose: config.verbose,
            });
            if (setupResult.exitCode !== 0) {
                // Base setup failed — mark all tasks as failed
                for (const taskId of taskIds) {
                    results.push({
                        exercise: taskId,
                        agentSuccess: false,
                        testSuccess: false,
                        overallSuccess: false,
                        agentError: `Base setup failed for commit ${commitId}: ${setupResult.stderr || setupResult.stdout}`,
                        agentDuration: 0,
                        testDuration: 0,
                        totalDuration: 0,
                    });
                }
                return results;
            }

            const containerId = container.getId()!;
            const execStrategy = new V2DockerExecStrategy(containerId);

            // Phase 1–N: For each task, prepare → agent+test → reset
            for (let i = 0; i < taskIds.length; i++) {
                const taskId = taskIds[i]!;
                console.log(`[v2-group] Task ${i + 1}/${taskIds.length}: ${taskId}`);

                // Apply task-specific patch
                const prepResult = await container.prepareTask(taskId, {
                    timeout: config.timeout,
                    verbose: config.verbose,
                });
                if (prepResult.exitCode !== 0) {
                    results.push({
                        exercise: taskId,
                        agentSuccess: false,
                        testSuccess: false,
                        overallSuccess: false,
                        agentError: `prepareTask failed: ${prepResult.stderr}`,
                        agentDuration: 0,
                        testDuration: 0,
                        totalDuration: 0,
                    });
                    // Still reset so the next task starts clean
                    await container.resetToBaseline({ verbose: config.verbose });
                    continue;
                }

                // Run agent + test
                const result = await this.exerciseRunner.runV2Task(
                    config, taskId, SWELANCER_REPO_PATH, execStrategy,
                );
                results.push(result);

                // Reset to baseline for next task (skip after last task)
                if (i < taskIds.length - 1) {
                    await container.resetToBaseline({ verbose: config.verbose });
                }
            }
        } finally {
            await container.destroy();
        }

        return results;
    }

    private async handleOutput(results: TestResult[], config: BenchmarkConfig, args: CLIArgs): Promise<void> {
        // Console output (default)
        if (!args.outputFormat || args.outputFormat === 'console') {
            this.reporter.printResults(results);
        }

        // JSON output
        if (args.outputFormat === 'json') {
            const outputPath = this.generateOutputPath(args, 'json');
            await this.reporter.exportToJSON(results, config, outputPath);
        }

        // Save result if requested
        if (args.saveResult) {
            const resultDir = args.resultDir || './data/results';
            await this.reporter.saveResult(results, config, resultDir, args.resultName);

            if (!args.skipLeaderboardRefresh) {
                console.log('🔄 Updating leaderboard...');
                const generator = new LeaderboardGenerator();
                await generator.generateLeaderboard();
            }
        }
    }

    private generateOutputPath(args: CLIArgs, extension: string): string {
        const outputDir = args.outputDir || './results';
        const safeAgent = sanitizeFilenameSegment(args.agent, 'agent');
        const safeModel = sanitizeFilenameSegment(args.model, 'model');
        const rawTimestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        const safeTimestamp = sanitizeFilenameSegment(rawTimestamp, 'timestamp');
        const filename = `benchmark-${safeAgent}-${safeModel}-${safeTimestamp}.${extension}`;
        return `${outputDir}/${filename}`;
    }

    private printExerciseList(exercises: string[]): void {
        console.log("📋 Available Tasks:");
        exercises.forEach((exercise, index) => {
            console.log(`  ${(index + 1).toString().padStart(3)}: ${exercise}`);
        });
    }


}
