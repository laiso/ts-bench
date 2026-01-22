import type { AgentResult, BenchmarkConfig } from '../config/types';
import { AgentFactory } from '../agents/factory';
import { AgentLoggerFactory } from '../utils/agent-logger';
import { getAgentScriptPath } from '../config/paths';
import type { DatasetReader } from '../datasets/types';
import type { CommandExecutor } from '../utils/shell';
import type { Logger } from '../utils/logger';
import { ProgressMonitor } from '../utils/progress-monitor';
import { join } from 'path';
import { LocalExecutionStrategy } from '../execution/local-strategy';
import { DockerExecutionStrategy } from '../execution/docker-strategy';

export class AgentRunner {
    constructor(
        private executor: CommandExecutor,
        private datasetReader: DatasetReader,
        private logger: Logger,
        private containerName: string,
        private baseInstruction: string,
        private customInstruction?: string
    ) {}

    async run(config: BenchmarkConfig, exercise: string, exercisePath: string, useDocker: boolean = true): Promise<AgentResult> {
        const startTime = Date.now();

        let progressMonitor: ProgressMonitor | null = null;
        if (config.showProgress) {
            progressMonitor = new ProgressMonitor(this.logger, {
                exercisePath: join(process.cwd(), exercisePath),
                exerciseName: exercise,
                intervalMs: 8000,
                verbose: config.verbose
            });
        }

        try {
            const agentScriptPath = getAgentScriptPath(useDocker, config.dataset);
            const agentBuilder = AgentFactory.create(config, this.containerName, agentScriptPath);
            const instructions = await this.datasetReader.getInstructions(exercise, this.baseInstruction, this.customInstruction);
            const fileList = await this.datasetReader.getTaskFiles(exercise);
            const coreCommand = await agentBuilder.buildCommand(instructions, fileList);

            const metadata = await this.datasetReader.getTaskMetadata(exercise);

            let generatePatchPath: string | undefined;
            if (config.dataset === 'v2') {
                const patchDir = join(process.cwd(), '.patches');
                await import('fs/promises').then(fs => fs.mkdir(patchDir, { recursive: true }));
                
                if (useDocker) {
                    generatePatchPath = `/patches/${exercise}.patch`;
                } else {
                    generatePatchPath = join(patchDir, `${exercise}.patch`);
                }
            }

            const strategy = useDocker
                ? new DockerExecutionStrategy(this.containerName)
                : new LocalExecutionStrategy();
            
            const prepared = strategy.prepare(coreCommand, { 
                exercisePath, 
                testFiles: fileList.testFiles,
                datasetType: config.dataset,
                commitId: metadata.commitId,
                generatePatchPath
            });

            if (config.verbose) {
                this.logger.logAgentCommand(prepared.command);
            }

            if (progressMonitor) {
                progressMonitor.start();
            }

            const execOptions = { ...prepared.options, timeout: config.timeout };
            const result = await this.executor.execute(prepared.command, execOptions);

            const logCollector = AgentLoggerFactory.create(config.agent);
            await logCollector.collect(config, exercise, exercisePath, result);

            const duration = Date.now() - startTime;

            if (progressMonitor) {
                progressMonitor.stop();
            }

            if (result.exitCode === 0) {
                this.logger.logAgentSuccess(exercise, duration, config.verbose, result);
                return { exercise, success: true, duration, output: result.stdout };
            } else {
                this.logger.logAgentFailure(exercise, duration, config.verbose, result);

                // Agent failed - exit immediately
                console.error(`❌ Agent failed for ${exercise}. Exiting immediately.`);
                return { exercise, success: false, duration, error: result.stderr, output: result.stdout };
            }
        } catch (error) {
            if (progressMonitor) {
                progressMonitor.stop();
            }

            const duration = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.logAgentError(exercise, duration, errorMsg);

            // Agent error - exit immediately
            console.error(`❌ Agent error for ${exercise}: ${errorMsg}. Exiting immediately.`);
            return { exercise, success: false, duration, error: errorMsg };
        }
    }

    async getTestFiles(exercise: string): Promise<string[]> {
        return await this.datasetReader.getTestFiles(exercise);
    }
}
