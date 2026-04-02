import type { TestOnlyResult, BenchmarkConfig, DatasetType } from '../config/types';
import type { CommandExecutor } from '../utils/shell';
import type { Logger } from '../utils/logger';
import { join } from 'path';
import { LocalExecutionStrategy } from '../execution/local-strategy';
import { DockerExecutionStrategy } from '../execution/docker-strategy';
import { SWELANCER_IMAGE, TS_BENCH_CONTAINER } from '../config/constants';
import { V2ContainerManager, V2DockerExecStrategy } from '../execution/v2-container';

export class TestOnlyRunner {
    constructor(
        private executor: CommandExecutor,
        private logger: Logger,
        private exerciseBasePath: string
    ) {}

    async run(config: BenchmarkConfig, exercise: string, datasetType: DatasetType = 'v1', commitId?: string): Promise<TestOnlyResult> {
        // V2 Docker: use single-container path (setup once, then exec test)
        if (datasetType === 'v2' && config.useDocker) {
            return this.runV2Docker(config, exercise);
        }

        return this.runDefault(config, exercise, datasetType, commitId);
    }

    private async runDefault(config: BenchmarkConfig, exercise: string, datasetType: DatasetType, commitId?: string): Promise<TestOnlyResult> {
        const startTime = Date.now();
        const exercisePath = datasetType === 'v2' 
            ? '' 
            : join(this.exerciseBasePath, 'exercises', 'practice', exercise);

        this.logger.logExerciseStart(exercise);

        try {
            const containerName = datasetType === 'v2' ? SWELANCER_IMAGE : TS_BENCH_CONTAINER;
            const strategy = config.useDocker
                ? new DockerExecutionStrategy(containerName)
                : new LocalExecutionStrategy();
            const coreCommand = {
                args: ['bash', '-c', config.testCommand],
                env: {}
            };

            const prepared = strategy.prepare(coreCommand, { 
                exercisePath,
                datasetType,
                issueId: datasetType === 'v2' ? exercise : undefined,
                commitId
            });

            if (config.verbose) {
                this.logger.logTestCommand(prepared.command);
            }

            const execOptions = { ...prepared.options, timeout: config.timeout };
            let result;
            try {
                result = await this.executor.execute(prepared.command, execOptions);
            } finally {
                prepared.cleanup?.();
            }
            const duration = Date.now() - startTime;

            if (result.exitCode === 0) {
                this.logger.logTestSuccess(exercise, duration);
                return { 
                    exercise, 
                    testSuccess: true, 
                    testDuration: duration, 
                    output: result.stdout 
                };
            } else {
                this.logger.logTestFailure(exercise, duration, config.verbose, result);
                return { 
                    exercise, 
                    testSuccess: false, 
                    testError: `STDOUT: ${result.stdout}\nSTDERR: ${result.stderr}`, 
                    testDuration: duration, 
                    output: result.stdout 
                };
            }
        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.logTestError(exercise, duration, errorMsg);
            return { 
                exercise, 
                testSuccess: false, 
                testError: errorMsg, 
                testDuration: duration 
            };
        }
    }

    private async runV2Docker(config: BenchmarkConfig, exercise: string): Promise<TestOnlyResult> {
        const startTime = Date.now();
        this.logger.logExerciseStart(exercise);

        const container = new V2ContainerManager(this.executor, this.logger, SWELANCER_IMAGE);
        const containerOpts = { issueId: exercise, timeout: config.timeout, verbose: config.verbose };

        try {
            // Create container & run setup (once)
            await container.create(containerOpts);
            const setupResult = await container.setup(containerOpts);
            if (setupResult.exitCode !== 0) {
                const duration = Date.now() - startTime;
                return {
                    exercise,
                    testSuccess: false,
                    testError: `Setup failed: ${setupResult.stderr}`,
                    testDuration: duration,
                };
            }

            // Run test command via docker exec
            const containerId = container.getId()!;
            const execStrategy = new V2DockerExecStrategy(containerId);
            const coreCommand = {
                args: ['bash', '-c', config.testCommand],
                env: {}
            };
            const prepared = execStrategy.prepare(coreCommand, {
                exercisePath: '',
                datasetType: 'v2',
                issueId: exercise,
            });

            if (config.verbose) {
                this.logger.logTestCommand(prepared.command);
            }

            const execOptions = { ...prepared.options, timeout: config.timeout };
            let result;
            try {
                result = await this.executor.execute(prepared.command, execOptions);
            } finally {
                prepared.cleanup?.();
            }
            const duration = Date.now() - startTime;

            if (result.exitCode === 0) {
                this.logger.logTestSuccess(exercise, duration);
                return { exercise, testSuccess: true, testDuration: duration, output: result.stdout };
            } else {
                this.logger.logTestFailure(exercise, duration, config.verbose, result);
                return {
                    exercise,
                    testSuccess: false,
                    testError: `STDOUT: ${result.stdout}\nSTDERR: ${result.stderr}`,
                    testDuration: duration,
                    output: result.stdout,
                };
            }
        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.logTestError(exercise, duration, errorMsg);
            return { exercise, testSuccess: false, testError: errorMsg, testDuration: duration };
        } finally {
            await container.destroy();
        }
    }
}
