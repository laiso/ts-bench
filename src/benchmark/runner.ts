import type { TestResult, BenchmarkConfig, CLIArgs } from '../config/types';
import type { DatasetReader } from '../datasets/types';
import { ExerciseRunner } from '../runners/exercise';
import { BenchmarkReporter } from './reporter';
import { LeaderboardGenerator } from '../utils/leaderboard-generator';
import { VersionDetector } from '../utils/version-detector';
import { getAgentScriptPath } from '../config/paths';
import { SWELANCER_IMAGE, TS_BENCH_CONTAINER } from '../config/constants';
import { SWELANCER_CLI_CACHE_CONTAINER_PATH } from '../utils/docker';
import { sanitizeFilenameSegment } from '../utils/file-name';
import { resolveBenchmarkSelection } from '../utils/task-selection';

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
        console.log(`📋 Solving TypeScript problems with ${args.agent} agent (${args.model} model)\n`);

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

        let testCommand = 'corepack yarn && corepack yarn test';
        if (args.dataset === 'v2') {
            if (useDocker) {
                // V2 Docker uses single-container mode: setup already ran once via
                // V2ContainerManager.setup().  The test command only needs to start
                // services (run.sh) and run pytest via run_tests.yml.
                const setupWaitSec = parseInt(process.env.TS_BENCH_V2_SETUP_WAIT_SEC || '600', 10) || 600;
                testCommand = `export CI=true && unset RUNTIME_SETUP && /app/tests/run.sh & for i in $(seq 1 ${setupWaitSec}); do [ -f /setup_done.txt ] && break; sleep 1; done; if [ ! -f /setup_done.txt ]; then echo "setup did not complete"; exit 1; fi; ansible-playbook -i "localhost," --connection=local /app/tests/run_tests.yml`;
            } else {
                // Native V2: Run Jest on changed files
                testCommand = `npm rebuild canvas && npm test -- -o`;
            }
        }

        const requestedTimeout = args.timeout ?? 300;
        // v2 single-container: setup runs once; remaining time is agent + services + pytest
        const exerciseTimeout =
            args.dataset === 'v2' ? Math.max(requestedTimeout, 3600) : requestedTimeout;

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

        for (const exercise of exercises) {
            const result = await this.exerciseRunner.run(config, exercise);
            results.push(result);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        await this.handleOutput(results, config, args);
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
