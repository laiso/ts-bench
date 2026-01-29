import type { TestOnlyResult, BenchmarkConfig } from '../config/types';
import type { CommandExecutor } from '../utils/shell';
import type { Logger } from '../utils/logger';
import { join } from 'path';

export class TestOnlyRunner {
    constructor(
        private executor: CommandExecutor,
        private logger: Logger,
        private exerciseBasePath: string
    ) {}

    async run(config: BenchmarkConfig, exercise: string): Promise<TestOnlyResult> {
        const startTime = Date.now();
        const exercisePath = join(this.exerciseBasePath, 'exercises', 'practice', exercise);

        this.logger.logExerciseStart(exercise);

        try {
            const testArgs = ["sh", "-c", config.testCommand];
            if (config.verbose) {
                this.logger.logTestCommand(testArgs);
            }

            const useDocker = config.useDocker ?? true;
            const execOptions = {
                cwd: join(process.cwd(), exercisePath),
                timeout: config.timeout,
                env: { ...process.env, ASSIGNMENT: exercise }
            };
            const result = await this.executor.execute(testArgs, execOptions);
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
}
