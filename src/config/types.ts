export type AgentType = 'claude' | 'goose' | 'aider' | 'codex' | 'gemini' | 'opencode' | 'qwen' | 'cursor';
export type ProviderType = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'dashscope' | 'xai' | 'deepseek';

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
    specificExercise: string | null;
    exerciseCount: number | null;
    exerciseList?: string[];
    listExercises: boolean;
    outputFormat?: 'console' | 'json';
    outputDir?: string;
    exportWeb?: boolean;
    allAgents?: boolean;
    exercismPath?: string;
    batch?: number;
    totalBatches?: number;
    useDocker?: boolean;
    saveResult?: boolean;
    resultName?: string;
    resultDir?: string;
    generateLeaderboard?: boolean;
    updateLeaderboard?: boolean;
    version?: string;
    showProgress?: boolean;
    testOnly?: boolean;
    printInstructions?: boolean;
    customInstruction?: string;
    timeout?: number; // seconds
    pushResults?: boolean;
}


export type OutputFormat = 'console' | 'json';
