import { readdir, readFile, stat } from 'fs/promises';
import { join, resolve } from 'path';
import { homedir } from 'os';
import type { AgentType, BenchmarkConfig, TokenUsage } from '../config/types';
import { calculateCost } from '../config/pricing';
import { SWELANCER_REPO_PATH } from '../config/constants';
import { resolveAuthCachePath } from './docker';

// ---------------------------------------------------------------------------
// Claude JSONL helpers (mirrors ClaudeLogCollector logic)
// ---------------------------------------------------------------------------

function toProjectDirName(absPath: string): string {
    let p = absPath.replace(/[\\/]/g, '-');
    p = p.replace(/:/g, '');
    return p;
}

async function pickNewestJsonl(dir: string): Promise<string | null> {
    try {
        const entries = await readdir(dir);
        const jsonls = entries.filter((f) => f.endsWith('.jsonl'));
        if (jsonls.length === 0) return null;
        const dated = await Promise.all(
            jsonls.map(async (file) => ({
                file,
                time: (await stat(join(dir, file))).mtime.getTime(),
            }))
        );
        dated.sort((a, b) => b.time - a.time);
        return join(dir, dated[0]!.file);
    } catch {
        return null;
    }
}

async function findClaudeJsonlPath(
    config: BenchmarkConfig,
    exercisePath: string
): Promise<string | null> {
    const claudeBase = config.useDocker
        ? resolveAuthCachePath('claude')
        : join(homedir(), '.claude');
    const claudeProjects = join(claudeBase, 'projects');

    let candidateProject: string;
    if (config.dataset === 'v2' && config.useDocker) {
        candidateProject = join(claudeProjects, '-app');
    } else {
        const absExercisePath = resolve(process.cwd(), exercisePath);
        let targetPath = absExercisePath;
        if (config.dataset === 'v2' && !config.useDocker) {
            targetPath = resolve(SWELANCER_REPO_PATH.replace(/^~/, homedir()));
        }
        candidateProject = join(claudeProjects, toProjectDirName(targetPath));
    }

    return pickNewestJsonl(candidateProject);
}

/**
 * Parse a Claude JSONL log file and sum up all `usage` token counts.
 * Each line may contain `{"usage":{"input_tokens":N,"output_tokens":N}}`.
 */
export function parseClaudeJsonl(content: string): TokenUsage | undefined {
    let totalInput = 0;
    let totalOutput = 0;
    let found = false;

    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            const obj = JSON.parse(trimmed) as Record<string, unknown>;
            // Direct usage at top level (e.g. message_delta events).
            // Use else-if so a line carrying both fields isn't double-counted.
            const usage = obj['usage'] as Record<string, unknown> | undefined;
            if (usage && typeof usage === 'object') {
                const inp = usage['input_tokens'];
                const out = usage['output_tokens'];
                if (typeof inp === 'number') { totalInput += inp; found = true; }
                if (typeof out === 'number') { totalOutput += out; found = true; }
            } else {
                // Nested under message.usage (e.g. message_start events)
                const message = obj['message'] as Record<string, unknown> | undefined;
                if (message && typeof message === 'object') {
                    const mUsage = message['usage'] as Record<string, unknown> | undefined;
                    if (mUsage && typeof mUsage === 'object') {
                        const inp = mUsage['input_tokens'];
                        const out = mUsage['output_tokens'];
                        if (typeof inp === 'number') { totalInput += inp; found = true; }
                        if (typeof out === 'number') { totalOutput += out; found = true; }
                    }
                }
            }
        } catch {
            // Skip non-JSON lines
        }
    }

    if (!found) return undefined;
    return {
        inputTokens: totalInput,
        outputTokens: totalOutput,
        totalTokens: totalInput + totalOutput,
    };
}

// ---------------------------------------------------------------------------
// Copilot stderr parser
// ---------------------------------------------------------------------------

