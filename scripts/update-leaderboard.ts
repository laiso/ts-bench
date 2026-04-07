import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { EOL } from 'os';

interface BenchmarkResultItem {
  exercise: string;
  agentSuccess: boolean;
  testSuccess: boolean;
  overallSuccess: boolean;
  agentDuration?: number;
  testDuration?: number;
  totalDuration?: number;
}

interface SavedBenchmarkResult {
  metadata: {
    agent: string;
    model: string;
    provider: string;
    version?: string;
    timestamp: string;
    exerciseCount?: number;
    benchmarkVersion?: string;
    generatedBy?: string;
    totalExercises?: number;
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
  };
  tier?: {
    tier: string;
    label: string;
    solved: number;
    total: number;
  };
  results: BenchmarkResultItem[];
}

const RESULTS_DIR = './public/data/results';
const COMMIT_BODY_PATH = './commit-body.md';
const PR_TITLE_PATH = './pr-title.txt';

function sanitizeFilename(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function resultFilePath(key: string): string {
  return join(RESULTS_DIR, `${sanitizeFilename(key)}.json`);
}

async function main() {
  const newResultPath = process.argv[2];
  if (!newResultPath) {
    console.error('Usage: bun scripts/update-leaderboard.ts <path/to/new-result.json>');
    process.exit(1);
  }

  const newResult: SavedBenchmarkResult = JSON.parse(await readFile(newResultPath, 'utf-8')) as SavedBenchmarkResult;
  validateResult(newResult);
  const key = `${newResult.metadata.agent}-${newResult.metadata.model}`;
  const outPath = resultFilePath(key);

  const RUN_URL = process.env.RUN_URL;
  const RUN_ID = process.env.RUN_ID;
  const ARTIFACT_NAME = process.env.ARTIFACT_NAME;
  const merged: SavedBenchmarkResult = {
    ...newResult,
    metadata: {
      ...newResult.metadata,
      runUrl: RUN_URL || newResult.metadata.runUrl,
      runId: RUN_ID || newResult.metadata.runId,
      artifactName: ARTIFACT_NAME || newResult.metadata.artifactName,
    },
  };

  try {
    const oldResult: SavedBenchmarkResult | null = existsSync(outPath)
      ? (JSON.parse(await readFile(outPath, 'utf-8')) as SavedBenchmarkResult)
      : null;
    const diffMarkdown = generateDiffMarkdown(oldResult, merged, key);
    await writeFile(COMMIT_BODY_PATH, diffMarkdown, 'utf-8');
    console.log(`📝 Commit body generated: ${COMMIT_BODY_PATH}`);
  } catch (e) {
    console.warn('Failed to generate commit body markdown:', e);
  }

  try {
    const prTitle = generatePrTitle(merged, RUN_ID);
    await writeFile(PR_TITLE_PATH, prTitle, 'utf-8');
    console.log(`📝 PR title generated: ${PR_TITLE_PATH}`);
  } catch (e) {
    console.warn('Failed to generate PR title:', e);
  }

  try {
    const hasFailures = merged.summary.successRate < 100;
    await writeFile('./has-failures', hasFailures ? '1' : '0', 'utf-8');
  } catch (e) {
    console.warn('Failed to write has-failures flag:', e);
  }

  await ensureDirectoryExists(outPath);
  await writeFile(outPath, JSON.stringify(merged, null, 2), 'utf-8');
  console.log(`✅ Updated: ${outPath}`);
}

function validateResult(r: SavedBenchmarkResult) {
  if (!r || !r.metadata || !r.summary) {
    throw new Error('Invalid result JSON: missing metadata/summary');
  }
  const requiredMeta = ['agent', 'model', 'provider', 'timestamp'] as const;
  for (const k of requiredMeta) {
    if (!(k in r.metadata)) throw new Error(`Invalid result JSON: metadata.${k} missing`);
  }
  const requiredSummary = ['successRate', 'avgDuration', 'successCount', 'totalCount'] as const;
  for (const k of requiredSummary) {
    if (!(k in r.summary)) throw new Error(`Invalid result JSON: summary.${k} missing`);
  }
}

export function generateDiffMarkdown(
  oldResult: SavedBenchmarkResult | null,
  newResult: SavedBenchmarkResult,
  key: string,
): string {
  const lines: string[] = [];
  const keyLabel = `\`${key}\``;

  if (!oldResult) {
    lines.push(`🚀 New Entry: ${keyLabel} added to results`);
  } else {
    const oldRate = Number(oldResult.summary.successRate);
    const newRate = Number(newResult.summary.successRate);
    if (newRate > oldRate) {
      lines.push(`🔼 Improved: ${keyLabel}`);
    } else if (newRate < oldRate) {
      lines.push(`🔽 Declined: ${keyLabel}`);
    } else {
      lines.push(`🔄 Updated: ${keyLabel}`);
    }
  }

  lines.push('');

  // Meta info
  lines.push(`- **Agent**: ${newResult.metadata.agent}`);
  lines.push(`- **Model**: ${newResult.metadata.model}`);
  lines.push(`- **Provider**: ${newResult.metadata.provider}`);

  // Run URL
  if (newResult.metadata.runUrl) {
    lines.push(`- **Run**: [View GitHub Actions Run](${newResult.metadata.runUrl})`);
  }

  lines.push('');

  // Tier info
  if (newResult.tier) {
    const t = newResult.tier;
    lines.push(`**Tier**: ${t.tier} (${t.solved}/${t.total})`);
    lines.push('');
  }

  // Summary stats
  const oldRate = oldResult ? Number(oldResult.summary.successRate).toFixed(1) + '%' : 'N/A';
  const newRate = Number(newResult.summary.successRate).toFixed(1) + '%';
  lines.push(`- **Success Rate**: ${newRate} (was ${oldRate})`);

  const oldTime = oldResult ? (Number(oldResult.summary.avgDuration) / 1000).toFixed(1) + 's' : 'N/A';
  const newTime = (Number(newResult.summary.avgDuration) / 1000).toFixed(1) + 's';
  lines.push(`- **Avg Time**: ${newTime} (was ${oldTime})`);

  // Task results table
  if (newResult.results && newResult.results.length > 0) {
    lines.push('');
    lines.push('| Task | Agent | Test | Overall | Duration |');
    lines.push('|------|-------|------|---------|----------|');
    for (const r of newResult.results) {
      const agent = r.agentSuccess ? '✅' : '❌';
      const test = r.testSuccess ? '✅' : '❌';
      const overall = r.overallSuccess ? '✅' : '❌';
      const duration =
        r.totalDuration !== undefined ? (r.totalDuration / 1000).toFixed(1) + 's' : 'N/A';
      lines.push(`| ${r.exercise} | ${agent} | ${test} | ${overall} | ${duration} |`);
    }
  }

  return lines.join(EOL);
}

export function generatePrTitle(result: SavedBenchmarkResult, runId: string | undefined): string {
  const agent = result.metadata.agent;
  const model = result.metadata.model;
  const tierPart = result.tier
    ? `${result.tier.solved}/${result.tier.total} ${result.tier.tier} tier`
    : `${result.summary.successCount}/${result.summary.totalCount}`;
  const runPart = runId ? ` [run ${runId}]` : '';
  return `feat(leaderboard): ${agent} / ${model} — ${tierPart}${runPart}`;
}

async function ensureDirectoryExists(filePath: string) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
