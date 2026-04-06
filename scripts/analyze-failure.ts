import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

// ---- Types ----------------------------------------------------------------

interface TaskResult {
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

interface BenchmarkMetadata {
    agent: string;
    model: string;
    provider: string;
    timestamp: string;
    runUrl?: string;
    runId?: string;
    artifactName?: string;
    [key: string]: unknown;
}

interface BenchmarkSummary {
    successRate: number;
    successCount: number;
    totalCount: number;
    [key: string]: unknown;
}

interface SavedBenchmarkResult {
    metadata: BenchmarkMetadata;
    summary: BenchmarkSummary;
    results: TaskResult[];
}

interface AnalysisResult {
    taskId: string;
    classification: string;
    rootCause: string;
    testExpectation: string;
    agentBehavior: string;
    suggestion: string;
    patchLines: number;
    rawPatch?: string;
    agentDuration: number;
    testDuration: number;
    agentSuccess: boolean;
    testSuccess: boolean;
    error?: string;
}

// ---- Log helpers ----------------------------------------------------------

/**
 * Compress runs of identical lines (after trimming) into a single line with a count.
 * e.g. 26 identical "✗ edit failed: …" lines → "✗ edit failed: … ×26"
 */
export function compressDuplicateLines(text: string): string {
    const lines = text.split('\n');
    const out: string[] = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        let count = 1;
        while (i + count < lines.length && lines[i + count] === line) {
            count++;
        }
        if (count > 1) {
            out.push(`${line} ×${count}`);
        } else {
            out.push(line);
        }
        i += count;
    }
    return out.join('\n');
}

/**
 * Extract the failures section from a pytest log.
 * Returns everything from `=== FAILURES ===` onwards (up to maxLines lines).
 * Always includes `short test summary info` section when present.
 */
export function extractPytestFailures(text: string, maxLines = 80): string {
    const failuresIdx = text.indexOf('=== FAILURES ===');
    if (failuresIdx === -1) {
        // Fall back to last maxLines lines
        const lines = text.split('\n');
        return lines.slice(-maxLines).join('\n');
    }
    const section = text.slice(failuresIdx);
    const lines = section.split('\n');
    return lines.slice(0, maxLines).join('\n');
}

/**
 * Return head + tail of agent log with duplicate compression.
 */
export function trimAgentLog(text: string, headLines = 20, tailLines = 20): string {
    const compressed = compressDuplicateLines(text);
    const lines = compressed.split('\n');
    if (lines.length <= headLines + tailLines) {
        return compressed;
    }
    const head = lines.slice(0, headLines);
    const tail = lines.slice(-tailLines);
    return [
        ...head,
        `... (${lines.length - headLines - tailLines} lines omitted) ...`,
        ...tail,
    ].join('\n');
}

/**
 * Truncate text to at most maxChars characters, appending a marker when truncated.
 */
export function truncateToMaxChars(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) + `\n... (truncated to ${maxChars} chars)`;
}

// ---- API call -------------------------------------------------------------

const GITHUB_MODELS_ENDPOINT = 'https://models.github.ai/inference/chat/completions';

const SYSTEM_PROMPT = `You are a benchmark failure analyst for ts-bench, a tool that evaluates AI coding agents on SWE-Lancer tasks.
Given the agent log, test log (pytest), and patch for a failed task, provide:
1. CLASSIFICATION: One of NO_CHANGE | WRONG_FIX | PARTIAL_FIX | INFRA_ERROR | TIMEOUT
2. ROOT_CAUSE: 1-2 sentence summary of why the agent failed
3. TEST_EXPECTATION: What the test was checking (from pytest log)
4. AGENT_BEHAVIOR: What the agent actually did (from agent log)
5. SUGGESTION: What the agent should have done differently

Be concise. Use technical language. Do not repeat the logs verbatim.

Reply in exactly this format:
CLASSIFICATION: <value>
ROOT_CAUSE: <text>
TEST_EXPECTATION: <text>
AGENT_BEHAVIOR: <text>
SUGGESTION: <text>`;

