import type { CLIArgs, AgentType, ProviderType } from '../config/types';

export function printHelp(): void {
    console.log(`
CLI Agents Benchmark - AI coding agent comparison tool

Usage:
  bun src/index.ts [options]

Basic Options:
  --agent <agent>        Agent to use (claude, goose, aider, codex, copilot, gemini, opencode, qwen, cursor, kimi) [default: claude]
  --model <model>        Model to use [default: sonnet]
  --provider <provider>  Provider (openai, anthropic, google, openrouter, dashscope, xai, deepseek, github, moonshot) [default: openai; kimi defaults to moonshot]
  --version <version>    Agent version (e.g. 1.2.3) [default: agent-specific default]
  --verbose              Show detailed output
  --list                 List available exercises

Exercise Selection:
  --exercise <name>      Run specific exercise
  --exercise <number>    Run first N exercises
  --exercise <list>      Run multiple exercises (comma-separated)
  --exercism-path <path> Path to exercism practice directory [default: exercism/typescript]

Execution Options:
  --docker               Use Docker containers for agent execution [default: local execution]
  --show-progress        Show real-time progress during agent execution
  --test-only            Run tests only on current code (skip agent execution)
  --print-instructions   Print instructions that would be sent to the agent (dry run)
  --custom-instruction   Add custom instruction to the end of the prompt
  --timeout <seconds>    Per-exercise timeout in seconds [default: 300]

Output Options:
  --output-format <fmt>  Output format (console, json) [default: console]
  --output-dir <dir>     Output directory for files
  --export-web           Export web-compatible data structure
  --all-agents           Run benchmark for all agents (future feature)

Result Saving:
  --save-result          Save benchmark results to file (automatically refreshes leaderboard)
  --result-name <name>   Custom name for result file (auto-generated if not specified)
  --result-dir <dir>     Directory to save results [default: ./data/results]

Batch Execution:
  --batch <number>       Run specific batch (1-5, for parallel execution)
  --total-batches <num>  Total number of batches [default: 5]

Examples:
  bun src/index.ts --agent claude --model sonnet
  bun src/index.ts --agent claude --export-web --output-dir ./public/data
  bun src/index.ts --output-format json --output-dir ./results
  bun src/index.ts --exercise acronym,anagram,bank-account
  bun src/index.ts --list
  bun src/index.ts --agent claude --model sonnet --save-result
  bun src/index.ts --agent goose --model gemini --save-result
  bun src/index.ts --agent claude --model sonnet --version 1.2.3 --save-result
  bun src/index.ts --agent kimi --provider moonshot --model kimi-k2.5 --save-result
  bun src/index.ts --print-instructions --   acronym      # Show instructions for specific exercise

Help:
  --help                 Show this help message
`);
}

