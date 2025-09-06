import type { TestResult, BenchmarkConfig } from '../config/types';
import { formatDuration } from '../utils/duration';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';

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

    private printErrors(results: TestResult[]): void {
        const failedResults = results.filter(r => !r.overallSuccess);
        if (failedResults.length > 0) {
            console.log("\n🔍 Errors for failed problems:");
            failedResults.forEach(result => {
                console.log(`  ❌ ${result.exercise}:`);
                if (result.agentError) {
                    console.log(`     🤖 Agent: ${result.agentError.slice(0, 500)}${result.agentError.length > 500 ? '...' : ''}`);
                }
                if (result.testError) {
                    console.log(`     🧪 Test: ${result.testError.slice(0, 500)}${result.testError.length > 500 ? '...' : ''}`);
                }
            });
        }
    }

    // JSON export functionality
    async exportToJSON(results: TestResult[], config: BenchmarkConfig, outputPath: string): Promise<void> {
        const data = this.generateBasicJSONData(results, config);
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


    private generateBasicJSONData(results: TestResult[], config: BenchmarkConfig) {
        const successCount = results.filter(r => r.overallSuccess).length;
        const totalCount = results.length;
        const successRate = (successCount / totalCount) * 100;
        const totalDuration = results.reduce((sum, r) => sum + r.totalDuration, 0);
        const avgDuration = totalDuration / results.length;
        const agentSuccessCount = results.filter(r => r.agentSuccess).length;
        const testSuccessCount = results.filter(r => r.testSuccess).length;
        const testFailedCount = totalCount - testSuccessCount;

        return {
            metadata: {
                timestamp: new Date().toISOString(),
                agent: config.agent,
                model: config.model,
                provider: config.provider,
                version: config.version,
                totalExercises: totalCount,
                benchmarkVersion: "1.0.0"
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
        const fileName = resultName || `${config.agent}-${config.model}-${config.provider}-${timestamp.replace(/[:.]/g, '-').slice(0, -5)}`;
        const fullPath = join(outputPath, `${fileName}.json`);
        
        const data = {
            metadata: {
                agent: config.agent,
                model: config.model,
                provider: config.provider,
                version: config.version,
                timestamp,
                exerciseCount: results.length,
                benchmarkVersion: "1.0.0",
                generatedBy: "ts-bench"
            },
            summary: this.generateSummaryData(results),
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