function buildUserPrompt(
    taskId: string,
    meta: BenchmarkMetadata,
    result: TaskResult,
    agentLog: string,
    pytestLog: string,
    patch: string,
): string {
    return `## Task: ${taskId}
Agent: ${meta.agent} / Model: ${meta.model}
agentSuccess: ${result.agentSuccess} | testSuccess: ${result.testSuccess}
agentDuration: ${Math.round(result.agentDuration)}s | testDuration: ${Math.round(result.testDuration)}s

### Agent Log (head + tail, deduplicated)
${agentLog}

### Pytest Log (failures section)
${pytestLog}

### Patch
${patch}`;
}

interface ParsedAnalysis {
    classification: string;
    rootCause: string;
    testExpectation: string;
    agentBehavior: string;
    suggestion: string;
}

export function parseAnalysisResponse(text: string): ParsedAnalysis {
    const extract = (key: string): string => {
        const match = text.match(new RegExp(`${key}:\\s*(.+?)(?=\\n[A-Z_]+:|$)`, 's'));
        return match ? match[1].trim() : '(not provided)';
    };
    return {
        classification: extract('CLASSIFICATION'),
        rootCause: extract('ROOT_CAUSE'),
        testExpectation: extract('TEST_EXPECTATION'),
        agentBehavior: extract('AGENT_BEHAVIOR'),
        suggestion: extract('SUGGESTION'),
    };
}

async function callGitHubModels(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    token: string,
): Promise<string> {
    const response = await fetch(GITHUB_MODELS_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
        }),
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${body}`);
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error('Empty response from API');
    }
    return content;
}

// ---- File collection ------------------------------------------------------

async function readFileSafe(path: string): Promise<string | null> {
    if (!existsSync(path)) return null;
    try {
        return await readFile(path, 'utf-8');
    } catch {
        return null;
    }
}

function countPatchLines(patch: string): number {
    return patch.split('\n').filter((l) => (l.startsWith('+') && !l.startsWith('+++')) || (l.startsWith('-') && !l.startsWith('---'))).length;
}

// ---- Markdown output ------------------------------------------------------

export function buildMarkdownReport(
    metadata: BenchmarkMetadata,
    summary: BenchmarkSummary,
    analyses: AnalysisResult[],
    analysisModel: string,
): string {
    const runUrl = metadata.runUrl ?? '#';
    const runId = metadata.runId ?? 'unknown';
    const successRate = (Number(summary.successRate) * 100).toFixed(1);

    const lines: string[] = [
        '## 🔍 Benchmark Failure Analysis',
        '',
        `**Run**: [${runId}](${runUrl})`,
        `**Agent**: ${metadata.agent} / **Model**: ${metadata.model} / **Provider**: ${metadata.provider}`,
        `**Result**: ${summary.successCount}/${summary.totalCount} passed (${successRate}%)`,
        `**Analysis Model**: ${analysisModel}`,
        '',
        '---',
        '',
    ];

    for (const a of analyses) {
        lines.push(`### Task \`${a.taskId}\` — \`${a.classification}\``);
        lines.push('');
        lines.push('| Item | Value |');
        lines.push('|---|---|');
        lines.push(`| agentSuccess | ${a.agentSuccess} |`);
        lines.push(`| testSuccess | ${a.testSuccess} |`);
        lines.push(`| Patch | ${a.patchLines > 0 ? `${a.patchLines} lines changed` : 'empty'} |`);
        lines.push(
            `| Duration | agent ${Math.round(a.agentDuration)}s + test ${Math.round(a.testDuration)}s = ${Math.round(a.agentDuration + a.testDuration)}s |`,
        );
        lines.push('');

        if (a.error) {
            lines.push(`> ⚠️ API call failed: ${a.error}`);
        } else {
            lines.push(`**Root Cause**: ${a.rootCause}`);
            lines.push('');
            lines.push(`**Test Expectation**: ${a.testExpectation}`);
            lines.push('');
            lines.push(`**Agent Behavior**: ${a.agentBehavior}`);
            lines.push('');
            lines.push(`**Suggestion**: ${a.suggestion}`);
        }

        if (a.rawPatch && a.rawPatch.trim().length > 0) {
            lines.push('');
            lines.push('<details>');
            lines.push('<summary>📄 Patch</summary>');
            lines.push('');
            lines.push('```diff');
            lines.push(a.rawPatch.trimEnd());
            lines.push('```');
            lines.push('</details>');
        }
        lines.push('');
        lines.push('---');
        lines.push('');
    }

    return lines.join('\n');
}

