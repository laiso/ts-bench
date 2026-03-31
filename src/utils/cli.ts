import type { CLIArgs, AgentType, ProviderType } from '../config/types';

export function printHelp(): void {
    console.log(`
CLI Agents Benchmark - AI coding agent comparison tool

Usage:
  bun src/index.ts [options]

Basic Options:
  --agent <agent>        Agent to use (claude, goose, aider, codex, copilot, gemini, opencode, qwen, cursor, kimi) [default: claude]
  --dataset <v1|v2>      Dataset to use (v1: Exercism, v2: SWE-Lancer) [default: v1]
  --model <model>        Model to use [default: sonnet]
  --provider <provider>  Provider (openai, anthropic, google, openrouter, dashscope, xai, deepseek, github, moonshot) [default: openai; kimi defaults to moonshot]
  --version <version>    Agent version (e.g. 1.2.3) [default: agent-specific default]
  --verbose              Show detailed output
  --list                 List available exercises (v1) or tasks (v2)

Exercise selection (v1 / Exercism only):
  --exercise <name>      Run a single exercise by slug
  --exercise <number>    Run first N exercises (by dataset order)
  --exercise <list>      Comma-separated exercise slugs
  --exercism-path <path> Path to exercism practice directory [default: exercism-typescript]

Task selection (v2 / SWE-Lancer only):
  --task <id>            Run one task (e.g. 6883, 16912_4)
  --tasks <id,id,...>    Comma-separated task ids
  --task-limit <n>       Run first N tasks (by CSV order)

Execution Options:
  --docker               Use Docker containers for agent execution [default: local execution; v2 defaults to Docker]
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
  bun src/index.ts --dataset v2 --task 16912_4 --agent cursor --model sonnet
  bun src/index.ts --list
  bun src/index.ts --agent claude --model sonnet --save-result
  bun src/index.ts --agent goose --model gemini --save-result
  bun src/index.ts --agent claude --model sonnet --version 1.2.3 --save-result
  bun src/index.ts --agent kimi --provider moonshot --model kimi-k2.5 --save-result
  bun src/index.ts --print-instructions --   acronym      # v1: show instructions for one exercise

Help:
  --help                 Show this help message
`);
}

export type ParseCliOptions = {
    /**
     * Override process exit (for tests). Must not return.
     */
    exit?: (code: number) => never;
};

/**
 * Parse CLI args from an argv array (defaults to global parsing via {@link parseCommandLineArgs}).
 */
