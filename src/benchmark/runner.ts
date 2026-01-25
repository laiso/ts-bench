import type { TestResult, BenchmarkConfig, CLIArgs } from '../config/types';
import type { DatasetReader } from '../datasets/types';
import { ExerciseRunner } from '../runners/exercise';
import { BenchmarkReporter } from './reporter';
import { LeaderboardGenerator } from '../utils/leaderboard-generator';
import { VersionDetector } from '../utils/version-detector';
import { getAgentScriptPath } from '../config/paths';
import { TS_BENCH_CONTAINER } from '../config/constants';
import { sanitizeFilenameSegment } from '../utils/file-name';

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
            agentVersion = await versionDetector.detectAgentVersion(args.agent, {
                useDocker,
                containerName: TS_BENCH_CONTAINER,
                agentScriptPath
            });
            console.log(`📦 Detected ${args.agent} version: ${agentVersion}\n`);
        } else {
            console.log(`📦 Using specified ${args.agent} version: ${agentVersion}\n`);
        }

        const exercises = this.selectExercises(args, allExercises);
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
                // Run tests using the provided ansible playbook
                // We need to set CI=true to avoid interactive prompts if any
                testCommand = 'export CI=true && /app/tests/run.sh & for i in {1..120}; do [ -f /setup_done.txt ] && break; sleep 1; done; if [ ! -f /setup_done.txt ]; then echo "setup did not complete"; exit 1; fi; ansible-playbook -i "localhost," --connection=local /app/tests/run_tests.yml';
            } else {
                // Native V2: Run Jest on changed files
                testCommand = `npm rebuild canvas && npm test -- -o`;
            }
        }

        const config: BenchmarkConfig = {
            testCommand,
            agent: args.agent,
            model: args.model,
            provider: args.provider,
            verbose: args.verbose,
            useDocker,
            version: agentVersion,
            showProgress: args.showProgress,
            timeout: args.timeout,
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

            // Always refresh leaderboard after saving results.
            console.log('🔄 Updating leaderboard...');
            const generator = new LeaderboardGenerator();
            await generator.generateLeaderboard();
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


    private selectExercises(args: CLIArgs, allExercises: string[]): string[] {
        if (args.specificExercise) {
            if (!allExercises.includes(args.specificExercise)) {
                console.error(`❌ Specified problem '${args.specificExercise}' not found`);
                console.log("Use --list option to see available problems");
                process.exit(1);
            }
            console.log(`🎯 Specified problem: ${args.specificExercise}\n`);
            return [args.specificExercise];
        } else if (args.exerciseList && args.exerciseList.length > 0) {
            const invalidExercises = args.exerciseList.filter(ex => !allExercises.includes(ex));
            if (invalidExercises.length > 0) {
                console.error(`❌ Invalid problem(s): ${invalidExercises.join(', ')}`);
                console.log("Use --list option to see available problems");
                process.exit(1);
            }
            console.log(`📋 Selected problems: ${args.exerciseList.join(', ')} (${args.exerciseList.length} problems)\n`);
            return args.exerciseList;
        } else if (args.exerciseCount) {
            const count = Math.min(args.exerciseCount, allExercises.length);
            console.log(`🔢 Number of problems: ${count} (out of ${allExercises.length})\n`);
            return allExercises.slice(0, count);
        } else {
            // Default: run only the first available exercise
            console.log(`📊 Found problems: ${allExercises.length} (testing only the first one)\n`);
            return allExercises.slice(0, 1);
        }
    }
}
