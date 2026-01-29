import type { AgentResult, BenchmarkConfig } from '../config/types';
import type { CommandExecutor } from '../utils/shell';
import type { Logger } from '../utils/logger';
import { DOCKER_BASE_ARGS, createWorkspaceArgs } from '../utils/docker';
import { join } from 'path';

export class TestRunner {
    constructor(
        private executor: CommandExecutor,
        private logger: Logger,
        private containerName: string
    ) {}

    async run(config: BenchmarkConfig, exercise: string, exercisePath: string, useDocker: boolean = true): Promise<AgentResult> {
        const startTime = Date.now();

        try {
            const testArgs = ["sh", "-c", config.testCommand];
            if (config.verbose) {
                this.logger.logTestCommand(testArgs);
            }

            const execOptions = {
                cwd: join(process.cwd(), exercisePath),
                timeout: config.timeout,
                env: { ...process.env, ASSIGNMENT: exercise }
            };
            const result = await this.executor.execute(testArgs, execOptions);
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