export async function parseCliArgsFromArgv(argv: string[], parseOptions?: ParseCliOptions): Promise<CLIArgs> {
    const die = (msg: string): never => {
        console.error(msg);
        if (parseOptions?.exit) {
            parseOptions.exit(1);
        }
        process.exit(1);
        throw new Error('unreachable');
    };

    const modelIndex = argv.indexOf('--model');
    const model = modelIndex !== -1 && modelIndex + 1 < argv.length
        ? argv[modelIndex + 1]!
        : 'sonnet';

    const agentIndex = argv.indexOf('--agent');
    const agent = (agentIndex !== -1 && agentIndex + 1 < argv.length
        ? argv[agentIndex + 1]!
        : 'claude') as AgentType;

    const datasetIndex = argv.indexOf('--dataset');
    const dataset = (datasetIndex !== -1 && datasetIndex + 1 < argv.length
        ? argv[datasetIndex + 1]!
        : 'v1') as import('../config/types').DatasetType;

    const providerIndex = argv.indexOf('--provider');
    const provider = (providerIndex !== -1 && providerIndex + 1 < argv.length
        ? argv[providerIndex + 1]!
        : (agent === 'kimi' ? 'moonshot' : 'openai')) as ProviderType;

    const verbose = argv.includes('--verbose');
    const listExercises = argv.includes('--list');

    // New output options
    const outputFormatIndex = argv.indexOf('--output-format');
    const outputFormat = outputFormatIndex !== -1 && outputFormatIndex + 1 < argv.length
        ? argv[outputFormatIndex + 1]! as 'console' | 'json'
        : 'console';

    const outputDirIndex = argv.indexOf('--output-dir');
    const outputDir = outputDirIndex !== -1 && outputDirIndex + 1 < argv.length
        ? argv[outputDirIndex + 1]!
        : undefined;

    const exportWeb = argv.includes('--export-web');
    const allAgents = argv.includes('--all-agents');

    // Batch execution options
    const batchIndex = argv.indexOf('--batch');
    const batch = batchIndex !== -1 && batchIndex + 1 < argv.length
        ? parseInt(argv[batchIndex + 1]!, 10)
        : undefined;

    const totalBatchesIndex = argv.indexOf('--total-batches');
    const totalBatches = totalBatchesIndex !== -1 && totalBatchesIndex + 1 < argv.length
        ? parseInt(argv[totalBatchesIndex + 1]!, 10)
        : 5;

    const exercismPathIndex = argv.indexOf('--exercism-path');
    const exercismPath = exercismPathIndex !== -1 && exercismPathIndex + 1 < argv.length
        ? argv[exercismPathIndex + 1]!
        : undefined;

    const useDocker = argv.includes('--docker') || dataset === 'v2';
    const showProgress = argv.includes('--show-progress');
    const testOnly = argv.includes('--test-only');
    const printInstructions = argv.includes('--print-instructions');
    
    // Timeout option (seconds), default 300
    const timeoutIndex = argv.indexOf('--timeout');
    const timeout = timeoutIndex !== -1 && timeoutIndex + 1 < argv.length
        ? parseInt(argv[timeoutIndex + 1]!, 10)
        : 300;

    // Result saving options
    const saveResult = argv.includes('--save-result');
    
    const resultNameIndex = argv.indexOf('--result-name');
    const resultName = resultNameIndex !== -1 && resultNameIndex + 1 < argv.length
        ? argv[resultNameIndex + 1]!
        : undefined;
    
    const resultDirIndex = argv.indexOf('--result-dir');
    const resultDir = resultDirIndex !== -1 && resultDirIndex + 1 < argv.length
        ? argv[resultDirIndex + 1]!
        : undefined;

    const versionIndex = argv.indexOf('--version');
    const version = versionIndex !== -1 && versionIndex + 1 < argv.length
        ? argv[versionIndex + 1]!
        : undefined;

    const customInstructionIndex = argv.indexOf('--custom-instruction');
    const customInstruction = customInstructionIndex !== -1 && customInstructionIndex + 1 < argv.length
        ? argv[customInstructionIndex + 1]!
        : undefined;

    const exerciseIndex = argv.indexOf('--exercise');
    const exerciseArg = exerciseIndex !== -1 && exerciseIndex + 1 < argv.length
        ? argv[exerciseIndex + 1]!
        : null;

    const taskIndex = argv.indexOf('--task');
    const taskArg = taskIndex !== -1 && taskIndex + 1 < argv.length
        ? argv[taskIndex + 1]!
        : null;

    const tasksIndex = argv.indexOf('--tasks');
    const tasksArg = tasksIndex !== -1 && tasksIndex + 1 < argv.length
        ? argv[tasksIndex + 1]!
        : null;

    const taskLimitIndex = argv.indexOf('--task-limit');
    const taskLimitRaw = taskLimitIndex !== -1 && taskLimitIndex + 1 < argv.length
        ? argv[taskLimitIndex + 1]!
        : null;

    if (dataset === 'v1') {
        if (taskArg !== null || tasksArg !== null || taskLimitRaw !== null) {
            die('❌ --task, --tasks, and --task-limit are for --dataset v2 only. Use --exercise for Exercism.');
        }
    } else {
        if (exerciseArg !== null) {
            die('❌ --exercise is for --dataset v1 only. Use --task, --tasks, or --task-limit for v2.');
        }
    }

    let specificExercise: string | null = null;
    let exerciseCount: number | null = null;
    let exerciseList: string[] | undefined = undefined;

    let specificTask: string | null = null;
    let taskList: string[] | undefined = undefined;
    let taskLimit: number | null = null;

    if (dataset === 'v1') {
        specificExercise = exerciseArg;
        if (!specificExercise) {
            const { TOP_25_EXERCISES } = await import('../config/constants');
            exerciseList = TOP_25_EXERCISES.split(',').map(ex => ex.trim());
        }
        if (specificExercise) {
            if (/^\d+$/.test(specificExercise)) {
                exerciseCount = parseInt(specificExercise, 10);
                specificExercise = null;
            } else if (specificExercise.includes(',')) {
                exerciseList = specificExercise.split(',').map(ex => {
                    const trimmed = ex.trim();
                    return trimmed.includes('/') ? trimmed.split('/').pop()! || trimmed : trimmed;
                }).filter(ex => ex.length > 0);
                specificExercise = null;
            } else if (specificExercise.includes('/')) {
                specificExercise = specificExercise.split('/').pop()! || null;
            }
        }
    } else {
        // v2: task selection only
        const taskModes =
            (taskArg !== null ? 1 : 0) +
            (tasksArg !== null ? 1 : 0) +
            (taskLimitRaw !== null ? 1 : 0);
        if (taskModes > 1) {
            die('❌ Use only one of --task, --tasks, or --task-limit');
        }
        if (taskArg !== null) {
            specificTask = taskArg.includes('/') ? taskArg.split('/').pop()! || taskArg : taskArg;
        } else if (tasksArg !== null) {
            taskList = tasksArg.split(',').map(t => {
                const trimmed = t.trim();
                return trimmed.includes('/') ? trimmed.split('/').pop()! || trimmed : trimmed;
            }).filter(t => t.length > 0);
        } else if (taskLimitRaw !== null) {
            const n = parseInt(taskLimitRaw, 10);
            if (Number.isNaN(n)) {
                die('❌ --task-limit must be a positive integer');
            }
            taskLimit = n;
        }
    }

    const result: CLIArgs = {
        model,
        agent,
        dataset,
        provider,
        verbose,
        specificExercise,
        exerciseCount,
        exerciseList,
        specificTask,
        taskList,
        taskLimit,
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

export async function parseCommandLineArgs(): Promise<CLIArgs> {
    return parseCliArgsFromArgv(process.argv);
}
