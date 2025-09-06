import type { TestResult, BenchmarkConfig, CLIArgs } from '../config/types';
import { ExerciseReader } from '../exercises/reader';
import { ExerciseRunner } from '../runners/exercise';
import { BenchmarkReporter } from './reporter';
import { LeaderboardGenerator } from '../utils/leaderboard-generator';
import { VersionDetector } from '../utils/version-detector';
import type { PushConfig } from '../utils/result-pusher';

export class BenchmarkRunner {
    constructor(
        private exerciseReader: ExerciseReader,
        private exerciseRunner: ExerciseRunner,
        private reporter: BenchmarkReporter
    ) {}

    async run(args: CLIArgs): Promise<void> {
        if (args.generateLeaderboard || args.updateLeaderboard) {
            const generator = new LeaderboardGenerator();
            await generator.generateLeaderboard();
            return;
        }
        
        const allExercises = await this.exerciseReader.getExercises();

        if (args.listExercises) {
            this.printExerciseList(allExercises);
            return;
        }

        console.log("🚀 Starting Exercism TypeScript benchmark");
        console.log(`📋 Solving TypeScript problems with ${args.agent} agent (${args.model} model)\n`);

        let agentVersion = args.version;
        if (!agentVersion) {
            console.log(`🔍 Detecting ${args.agent} version...`);
            const versionDetector = new VersionDetector();
            agentVersion = await versionDetector.detectAgentVersion(args.agent);
            console.log(`📦 Detected ${args.agent} version: ${agentVersion}\n`);
        } else {
            console.log(`📦 Using specified ${args.agent} version: ${agentVersion}\n`);
        }

        const exercises = this.selectExercises(args, allExercises);
        const results: TestResult[] = [];

        const config: BenchmarkConfig = {
            testCommand: 'corepack yarn && corepack yarn test',
            agent: args.agent,
            model: args.model,
            provider: args.provider,
            verbose: args.verbose,
            useDocker: args.useDocker,
            version: agentVersion,
            showProgress: args.showProgress,
            timeout: args.timeout,
            outputDir: args.outputDir
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

        // JSON output - only if save_result is enabled to avoid creating directories unnecessarily
        if (args.outputFormat === 'json' && args.saveResult) {
            const outputPath = this.generateOutputPath(args, 'json');
            await this.reporter.exportToJSON(results, config, outputPath);
        }

        // Save result if requested
        if (args.saveResult) {
            const resultDir = args.resultDir || './data/results';
            
            await this.reporter.saveResult(results, config, resultDir, args.resultName);
            
            // Update leaderboard if requested (and not already handled above)
            if (args.updateLeaderboard) {
                console.log('🔄 Updating leaderboard...');
                const generator = new LeaderboardGenerator();
                await generator.generateLeaderboard();
            }
        }
    }

    private generateOutputPath(args: CLIArgs, extension: string): string {
        const outputDir = args.outputDir || './results';
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `benchmark-${args.agent}-${args.model}-${timestamp}.${extension}`;
        return `${outputDir}/${filename}`;
    }

    private printExerciseList(exercises: string[]): void {
        console.log("📋 Available Exercism problems:");
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
