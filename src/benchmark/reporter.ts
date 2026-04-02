import type { TestResult, BenchmarkConfig } from '../config/types';
import { formatDuration } from '../utils/duration';
import { getPackageVersion } from '../utils/package-version';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { sanitizeFilenameSegment } from '../utils/file-name';
import { V2_DEFAULT_TASKS, V2_TIER_THRESHOLDS } from '../config/constants';

export class BenchmarkReporter {
    printResults(results: TestResult[]): void {
        const successCount = results.filter(r => r.overallSuccess).length;
        const totalCount = results.length;
        const successRate = (successCount / totalCount) * 100;
        const totalDuration = results.reduce((sum, r) => sum + r.totalDuration, 0);
        const avgDuration = totalDuration / results.length;
        const agentSuccessCount = results.filter(r => r.agentSuccess).length;
        const testSuccessCount = results.filter(r => r.testSuccess).length;
        const testFailedCount = totalCount - testSuccessCount;

        console.log("\n" + "=".repeat(50));
        console.log("📈 Benchmark Results");
        console.log("=".repeat(50));
        console.log(`🎯 Success Rate: ${successRate.toFixed(1)}% (${successCount}/${totalCount})`);
        console.log(`⏱️  Total Duration: ${formatDuration(totalDuration)}`);
        console.log(`⏱️  Average Duration: ${formatDuration(avgDuration)}`);
        console.log(`🤖 Agent Success: ${agentSuccessCount}`);
        console.log(`✅ Test Success: ${testSuccessCount}`);
        console.log(`❌ Test Failed: ${testFailedCount}`);

        this.printDetailedResults(results);
        this.printTier(results);
        this.printErrors(results);
    }

    private printDetailedResults(results: TestResult[]): void {
        console.log("\n📝 Detailed Results:");
        results.forEach(result => {
            const overallStatus = result.overallSuccess ? "✅" : "❌";
            const agentStatus = result.agentSuccess ? "🤖" : "❌";
            const testStatus = result.testSuccess ? "🧪" : "❌";
            const duration = formatDuration(result.totalDuration);
            console.log(`  ${overallStatus} ${result.exercise.padEnd(25)} ${duration} (${agentStatus}${testStatus})`);
        });
    }

    /**
     * Print tier rating when running the default v2 benchmark set.
     * Compares solved task IDs against V2_DEFAULT_TASKS.
     */
    private printTier(results: TestResult[]): void {
        const defaultIds = new Set(V2_DEFAULT_TASKS.split(',').map(t => t.trim()));
        const resultIds = new Set(results.map(r => r.exercise));

        // Only show tier when all default tasks are present in the results
        const isDefaultSet = defaultIds.size > 0
            && [...defaultIds].every(id => resultIds.has(id));
        if (!isDefaultSet) return;

        const successCount = results
            .filter(r => defaultIds.has(r.exercise) && r.overallSuccess)
            .length;

        const entry = V2_TIER_THRESHOLDS.find(t => successCount >= t.minCorrect);
        if (entry) {
            console.log(`\n${'='.repeat(50)}`);
            console.log(`Tier ${entry.tier}  (${entry.label})`);
            console.log(`${'='.repeat(50)}`);
        }
    }

    private printErrors(results: TestResult[]): void {
        const failedResults = results.filter(r => !r.overallSuccess);
        if (failedResults.length > 0) {
            console.log("\n🔍 Errors for failed problems:");
            failedResults.forEach(result => {
                console.log(`  ❌ ${result.exercise}:`);
                if (result.agentError) {
                    console.log(`     🤖 Agent: ${result.agentError.slice(-3000)}`);
                }
                if (result.testError) {
                    console.log(`     🧪 Test: ${result.testError.slice(-3000)}`);
                }
            });
        }
    }

    // JSON export functionality
    async exportToJSON(results: TestResult[], config: BenchmarkConfig, outputPath: string): Promise<void> {
        const data = await this.generateBasicJSONData(results, config);
        await this.ensureDirectoryExists(outputPath);
        await writeFile(outputPath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`📄 Results exported to: ${outputPath}`);
    }

    // Leaderboard format output functionality
    printLeaderboard(results: TestResult[], config: BenchmarkConfig): void {
        const successCount = results.filter(r => r.overallSuccess).length;
        const totalCount = results.length;
        const successRate = (successCount / totalCount) * 100;
        const totalDuration = results.reduce((sum, r) => sum + r.totalDuration, 0);
        const avgDuration = totalDuration / results.length;
        const agentSuccessCount = results.filter(r => r.agentSuccess).length;
        const testSuccessCount = results.filter(r => r.testSuccess).length;
        const testFailedCount = totalCount - testSuccessCount;

        console.log("\n" + "=".repeat(80));
        console.log("🏆 LEADERBOARD");
        console.log("=".repeat(80));
        console.log("Agent\t\tVersion\t\tModel\t\tProvider\tSuccess Rate\tTotal Time\tAvg Time\tAgent Success\tTest Success\tTest Failed");
        console.log("-".repeat(80));
        
        const version = config.version ?? 'unknown';
        console.log(`${config.agent}\t\t${version}\t\t${config.model}\t\t${config.provider}\t${successRate.toFixed(1)}%\t\t${formatDuration(totalDuration)}\t\t${formatDuration(avgDuration)}\t${agentSuccessCount}\t\t${testSuccessCount}\t\t${testFailedCount}`);
    }


