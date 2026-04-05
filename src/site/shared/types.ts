export interface ResultEntry {
    exercise: string;
    agentSuccess: boolean;
    testSuccess: boolean;
    overallSuccess: boolean;
    agentError?: string;
    testError?: string;
    agentDuration: number;
    testDuration: number;
    totalDuration: number;
    tokenUsage?: {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
        cost?: number;
    };
}

export interface SavedResult {
    metadata: {
        agent: string;
        model: string;
        provider: string;
        version?: string;
        timestamp: string;
        exerciseCount?: number;
        benchmarkVersion?: string;
        generatedBy?: string;
        runUrl?: string;
        runId?: string;
        artifactName?: string;
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
        totalInputTokens?: number;
        totalOutputTokens?: number;
        totalTokens?: number;
        totalCost?: number;
    };
    tier?: { tier: string; label: string; solved: number; total: number };
    results: ResultEntry[];
}

export interface LeaderboardData {
    lastUpdated: string;
    results: Record<string, SavedResult>;
}

export interface LeaderboardEntry {
    key: string;
    data: SavedResult;
}

export const TIER_RANK = { S: 0, A: 1, B: 2, C: 3, D: 4, F: 5 } as const;
export const TIERS = ['S', 'A', 'B', 'C', 'D', 'F'] as const;
export const V2_DEFAULT_TASKS = ['14958', '15815_1', '15193', '14268', '20079'] as const;
export const V2_TOTAL = V2_DEFAULT_TASKS.length;
