import type { TestResult, BenchmarkConfig } from '../config/types';
import type { AgentType } from '../config/types';
import { VersionDetector } from './version-detector';
import { getPackageVersion } from './package-version';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

interface SavedBenchmarkResult {
    metadata: {
        agent: string;
        model: string;
        provider: string;
        version?: string;
        timestamp: string;
        exerciseCount: number;
        benchmarkVersion: string;
        generatedBy: string;
    };
    summary: {
        successRate: number;
        totalDuration: number;
        avgDuration: number;
        successCount: number;
        totalCount: number;
        agentSuccessCount: number;
        testSuccessCount: number;
        testFailedCount: number;
    };
    results: TestResult[];
}

interface LeaderboardEntry {
    id: number;
    agent: string;
    version: string;
    model: string;
    provider: string;
    successRate: number;
    avgExecutionTime: number;  // in minutes
    totalExecutionTime: number; // in minutes
    problemsSolved: number;
    totalProblems: number;
    rank: number;
    lastUpdated: string;
}

interface LeaderboardOutput {
    metadata: {
        timestamp: string;
        totalExercises: number;
        benchmarkVersion: string;
        generatedBy: string;
    };
    leaderboard: LeaderboardEntry[];
    detailedResults: Record<string, {
        metadata: {
            agentName: string;
            model: string;
            provider: string;
            timestamp: string;
            totalExercises: number;
        };
        summary: {
            successRate: number;
            avgDuration: number;
            solvedCount: number;
            failedCount: number;
        };
        exerciseResults: TestResult[];
        categoryBreakdown: Record<string, {
            successRate: number;
            avgDuration: number;
            exerciseCount: number;
        }>;
    }>;
    exerciseBreakdown: Array<{
        exerciseName: string;
        agentResults: Record<string, {
            success: boolean;
            duration: number;
            error?: string;
        }>;
    }>;
}

export class LeaderboardGenerator {
    constructor(
        private resultsDir: string = './data/results',
        private outputPath: string = './public/data/latest-results.json'
    ) {}

    async generateLeaderboard(): Promise<void> {
        console.log('🏆 Generating leaderboard from data/results/...');
        
        // Read all result files
        const resultFiles = await this.readAllResultFiles();
        
        if (resultFiles.length === 0) {
            console.log('❌ No result files found in data/results/');
            return;
        }
        
        console.log(`📁 Found ${resultFiles.length} result files`);
        
        // Get latest result for each agent+model+provider combination
        const latestResults = this.getLatestResults(resultFiles);
        
        console.log(`🔄 Using ${latestResults.size} latest results`);
        
        // Generate leaderboard data
        const leaderboardData = await this.generateLeaderboardData(Array.from(latestResults.values()));
        
        // Save to output file
        await this.saveLeaderboard(leaderboardData);
        
        console.log(`✅ Leaderboard generated: ${this.outputPath}`);
    }

    private async readAllResultFiles(): Promise<SavedBenchmarkResult[]> {
        if (!existsSync(this.resultsDir)) {
            return [];
        }
        
        const files = await readdir(this.resultsDir);
        const jsonFiles = files.filter(file => file.endsWith('.json') && file !== 'latest.json');
        
        const results: SavedBenchmarkResult[] = [];
        
        for (const file of jsonFiles) {
            try {
                const filePath = join(this.resultsDir, file);
                const content = await readFile(filePath, 'utf-8');
                const data = JSON.parse(content) as SavedBenchmarkResult;
                
                // Basic validation
                if (data.metadata && data.summary && data.results) {
                    results.push(data);
                }
            } catch (error) {
                console.warn(`⚠️  Failed to read ${file}: ${error}`);
            }
        }
        
        return results;
    }

    private getLatestResults(results: SavedBenchmarkResult[]): Map<string, SavedBenchmarkResult> {
        const latestMap = new Map<string, SavedBenchmarkResult>();
        
        for (const result of results) {
            const key = `${result.metadata.agent}-${result.metadata.model}-${result.metadata.provider}`;
            
            if (!latestMap.has(key) || 
                new Date(result.metadata.timestamp) > new Date(latestMap.get(key)!.metadata.timestamp)) {
                latestMap.set(key, result);
            }
        }
        
        return latestMap;
    }

