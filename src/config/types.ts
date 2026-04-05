import type { DatasetType, ProviderType } from './base-types';
import type { AgentType } from '../agents/registry';
export type { DatasetType, ProviderType, AgentType };
export { AGENT_DEFAULT_PROVIDER } from '../agents/registry';

export interface AgentResult {
    exercise: string;
    success: boolean;
    error?: string;
    duration: number;
    output?: string;
}

export interface TestResult {
    exercise: string;
    agentSuccess: boolean;
    testSuccess: boolean;
    overallSuccess: boolean;
    agentError?: string;
    testError?: string;
    agentDuration: number;
    testDuration: number;
    totalDuration: number;
}

export interface TestOnlyResult {
    exercise: string;
    testSuccess: boolean;
    testError?: string;
    testDuration: number;
    output?: string;
}

export interface BenchmarkConfig {
    testCommand: string;
    agent: AgentType;
    model: string;
    provider: ProviderType;
    verbose: boolean;
    useDocker?: boolean;
    dataset?: DatasetType;
    version?: string;
    showProgress?: boolean;
    timeout?: number; // seconds
    outputDir?: string;
}

export interface CLIArgs {
    model: string;
    agent: AgentType;
    provider: ProviderType;
    verbose: boolean;
    /** v1 Exercism only */
    specificExercise: string | null;
    exerciseCount: number | null;
    exerciseList?: string[];
    /** v2 SWE-Lancer only: single task id (e.g. 6883, 16912_4) */
    specificTask: string | null;
    taskList?: string[];
    taskLimit: number | null;
    listExercises: boolean;
    dataset?: DatasetType;
    outputFormat?: 'console' | 'json';
    outputDir?: string;
    exportWeb?: boolean;
    allAgents?: boolean;
    exercismPath?: string;
    batch?: number;
    totalBatches?: number;
    useDocker?: boolean;
    saveResult?: boolean;
    /** When true with --save-result, skip regenerating public leaderboard (for parallel CI shards) */
    skipLeaderboardRefresh?: boolean;
    resultName?: string;
    resultDir?: string;
    version?: string;
    showProgress?: boolean;
    testOnly?: boolean;
    printInstructions?: boolean;
    customInstruction?: string;
    timeout?: number; // seconds
}


export type OutputFormat = 'console' | 'json';
