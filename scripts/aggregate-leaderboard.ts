/**
 * Aggregates all individual result files from public/data/results/*.json
 * into public/data/leaderboard.json in LeaderboardData format.
 *
 * Run: bun scripts/aggregate-leaderboard.ts
 * Must be run before build-site.ts and build-results-pages.ts.
 */
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const RESULTS_DIR = join(REPO_ROOT, 'public/data/results');
const LEADERBOARD_PATH = join(REPO_ROOT, 'public/data/leaderboard.json');

async function main() {
  const results: Record<string, unknown> = {};

  if (!existsSync(RESULTS_DIR)) {
    console.warn(`Results directory not found: ${RESULTS_DIR}`);
  } else {
    const files = (await readdir(RESULTS_DIR)).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const filePath = join(RESULTS_DIR, file);
      const content = JSON.parse(await readFile(filePath, 'utf-8')) as {
        metadata?: { agent?: string; model?: string };
      };
      const agent = content?.metadata?.agent;
      const model = content?.metadata?.model;
      if (agent && model) {
        const key = `${agent}-${model}`;
        results[key] = content;
      } else {
        console.warn(`Skipping ${file}: missing metadata.agent or metadata.model`);
      }
    }
  }

  const leaderboardData = {
    lastUpdated: new Date().toISOString(),
    results,
  };

  const dir = dirname(LEADERBOARD_PATH);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(LEADERBOARD_PATH, JSON.stringify(leaderboardData, null, 2), 'utf-8');
  console.log(`✅ Aggregated ${Object.keys(results).length} entries → ${LEADERBOARD_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