// ---- Main -----------------------------------------------------------------

async function main() {
    const [resultJsonPath, artifactRoot] = process.argv.slice(2);
    if (!resultJsonPath || !artifactRoot) {
        console.error('Usage: bun scripts/analyze-failure.ts <result_json_path> <artifact_root>');
        process.exit(1);
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        console.error('Error: GITHUB_TOKEN environment variable is required');
        process.exit(1);
    }

    const analysisModel = process.env.ANALYSIS_MODEL ?? 'openai/gpt-5-mini';
    const outputPath = process.env.OUTPUT_PATH ?? 'failure-analysis.md';

    const data: SavedBenchmarkResult = JSON.parse(
        await readFile(resultJsonPath, 'utf-8'),
    ) as SavedBenchmarkResult;

    const failedTasks = data.results.filter((r) => !r.overallSuccess);

    if (failedTasks.length === 0) {
        const md = '## 🔍 Benchmark Failure Analysis\n\n✅ All tasks passed — no failures to analyze.\n';
        await writeFile(outputPath, md, 'utf-8');
        console.log('All tasks passed.');
        return;
    }

    console.log(`Analyzing ${failedTasks.length} failed task(s) with ${analysisModel}…`);

    const analyses: AnalysisResult[] = [];

    for (const result of failedTasks) {
        const taskId = result.exercise;
        console.log(`  → ${taskId}`);

        // Collect logs
        const agentLogPath = join(artifactRoot, 'results', data.metadata.agent, 'logs', `${taskId}.log`);
        const pytestLogPath = join(artifactRoot, '.v2-swelancer-logs', taskId, 'pytest.log');
        const patchPath = join(artifactRoot, '.patches', `${taskId}.patch`);

        const [rawAgentLog, rawPytestLog, rawPatch] = await Promise.all([
            readFileSafe(agentLogPath),
            readFileSafe(pytestLogPath),
            readFileSafe(patchPath),
        ]);

        const agentLog = rawAgentLog
            ? trimAgentLog(rawAgentLog)
            : '(agent log not found)';
        const pytestLog = rawPytestLog
            ? extractPytestFailures(rawPytestLog)
            : '(pytest log not found)';
        const patch = rawPatch && rawPatch.trim().length > 0
            ? truncateToMaxChars(rawPatch, 1500)
            : '(empty — no changes made)';
        const patchLines = rawPatch ? countPatchLines(rawPatch) : 0;

        const userPrompt = truncateToMaxChars(
            buildUserPrompt(taskId, data.metadata, result, agentLog, pytestLog, patch),
            8000,
        );

        try {
            const responseText = await callGitHubModels(analysisModel, SYSTEM_PROMPT, userPrompt, token);
            const parsed = parseAnalysisResponse(responseText);
            analyses.push({
                taskId,
                ...parsed,
                patchLines,
                rawPatch: rawPatch ?? undefined,
                agentDuration: result.agentDuration,
                testDuration: result.testDuration,
                agentSuccess: result.agentSuccess,
                testSuccess: result.testSuccess,
            });
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            console.warn(`  ⚠ API call failed for ${taskId}: ${errorMsg}`);
            analyses.push({
                taskId,
                classification: 'UNKNOWN',
                rootCause: '',
                testExpectation: '',
                agentBehavior: '',
                suggestion: '',
                patchLines,
                rawPatch: rawPatch ?? undefined,
                agentDuration: result.agentDuration,
                testDuration: result.testDuration,
                agentSuccess: result.agentSuccess,
                testSuccess: result.testSuccess,
                error: errorMsg,
            });
        }
    }

    const markdown = buildMarkdownReport(data.metadata, data.summary, analyses, analysisModel);
    await writeFile(outputPath, markdown, 'utf-8');
    console.log(`✅ Analysis written to ${outputPath}`);
}

if (import.meta.main) {
    main().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