export async function parseCommandLineArgs(): Promise<CLIArgs> {
    const modelIndex = process.argv.indexOf('--model');
    const model = modelIndex !== -1 && modelIndex + 1 < process.argv.length
        ? process.argv[modelIndex + 1]!
        : 'sonnet';

    const agentIndex = process.argv.indexOf('--agent');
    const agent = (agentIndex !== -1 && agentIndex + 1 < process.argv.length
        ? process.argv[agentIndex + 1]!
        : 'claude') as AgentType;

    const providerIndex = process.argv.indexOf('--provider');
    const provider = (providerIndex !== -1 && providerIndex + 1 < process.argv.length
        ? process.argv[providerIndex + 1]!
        : (agent === 'kimi' ? 'moonshot' : 'openai')) as ProviderType;

    const verbose = process.argv.includes('--verbose');
    const listExercises = process.argv.includes('--list');

    // New output options
    const outputFormatIndex = process.argv.indexOf('--output-format');
    const outputFormat = outputFormatIndex !== -1 && outputFormatIndex + 1 < process.argv.length
        ? process.argv[outputFormatIndex + 1]! as 'console' | 'json'
        : 'console';

    const outputDirIndex = process.argv.indexOf('--output-dir');
    const outputDir = outputDirIndex !== -1 && outputDirIndex + 1 < process.argv.length
        ? process.argv[outputDirIndex + 1]!
        : undefined;

    const exportWeb = process.argv.includes('--export-web');
    const allAgents = process.argv.includes('--all-agents');

    // Batch execution options
    const batchIndex = process.argv.indexOf('--batch');
    const batch = batchIndex !== -1 && batchIndex + 1 < process.argv.length
        ? parseInt(process.argv[batchIndex + 1]!, 10)
        : undefined;

    const totalBatchesIndex = process.argv.indexOf('--total-batches');
    const totalBatches = totalBatchesIndex !== -1 && totalBatchesIndex + 1 < process.argv.length
        ? parseInt(process.argv[totalBatchesIndex + 1]!, 10)
        : 5;

    const exercismPathIndex = process.argv.indexOf('--exercism-path');
    const exercismPath = exercismPathIndex !== -1 && exercismPathIndex + 1 < process.argv.length
        ? process.argv[exercismPathIndex + 1]!
        : undefined;

    const useDocker = process.argv.includes('--docker');
    const showProgress = process.argv.includes('--show-progress');
    const testOnly = process.argv.includes('--test-only');
    const printInstructions = process.argv.includes('--print-instructions');
    
    // Timeout option (seconds), default 300
    const timeoutIndex = process.argv.indexOf('--timeout');
    const timeout = timeoutIndex !== -1 && timeoutIndex + 1 < process.argv.length
        ? parseInt(process.argv[timeoutIndex + 1]!, 10)
        : 300;

    // Result saving options
    const saveResult = process.argv.includes('--save-result');
    
    const resultNameIndex = process.argv.indexOf('--result-name');
    const resultName = resultNameIndex !== -1 && resultNameIndex + 1 < process.argv.length
        ? process.argv[resultNameIndex + 1]!
        : undefined;
    
    const resultDirIndex = process.argv.indexOf('--result-dir');
    const resultDir = resultDirIndex !== -1 && resultDirIndex + 1 < process.argv.length
        ? process.argv[resultDirIndex + 1]!
        : undefined;

    const versionIndex = process.argv.indexOf('--version');
    const version = versionIndex !== -1 && versionIndex + 1 < process.argv.length
        ? process.argv[versionIndex + 1]!
        : undefined;

    const customInstructionIndex = process.argv.indexOf('--custom-instruction');
    const customInstruction = customInstructionIndex !== -1 && customInstructionIndex + 1 < process.argv.length
        ? process.argv[customInstructionIndex + 1]!
        : undefined;

    const exerciseIndex = process.argv.indexOf('--exercise');
    let specificExercise = exerciseIndex !== -1 && exerciseIndex + 1 < process.argv.length
        ? process.argv[exerciseIndex + 1]!
        : null;

    let exerciseCount: number | null = null;
    let exerciseList: string[] | undefined = undefined;
    
    // Use TOP_25_EXERCISES by default
    if (!specificExercise) {
        const { TOP_25_EXERCISES } = await import('../config/constants');
        exerciseList = TOP_25_EXERCISES.split(',').map(ex => ex.trim());
    }

    if (specificExercise) {
        if (/^\d+$/.test(specificExercise)) {
            // Numeric case: run first N exercises
            exerciseCount = parseInt(specificExercise, 10);
            specificExercise = null;
        } else if (specificExercise.includes(',')) {
            // Comma-separated case: specify multiple exercises
            exerciseList = specificExercise.split(',').map(ex => {
                const trimmed = ex.trim();
                return trimmed.includes('/') ? trimmed.split('/').pop()! || trimmed : trimmed;
            }).filter(ex => ex.length > 0);
            specificExercise = null;
        } else if (specificExercise.includes('/')) {
            // Path format case: extract exercise name
            specificExercise = specificExercise.split('/').pop()! || null;
        }
    }

    const result: CLIArgs = {
        model,
        agent,
        provider,
        verbose,
        specificExercise,
        exerciseCount,
        exerciseList,
        listExercises,
        outputFormat,
        outputDir,
        exportWeb,
        allAgents,
        exercismPath,
        batch,
        totalBatches,
        useDocker,
        saveResult,
        resultName,
        resultDir,
        version,
        showProgress,
        testOnly,
        printInstructions,
        customInstruction,
        timeout
    };
    return result;
}