/** Parse a token count that may have a k/m suffix, e.g. "237.9k" → 237900. */
function parseTokenCount(raw: string): number {
    const lower = raw.toLowerCase().replace(/,/g, '');
    if (lower.endsWith('m')) return Math.round(parseFloat(lower) * 1_000_000);
    if (lower.endsWith('k')) return Math.round(parseFloat(lower) * 1_000);
    return parseInt(lower, 10);
}

/**
 * Parse copilot's stderr summary lines.
 * Sums all "Breakdown by AI model" lines of the form:
 *   "  claude-sonnet-4.6   237.9k in, 2.0k out, 158.6k cached (Est. 1 Premium request)"
 */
export function parseCopilotStderr(stderr: string): TokenUsage | undefined {
    // Match lines like: "  <model>   237.9k in, 2.0k out[, N cached]"
    const lineRe = /[\w.+-]+\s+([\d.]+[km]?)\s+in,\s*([\d.]+[km]?)\s+out/gi;
    let totalInput = 0;
    let totalOutput = 0;
    let found = false;
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(stderr)) !== null) {
        totalInput += parseTokenCount(m[1]!);
        totalOutput += parseTokenCount(m[2]!);
        found = true;
    }
    if (!found) return undefined;
    return {
        inputTokens: totalInput,
        outputTokens: totalOutput,
        totalTokens: totalInput + totalOutput,
    };
}

// ---------------------------------------------------------------------------
// Generic stdout/stderr parser (regex-based)
// ---------------------------------------------------------------------------

/**
 * Common token-count patterns emitted by CLI agents in their output.
 *
 * Patterns cover:
 *  - "Tokens: 1234 input, 567 output"        (aider-style)
 *  - "Input tokens: 1234"                     (generic)
 *  - "Total tokens: 1234"                     (generic)
 *  - "tokens_used: 1234"                      (some CLI tools)
 *  - JSON blobs like {"input_tokens":1234,"output_tokens":567}
 *  - Codex / opencode: "Usage: prompt=1234 completion=567"
 *  - Copilot: "237.9k in, 2.0k out, 158.6k cached"
 */
export function parseStdoutTokenUsage(output: string): TokenUsage | undefined {
    if (!output) return undefined;

    // Try to find JSON objects with token fields
    const jsonMatch = output.match(/\{[^{}]*"input_tokens"\s*:\s*(\d+)[^{}]*"output_tokens"\s*:\s*(\d+)[^{}]*\}/);
    if (jsonMatch) {
        const inputTokens = parseInt(jsonMatch[1]!, 10);
        const outputTokens = parseInt(jsonMatch[2]!, 10);
        return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
    }

    // Reversed order JSON
    const jsonMatchRev = output.match(/\{[^{}]*"output_tokens"\s*:\s*(\d+)[^{}]*"input_tokens"\s*:\s*(\d+)[^{}]*\}/);
    if (jsonMatchRev) {
        const outputTokens = parseInt(jsonMatchRev[1]!, 10);
        const inputTokens = parseInt(jsonMatchRev[2]!, 10);
        return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
    }

    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let totalTokens: number | undefined;

    // "Tokens: 1234 sent, 567 received" / "Tokens: 1,200 sent, 340 received" (aider)
    const aiderMatch = output.match(/Tokens:\s*([\d,]+)\s+(?:sent|input)[,\s]+([\d,]+)\s+(?:received|output)/i);
    if (aiderMatch) {
        inputTokens = parseInt(aiderMatch[1]!.replace(/,/g, ''), 10);
        outputTokens = parseInt(aiderMatch[2]!.replace(/,/g, ''), 10);
    }

    // "input tokens: 1234" / "input_tokens: 1234"
    if (inputTokens === undefined) {
        const m = output.match(/input[_ ]tokens?[:\s]+(\d[\d,]*)/i);
        if (m) inputTokens = parseInt(m[1]!.replace(/,/g, ''), 10);
    }

    // "output tokens: 567" / "output_tokens: 567"
    if (outputTokens === undefined) {
        const m = output.match(/output[_ ]tokens?[:\s]+(\d[\d,]*)/i);
        if (m) outputTokens = parseInt(m[1]!.replace(/,/g, ''), 10);
    }

    // "total tokens: 1801" / "total_tokens: 1801"
    if (totalTokens === undefined) {
        const m = output.match(/total[_ ]tokens?[:\s]+(\d[\d,]*)/i);
        if (m) totalTokens = parseInt(m[1]!.replace(/,/g, ''), 10);
    }

    // "Usage: prompt=1234 completion=567" (Codex-style)
    if (inputTokens === undefined && outputTokens === undefined) {
        const codexMatch = output.match(/Usage:\s*prompt=(\d+)\s+completion=(\d+)/i);
        if (codexMatch) {
            inputTokens = parseInt(codexMatch[1]!, 10);
            outputTokens = parseInt(codexMatch[2]!, 10);
        }
    }

    // "tokens used\n9,113" (Codex CLI summary)
    if (totalTokens === undefined) {
        const m = output.match(/tokens used\s*\n\s*([\d,]+)/i);
        if (m) totalTokens = parseInt(m[1]!.replace(/,/g, ''), 10);
    }

    if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
        return undefined;
    }

    const computedTotal = totalTokens ?? (
        inputTokens !== undefined && outputTokens !== undefined
            ? inputTokens + outputTokens
            : undefined
    );

    return {
        inputTokens,
        outputTokens,
        totalTokens: computedTotal,
    };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Extract token usage for a completed agent run.
 * Returns undefined when no token information can be determined.
 */
