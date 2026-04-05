import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { EOL } from 'os';

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
  results: unknown[];
}

const RESULTS_DIR = './public/data/results';
const COMMIT_BODY_PATH = './commit-body.md';

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

function generateDiffMarkdown(
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

  const oldRate = oldResult ? Number(oldResult.summary.successRate).toFixed(1) + '%' : 'N/A';
  const newRate = Number(newResult.summary.successRate).toFixed(1) + '%';
  lines.push(`- Success Rate: ${newRate} (was ${oldRate})`);

  const oldTime = oldResult ? (Number(oldResult.summary.avgDuration) / 1000).toFixed(1) + 's' : 'N/A';
  const newTime = (Number(newResult.summary.avgDuration) / 1000).toFixed(1) + 's';
  lines.push(`- Avg Time: ${newTime} (was ${oldTime})`);

  return lines.join(EOL);
}

async function ensureDirectoryExists(filePath: string) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
