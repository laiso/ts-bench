import type { TestResult, BenchmarkConfig } from '../config/types';
import { AgentRunner } from './agent';
import { TestRunner } from './test';
import { ExerciseResetter } from '../exercises/reset';
import type { Logger } from '../utils/logger';
import { join } from 'path';
import { SWELANCER_REPO_PATH } from '../config/constants';

import type { DatasetReader } from '../datasets/types';
import type { TestContext } from './test';

import type { CommandExecutor } from '../utils/shell';

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

            // Import fs dynamically or check existence
            const fs = await import('fs');
            const patchPath = join(process.cwd(), 'repos/frontier-evals/project/swelancer/issues', exercise, 'bug_reintroduce.patch');
            if (fs.existsSync(patchPath)) {
                // Check if patch content is not empty
                const stat = fs.statSync(patchPath);
                if (stat.size > 0) {
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

        // Phase 1: Run AI Agent
        const agentResult = await this.agentRunner.run(config, exercise, exercisePath, useDocker);

        // Phase 1.5: Restore test files when running locally (in case the agent modified them)
        // Only for V1 where test files are on host
        if (config.dataset !== 'v2') {
            const testFiles = await this.agentRunner.getTestFiles(exercise);
            await this.exerciseResetter.restoreTestFiles(exercisePath, testFiles);
        }

        // Phase 1.6: Log diff after agent (only in verbose mode)
        if (config.verbose && config.dataset !== 'v2') {
            await this.exerciseResetter.logDiffAfterAgent(exercisePath);
        }

        // Get metadata for TestRunner
        // metadata is already fetched at start

        let applyPatchPath: string | undefined;
        let commitId: string | undefined = metadata.commitId;

        if (config.dataset === 'v2') {
            if (useDocker) {
                applyPatchPath = `/patches/${exercise}.patch`;
            } else {
                // Native mode: Agent modified files in place.
                // Do NOT apply patch, and do NOT reset commit (preserve changes).
                applyPatchPath = undefined;
                commitId = undefined;

                // Note: patches are still generated in Phase 1.6 for record keeping if verbose
                const patchDir = join(process.cwd(), '.patches');
            }
        } else {
            // V1 logic handles restore via exerciseResetter, so commitId/patch logic here isn't used usually
            // unless we want to support it. 
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
}