    private async generateBasicJSONData(results: TestResult[], config: BenchmarkConfig) {
        const successCount = results.filter(r => r.overallSuccess).length;
        const totalCount = results.length;
        const successRate = (successCount / totalCount) * 100;
        const totalDuration = results.reduce((sum, r) => sum + r.totalDuration, 0);
        const avgDuration = totalDuration / results.length;
        const agentSuccessCount = results.filter(r => r.agentSuccess).length;
        const testSuccessCount = results.filter(r => r.testSuccess).length;
        const testFailedCount = totalCount - testSuccessCount;

        const benchmarkVersion = await getPackageVersion();

        return {
            metadata: {
                timestamp: new Date().toISOString(),
                agent: config.agent,
                model: config.model,
                provider: config.provider,
                version: config.version,
                totalExercises: totalCount,
                benchmarkVersion
            },
            summary: {
                successRate: Number(successRate.toFixed(1)),
                totalDuration: Number(totalDuration.toFixed(1)),
                avgDuration: Number(avgDuration.toFixed(1)),
                successCount,
                totalCount,
                agentSuccessCount,
                testSuccessCount,
                testFailedCount
            },
            results
        };
    }



    // Save benchmark result to file with metadata
    async saveResult(results: TestResult[], config: BenchmarkConfig, outputPath: string, resultName?: string): Promise<void> {
        const timestamp = new Date().toISOString();
        const safeAgent = sanitizeFilenameSegment(config.agent, 'agent');
        const safeModel = sanitizeFilenameSegment(config.model, 'model');
        const safeProvider = sanitizeFilenameSegment(config.provider, 'provider');
        const rawTimestamp = timestamp.replace(/[:.]/g, '-').replace(/Z$/, '');
        const safeTimestamp = sanitizeFilenameSegment(rawTimestamp, 'timestamp');

        const resolvedResultName = resultName && resultName.endsWith('.json')
            ? resultName.slice(0, -5)
            : resultName;

        const baseName = resolvedResultName
            ? sanitizeFilenameSegment(resolvedResultName, 'result')
            : `${safeAgent}-${safeModel}-${safeProvider}-${safeTimestamp}`;

        const fullPath = join(outputPath, `${baseName}.json`);
        
        const benchmarkVersion = await getPackageVersion();
        
        const summary = this.generateSummaryData(results);
        const tier = this.computeTier(results);

        const data = {
            metadata: {
                agent: config.agent,
                model: config.model,
                provider: config.provider,
                version: config.version,
                timestamp,
                exerciseCount: results.length,
                benchmarkVersion,
                generatedBy: "ts-bench"
            },
            summary,
            ...(tier ? { tier } : {}),
            results
        };
        
        await this.ensureDirectoryExists(fullPath);
        await writeFile(fullPath, JSON.stringify(data, null, 2), 'utf-8');
        
        // Update latest.json symlink
        const latestPath = join(outputPath, 'latest.json');
        await writeFile(latestPath, JSON.stringify(data, null, 2), 'utf-8');
        
        console.log(`💾 Results saved to: ${fullPath}`);
        console.log(`🔗 Latest results updated: ${latestPath}`);
    }
    
    /**
     * Compute tier rating for saved JSON when running the default v2 set.
     * Returns `undefined` when the result set doesn't match the default tasks.
     */
    private computeTier(results: TestResult[]): { tier: string; label: string; solved: number; total: number } | undefined {
        const defaultIds = new Set(V2_DEFAULT_TASKS.split(',').map(t => t.trim()));
        const resultIds = new Set(results.map(r => r.exercise));
        const isDefaultSet = defaultIds.size > 0
            && [...defaultIds].every(id => resultIds.has(id));
        if (!isDefaultSet) return undefined;

        const solved = results
            .filter(r => defaultIds.has(r.exercise) && r.overallSuccess)
            .length;
        const entry = V2_TIER_THRESHOLDS.find(t => solved >= t.minCorrect);
        if (!entry) return undefined;
        return { tier: entry.tier, label: entry.label, solved, total: defaultIds.size };
    }

    private generateSummaryData(results: TestResult[]) {
        const successCount = results.filter(r => r.overallSuccess).length;
        const totalCount = results.length;
        const successRate = (successCount / totalCount) * 100;
        const totalDuration = results.reduce((sum, r) => sum + r.totalDuration, 0);
        const avgDuration = totalDuration / results.length;
        const agentSuccessCount = results.filter(r => r.agentSuccess).length;
        const testSuccessCount = results.filter(r => r.testSuccess).length;
        const testFailedCount = totalCount - testSuccessCount;
        
        return {
            successRate: Number(successRate.toFixed(1)),
            totalDuration: Number(totalDuration.toFixed(1)),
            avgDuration: Number(avgDuration.toFixed(1)),
            successCount,
            totalCount,
            agentSuccessCount,
            testSuccessCount,
            testFailedCount
        };
    }

    private async ensureDirectoryExists(filePath: string): Promise<void> {
        const dir = dirname(filePath);
        try {
            await mkdir(dir, { recursive: true });
        } catch (error) {
            // Directory already exists or other error
        }
    }
}
