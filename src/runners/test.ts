import type { AgentResult, BenchmarkConfig, DatasetType } from '../config/types';
import type { CommandExecutor } from '../utils/shell';
import type { Logger } from '../utils/logger';
import { LocalExecutionStrategy } from '../execution/local-strategy';
import { DockerExecutionStrategy } from '../execution/docker-strategy';

export interface TestContext {
    commitId?: string;
    applyPatchPath?: string;
    datasetType?: DatasetType;
}

export class TestRunner {
    constructor(
        private executor: CommandExecutor,
        private logger: Logger,
        private containerName: string
    ) {}

    async run(config: BenchmarkConfig, exercise: string, exercisePath: string, useDocker: boolean = true, context?: TestContext): Promise<AgentResult> {
        const startTime = Date.now();

        try {
            const strategy = useDocker
                ? new DockerExecutionStrategy(this.containerName)
                : new LocalExecutionStrategy();

            const coreCommand = {
                args: ['bash', '-c', config.testCommand],
                env: {}
            };

            const prepared = strategy.prepare(coreCommand, { 
                exercisePath,
                datasetType: context?.datasetType,
                issueId: context?.datasetType === 'v2' ? exercise : undefined,
                commitId: context?.commitId,
                applyPatchPath: context?.applyPatchPath
            });

            if (config.verbose) {
                this.logger.logTestCommand(prepared.command);
            }

            const execOptions = { ...prepared.options, timeout: config.timeout };
            const result = await this.executor.execute(prepared.command, execOptions);
            const duration = Date.now() - startTime;

            if (result.exitCode === 0) {
                this.logger.logTestSuccess(exercise, duration);
                return { exercise, success: true, duration, output: result.stdout };
            } else {
                this.logger.logTestFailure(exercise, duration, config.verbose, result);
                return { 
                    exercise, 
                    success: false, 
                    error: `STDOUT: ${result.stdout}\nSTDERR: ${result.stderr}`, 
                    duration, 
                    output: result.stdout 
                };
            }
        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.logTestError(exercise, duration, errorMsg);
            return { exercise, success: false, error: errorMsg, duration };
        }
    }
}
