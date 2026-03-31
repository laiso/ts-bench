import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
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

interface LeaderboardData {
  lastUpdated: string;
  results: Record<string, SavedBenchmarkResult>; // key: agent-model
}

const LEADERBOARD_PATH = './public/data/leaderboard.json';
const COMMIT_BODY_PATH = './commit-body.md';

async function main() {
  const newResultPath = process.argv[2];
  if (!newResultPath) {
    console.error('Usage: bun scripts/update-leaderboard.ts <path/to/new-result.json>');
    process.exit(1);
  }

  let leaderboardData: LeaderboardData;
  if (existsSync(LEADERBOARD_PATH)) {
    leaderboardData = JSON.parse(await readFile(LEADERBOARD_PATH, 'utf-8')) as LeaderboardData;
  } else {
    leaderboardData = { lastUpdated: '', results: {} };
  }
  const oldLeaderboardData: LeaderboardData = JSON.parse(JSON.stringify(leaderboardData));

  const newResult: SavedBenchmarkResult = JSON.parse(await readFile(newResultPath, 'utf-8')) as SavedBenchmarkResult;
  validateResult(newResult);
  const key = `${newResult.metadata.agent}-${newResult.metadata.model}`;

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

  leaderboardData.results[key] = merged;
  leaderboardData.lastUpdated = new Date().toISOString();

  try {
    const diffMarkdown = generateDiffMarkdown(oldLeaderboardData, leaderboardData, key);
    await writeFile(COMMIT_BODY_PATH, diffMarkdown, 'utf-8');
    console.log(`📝 Commit body generated: ${COMMIT_BODY_PATH}`);
  } catch (e) {
    console.warn('Failed to generate commit body markdown:', e);
  }

  await ensureDirectoryExists(LEADERBOARD_PATH);
  await writeFile(LEADERBOARD_PATH, JSON.stringify(leaderboardData, null, 2), 'utf-8');
  console.log(`✅ Updated: ${LEADERBOARD_PATH}`);
  console.log('ℹ️ README no longer embeds a leaderboard table; only public/data/leaderboard.json is updated.');
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

function getRankedList(data: LeaderboardData) {
  type RankedResult = SavedBenchmarkResult & { key: string };
  const records: RankedResult[] = Object.entries(data.results).map(([key, r]) => ({ key, ...r }));

  return records
    .sort((a, b) => {
      if (b.summary.successRate !== a.summary.successRate) {
        return b.summary.successRate - a.summary.successRate;
      }
      return a.summary.avgDuration - b.summary.avgDuration;
    })
    .map((r, i) => ({
      key: r.key,
      rank: i + 1,
      metadata: r.metadata,
      summary: r.summary,
    }));
}

function generateDiffMarkdown(oldData: LeaderboardData, newData: LeaderboardData, updatedKey: string): string {
  const oldRanks = getRankedList(oldData);
  const newRanks = getRankedList(newData);

  const oldRankMap = new Map(oldRanks.map((r) => [r.key, r]));
  const updatedEntry = newRanks.find((r) => r.key === updatedKey);

  if (!updatedEntry) return 'No changes detected.';

  const oldEntry = oldRankMap.get(updatedKey);
  const lines: string[] = [];

  const keyLabel = `\`${updatedKey}\``;
  if (!oldEntry) {
    lines.push(`🚀 New Entry: ${keyLabel} entered Leaderboard at rank ${updatedEntry.rank}`);
  } else {
    if (updatedEntry.rank < oldEntry.rank) {
      lines.push(`🔼 Rank Up: ${keyLabel} from ${oldEntry.rank} → ${updatedEntry.rank}`);
    } else if (updatedEntry.rank > oldEntry.rank) {
      lines.push(`🔽 Rank Down: ${keyLabel} from ${oldEntry.rank} → ${updatedEntry.rank}`);
    } else {
      lines.push(`🔄 Rank Unchanged: ${keyLabel} remains at ${updatedEntry.rank}`);
    }
  }

  const oldRankStr = oldEntry ? String(oldEntry.rank) : 'N/A';
  lines.push(`- Leaderboard Rank: ${oldRankStr} -> ${updatedEntry.rank}`);

  const oldRate = oldEntry ? Number(oldEntry.summary.successRate).toFixed(1) + '%' : 'N/A';
  const newRate = Number(updatedEntry.summary.successRate).toFixed(1) + '%';
  lines.push(`- Success Rate: ${newRate} (was ${oldRate})`);

  const oldTime = oldEntry ? (Number(oldEntry.summary.avgDuration) / 1000).toFixed(1) + 's' : 'N/A';
  const newTime = (Number(updatedEntry.summary.avgDuration) / 1000).toFixed(1) + 's';
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
