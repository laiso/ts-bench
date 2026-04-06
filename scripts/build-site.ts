/**
 * Unified build script for the static docs site.
 * Generates docs/index.html with server-side rendered tier list,
 * history table, and task breakdown from leaderboard.json.
 *
 * Run: bun scripts/build-site.ts
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { LeaderboardData } from '../src/site/shared/types.ts';
import { filterV2Entries, sortEntriesByTier, tierFromEntry } from '../src/site/shared/tier.ts';
import { esc, fmtDate, fmtDuration } from '../src/site/shared/format.ts';
import { renderTierList } from '../src/site/components/tier-list.ts';
import { renderHistoryTable } from '../src/site/components/history-table.ts';
import { renderBreakdownTable } from '../src/site/components/breakdown-table.ts';
import { renderLayout } from '../src/site/templates/layout.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const LEADERBOARD_PATH = join(REPO_ROOT, 'public/data/leaderboard.json');
const DOCS_DIR = join(REPO_ROOT, 'docs');
const INDEX_OUT = join(DOCS_DIR, 'index.html');

const V2_TOTAL = 5;

function buildClientScript(data: LeaderboardData): string {
    return `(function() {
  var tabs = document.querySelectorAll('.tab');
  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });
})();`;
}

function buildBody(data: LeaderboardData): string {
    const entries = filterV2Entries(data.results);
    const sorted = sortEntriesByTier(entries);

    const updatedHtml = data.lastUpdated
        ? `<div class="updated" id="lastUpdated">Last updated: ${fmtDate(data.lastUpdated)}</div>`
        : '<div class="updated" id="lastUpdated"></div>';

    const tierListHtml = renderTierList(sorted);
    const historyHtml = renderHistoryTable(sorted);
    const breakdownHtml = renderBreakdownTable(sorted);

    return `
  <header>
    <h1>ts-bench</h1>
    <p>AI coding agent benchmark &mdash; SWE-Lancer &amp; Exercism TypeScript tasks</p>
    ${updatedHtml}
  </header>

  <div class="tabs">
    <div class="tab active" data-tab="leaderboard">Tier List</div>
    <div class="tab" data-tab="history">Historical Runs</div>
    <div class="tab" data-tab="breakdown">Task Breakdown</div>
  </div>

  <div id="leaderboard" class="tab-content active">
    ${tierListHtml}
  </div>

  <div id="history" class="tab-content">
    ${historyHtml}
  </div>

  <div id="breakdown" class="tab-content">
    ${breakdownHtml}
  </div>

  <footer>
    <a href="https://github.com/laiso/ts-bench">GitHub</a> &middot;
    <a href="swelancer-tasks/">Task Browser</a> &middot;
    <a href="auth/">Subscription Auth</a> &middot;
    Powered by <a href="https://github.com/laiso/ts-bench">ts-bench</a>
  </footer>
`;
}

async function main(): Promise<void> {
    if (!existsSync(LEADERBOARD_PATH)) {
        console.error(`Leaderboard not found at ${LEADERBOARD_PATH}`);
        process.exit(1);
    }

    const raw = await readFile(LEADERBOARD_PATH, 'utf-8');
    const data = JSON.parse(raw) as LeaderboardData;

    const body = buildBody(data);
    const clientScript = buildClientScript(data);

    const html = renderLayout({
        title: 'ts-bench — SWE-Lancer AI Agent Benchmark',
        description: 'Benchmark results for AI coding agents on SWE-Lancer and Exercism TypeScript tasks.',
        body,
        clientScript,
    });

    await mkdir(DOCS_DIR, { recursive: true });
    await writeFile(INDEX_OUT, html, 'utf-8');
    console.log(`Generated ${INDEX_OUT}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