    private async generateLeaderboardData(results: SavedBenchmarkResult[]): Promise<LeaderboardOutput> {
        // Generate leaderboard entries
        const versionCache = new Map<string, string>();
        const detector = new VersionDetector();
        const leaderboardEntries: LeaderboardEntry[] = [];

        for (const result of results) {
            const avgExecutionTime = Number((result.summary.avgDuration / 60000).toFixed(2));
            const totalExecutionTime = Number((avgExecutionTime * result.summary.successCount).toFixed(2));

            let version: string = result.metadata.version || 'unknown';
            if (!result.metadata.version) {
                const agentKey = result.metadata.agent.toLowerCase();
                if (versionCache.has(agentKey)) {
                    version = versionCache.get(agentKey)!;
                } else {
                    version = await this.extractVersion(agentKey as AgentType, detector);
                    versionCache.set(agentKey, version);
                }
            }

            leaderboardEntries.push({
                id: 0, // Will be set after sorting
                agent: this.capitalizeAgent(result.metadata.agent),
                version: version || 'unknown',
                model: result.metadata.model,
                provider: this.capitalizeProvider(result.metadata.provider),
                successRate: result.summary.successRate,
                avgExecutionTime,
                totalExecutionTime,
                problemsSolved: result.summary.successCount,
                totalProblems: result.summary.totalCount,
                rank: 0, // Will be set after sorting
                lastUpdated: (result.metadata.timestamp?.split('T')[0] ?? new Date().toISOString().split('T')[0]) as string
            });
        }
        
        // Sort by success rate (descending), then by average execution time (ascending)
        leaderboardEntries.sort((a, b) => {
            if (b.successRate !== a.successRate) {
                return b.successRate - a.successRate;
            }
            return a.avgExecutionTime - b.avgExecutionTime;
        });
        
        // Assign ranks and IDs
        leaderboardEntries.forEach((entry, index) => {
            entry.id = index + 1;
            entry.rank = index + 1;
        });
        
        // Generate detailed results
        const detailedResults: Record<string, any> = {};
        results.forEach(result => {
            const key = `${result.metadata.agent}-${result.metadata.model}`;
            detailedResults[key] = {
                metadata: {
                    agentName: result.metadata.agent,
                    model: result.metadata.model,
                    provider: result.metadata.provider,
                    timestamp: result.metadata.timestamp,
                    totalExercises: result.metadata.exerciseCount
                },
                summary: {
                    successRate: result.summary.successRate,
                    avgDuration: result.summary.avgDuration,
                    solvedCount: result.summary.successCount,
                    failedCount: result.summary.totalCount - result.summary.successCount
                },
                exerciseResults: result.results,
                categoryBreakdown: {
                    general: {
                        successRate: result.summary.successRate,
                        avgDuration: result.summary.avgDuration,
                        exerciseCount: result.summary.totalCount
                    }
                }
            };
        });
        
        // Generate exercise breakdown
        const exerciseBreakdown = this.generateExerciseBreakdown(results);
        
        const benchmarkVersion = await getPackageVersion();
        
        return {
            metadata: {
                timestamp: new Date().toISOString(),
                totalExercises: results.length > 0 ? results[0]!.summary.totalCount : 0,
                benchmarkVersion,
                generatedBy: "ts-bench"
            },
            leaderboard: leaderboardEntries,
            detailedResults,
            exerciseBreakdown
        };
    }

    private generateExerciseBreakdown(results: SavedBenchmarkResult[]): Array<{
        exerciseName: string;
        agentResults: Record<string, { success: boolean; duration: number; error?: string; }>;
    }> {
        const exerciseMap = new Map<string, Record<string, { success: boolean; duration: number; error?: string; }>>();
        
        results.forEach(result => {
            const agentKey = `${result.metadata.agent}-${result.metadata.model}`;
            
            result.results.forEach(exerciseResult => {
                if (!exerciseMap.has(exerciseResult.exercise)) {
                    exerciseMap.set(exerciseResult.exercise, {});
                }
                
                exerciseMap.get(exerciseResult.exercise)![agentKey] = {
                    success: exerciseResult.overallSuccess,
                    duration: exerciseResult.totalDuration,
                    error: exerciseResult.agentError || exerciseResult.testError
                };
            });
        });
        
        return Array.from(exerciseMap.entries()).map(([exerciseName, agentResults]) => ({
            exerciseName,
            agentResults
        }));
    }

    private async saveLeaderboard(data: LeaderboardOutput): Promise<void> {
        await this.ensureDirectoryExists(this.outputPath);
        await writeFile(this.outputPath, JSON.stringify(data, null, 2), 'utf-8');
    }

    private async extractVersion(agentName: AgentType, detector: VersionDetector): Promise<string> {
        const detected = await detector.detectAgentVersion(agentName);
        if (!detected) {
            throw new Error(`Version detection returned empty value for agent: ${agentName}`);
        }
        return detected;
    }

    private capitalizeAgent(agent: string): string {
        switch (agent.toLowerCase()) {
            case 'claude': return 'Claude Code';
            case 'codex': return 'Codex CLI';
            case 'goose': return 'Goose CLI';
            case 'aider': return 'Aider';
            case 'gemini': return 'Gemini CLI';
            case 'qwen': return 'Qwen Code';
            case 'cursor': return 'Cursor Agent';
            case 'copilot': return 'GitHub Copilot CLI';
            default: return agent.charAt(0).toUpperCase() + agent.slice(1).toLowerCase();
        }
    }

    private capitalizeProvider(provider: string): string {
        switch (provider.toLowerCase()) {
            case 'openai': return 'OpenAI';
            case 'anthropic': return 'Anthropic';
            case 'google': return 'Google';
            case 'openrouter': return 'OpenRouter';
            case 'github': return 'GitHub';
            default: return provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase();
        }
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