export async function extractTokenUsage(
    config: BenchmarkConfig,
    exercisePath: string,
    stdout: string,
    stderr: string
): Promise<TokenUsage | undefined> {
    let usage: TokenUsage | undefined;

    if (config.agent === 'claude') {
        try {
            const jsonlPath = await findClaudeJsonlPath(config, exercisePath);
            if (jsonlPath) {
                const content = await readFile(jsonlPath, 'utf-8');
                usage = parseClaudeJsonl(content);
            }
        } catch {
            // Fall through to stdout parsing
        }
    }

    if (config.agent === 'copilot') {
        usage = parseCopilotStderr(stderr);
    }

    // Fallback: parse stdout / stderr
    if (!usage) {
        usage = parseStdoutTokenUsage(stdout) ?? parseStdoutTokenUsage(stderr);
    }

    if (!usage) return undefined;

    // Attach cost if we have enough info
    if (
        usage.inputTokens !== undefined &&
        usage.outputTokens !== undefined
    ) {
        const cost = calculateCost(usage.inputTokens, usage.outputTokens, config.model);
        if (cost !== undefined) {
            usage = { ...usage, cost };
        }
    }

    return usage;
}

/**
 * Merge an array of TokenUsage objects by summing all numeric fields.
 * Returns undefined when the array is empty or all entries are undefined.
 */
export function sumTokenUsages(usages: (TokenUsage | undefined)[]): TokenUsage | undefined {
    let totalInput = 0;
    let totalOutput = 0;
    let totalOnlyTokens = 0;
    let totalCost = 0;
    let hasAny = false;
    let hasInput = false;
    let hasOutput = false;
    let hasCost = false;

    for (const u of usages) {
        if (!u) continue;
        hasAny = true;
        if (u.inputTokens !== undefined) { totalInput += u.inputTokens; hasInput = true; }
        if (u.outputTokens !== undefined) { totalOutput += u.outputTokens; hasOutput = true; }
        // Entries with only totalTokens (no breakdown) are accumulated separately
        // so they contribute to the grand total without masking as zeros.
        if (u.inputTokens === undefined && u.outputTokens === undefined && u.totalTokens !== undefined) {
            totalOnlyTokens += u.totalTokens;
        }
        if (u.cost !== undefined) { totalCost += u.cost; hasCost = true; }
    }

    if (!hasAny) return undefined;

    return {
        ...(hasInput ? { inputTokens: totalInput } : {}),
        ...(hasOutput ? { outputTokens: totalOutput } : {}),
        totalTokens: totalInput + totalOutput + totalOnlyTokens,
        ...(hasCost ? { cost: totalCost } : {}),
    };
}
