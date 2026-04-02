/**
 * Reads public/data/leaderboard.json and generates individual HTML result pages
 * under docs/results/<key>.html with OGP metadata for each agent/model entry.
 *
 * Run: bun scripts/build-results-pages.ts
 */
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const LEADERBOARD_PATH = join(REPO_ROOT, 'public/data/leaderboard.json');
const DOCS_DIR = join(REPO_ROOT, 'docs');
const RESULTS_DIR = join(DOCS_DIR, 'results');
const DATA_OUT_DIR = join(DOCS_DIR, 'data');

// Mirror of V2_TIER_THRESHOLDS from src/config/constants.ts
const V2_DEFAULT_TASKS = new Set(['14958', '15815_1', '15193', '14268', '20079']);
const TIER_THRESHOLDS: ReadonlyArray<{ tier: string; minCorrect: number }> = [
    { tier: 'S', minCorrect: 5 },
    { tier: 'A', minCorrect: 4 },
    { tier: 'B', minCorrect: 3 },
    { tier: 'C', minCorrect: 2 },
    { tier: 'D', minCorrect: 1 },
    { tier: 'F', minCorrect: 0 },
];

interface ResultEntry {
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

interface SavedResult {
    metadata: {
        agent: string;
        model: string;
        provider: string;
        version?: string;
        timestamp: string;
        exerciseCount?: number;
        benchmarkVersion?: string;
        generatedBy?: string;
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
    tier?: { tier: string; label: string; solved: number; total: number };
    results: ResultEntry[];
}

interface LeaderboardData {
    lastUpdated: string;
    results: Record<string, SavedResult>;
}

function sanitizeKey(agent: string, model: string): string {
    return `${agent}-${model}`.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function computeTier(results: ResultEntry[]): string | null {
    if (!results || results.length === 0) return null;
    const resultIds = new Set(results.map(r => r.exercise));
    const isDefault = V2_DEFAULT_TASKS.size > 0
        && resultIds.size === V2_DEFAULT_TASKS.size
        && [...V2_DEFAULT_TASKS].every(id => resultIds.has(id));
    if (!isDefault) return null;

    const solved = results.filter(r => V2_DEFAULT_TASKS.has(r.exercise) && r.overallSuccess).length;
    const sorted = [...TIER_THRESHOLDS].sort((a, b) => b.minCorrect - a.minCorrect);
    const entry = sorted.find(t => solved >= t.minCorrect);
    return entry ? entry.tier : 'F';
}

function fmtDuration(ms: number): string {
    if (!ms || ms <= 0) return '-';
    const sec = ms / 1000;
    if (sec < 60) return sec.toFixed(1) + 's';
    const min = sec / 60;
    if (min < 60) return min.toFixed(1) + 'm';
    const hr = min / 60;
    return hr.toFixed(1) + 'h';
}

function fmtDate(ts: string): string {
    if (!ts) return '-';
    return ts.split('T')[0] ?? '-';
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function tierClass(tier: string | null): string {
    if (!tier) return '';
    return `tier-${tier}`;
}

function generateResultPage(key: string, entry: SavedResult): string {
    const meta = entry.metadata;
    const summary = entry.summary;
    const tier = entry.tier?.tier ?? computeTier(entry.results);
    const solved = summary.successCount ?? 0;
    const total = summary.totalCount ?? 0;

    const pageTitle = `${escapeHtml(meta.agent)} / ${escapeHtml(meta.model)} - ts-bench`;
    const ogDescription = `Tier ${tier ?? '-'} | ${solved}/${total} solved | ${summary.successRate?.toFixed(1) ?? 0}% success rate | ${escapeHtml(meta.provider)}`;

    let resultsRows = '';
    if (entry.results && entry.results.length > 0) {
        entry.results.forEach(r => {
            const status = r.overallSuccess
                ? '<span class="pass">Pass</span>'
                : '<span class="fail">Fail</span>';
            const agentStatus = r.agentSuccess ? '<span class="pass">OK</span>' : '<span class="fail">Fail</span>';
            const testStatus = r.testSuccess ? '<span class="pass">OK</span>' : '<span class="fail">Fail</span>';
            resultsRows += `
        <tr>
          <td>${escapeHtml(r.exercise)}</td>
          <td>${status}</td>
          <td>${agentStatus}</td>
          <td>${testStatus}</td>
          <td>${fmtDuration(r.agentDuration)}</td>
          <td>${fmtDuration(r.testDuration)}</td>
          <td>${fmtDuration(r.totalDuration)}</td>
        </tr>`;
        });
    } else {
        resultsRows = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">No task-level results available</td></tr>';
    }

    const runUrlHtml = meta.runUrl
        ? `<a href="${escapeHtml(meta.runUrl)}" target="_blank">View GHA Run</a>`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${pageTitle}</title>
<meta name="description" content="${ogDescription}">
<meta property="og:title" content="${pageTitle}">
<meta property="og:description" content="${ogDescription}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="ts-bench">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${pageTitle}">
<meta name="twitter:description" content="${ogDescription}">
<style>
:root {
  --bg: #0d1117;
  --surface: #161b22;
  --border: #30363d;
  --text: #e6edf3;
  --text-muted: #8b949e;
  --accent: #58a6ff;
  --green: #3fb950;
  --red: #f85149;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
  padding: 0 16px;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.container { max-width: 1000px; margin: 0 auto; padding: 32px 0; }
.breadcrumb { margin-bottom: 24px; font-size: 0.9rem; color: var(--text-muted); }
.hero { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 24px; margin-bottom: 24px; }
.hero h1 { font-size: 1.5rem; margin-bottom: 8px; }
.hero-meta { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 12px; color: var(--text-muted); font-size: 0.9rem; }
.hero-meta strong { color: var(--text); }
.tier {
  display: inline-block;
  width: 40px; height: 40px;
  line-height: 40px;
  text-align: center;
  font-weight: 700;
  font-size: 1.2rem;
  border-radius: 8px;
  color: #fff;
}
.tier-S { background: #c9a000; }
.tier-A { background: #3fb950; }
.tier-B { background: #58a6ff; }
.tier-C { background: #bc8cff; }
.tier-D { background: #db6d28; }
.tier-F { background: #f85149; }
table { width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 8px; overflow: hidden; margin-top: 24px; }
th, td { padding: 10px 14px; text-align: left; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
th { background: var(--bg); font-weight: 600; color: var(--text-muted); }
tr:last-child td { border-bottom: none; }
tr:hover td { background: rgba(88,166,255,0.04); }
.pass { color: var(--green); font-weight: 600; }
.fail { color: var(--red); font-weight: 600; }
h2 { margin-top: 32px; margin-bottom: 8px; font-size: 1.15rem; }
footer { text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 40px 0 24px; border-top: 1px solid var(--border); margin-top: 40px; }
@media (max-width: 768px) {
  th, td { padding: 8px 10px; font-size: 0.82rem; }
}
</style>
</head>
<body>
<div class="container">
  <div class="breadcrumb"><a href="../">ts-bench</a> &rsaquo; Result</div>

  <div class="hero">
    <div style="display:flex;align-items:center;gap:16px">
      ${tier ? `<span class="tier ${tierClass(tier)}">${tier}</span>` : ''}
      <div>
        <h1>${escapeHtml(meta.agent)} / ${escapeHtml(meta.model)}</h1>
        <div style="color:var(--text-muted);font-size:0.9rem">${escapeHtml(meta.provider)} &middot; ${fmtDate(meta.timestamp)}</div>
      </div>
    </div>
    <div class="hero-meta">
      <div><strong>${solved}/${total}</strong> solved</div>
      <div><strong>${summary.successRate?.toFixed(1) ?? 0}%</strong> success</div>
      <div>Avg <strong>${fmtDuration(summary.avgDuration)}</strong></div>
      <div>Total <strong>${fmtDuration(summary.totalDuration)}</strong></div>
      ${meta.version ? `<div>Version <strong>${escapeHtml(meta.version)}</strong></div>` : ''}
      ${meta.benchmarkVersion ? `<div>Bench <strong>${escapeHtml(meta.benchmarkVersion)}</strong></div>` : ''}
    </div>
    ${runUrlHtml ? `<div style="margin-top:12px">${runUrlHtml}</div>` : ''}
  </div>

  <h2>Task Results</h2>
  <table>
    <thead>
      <tr>
        <th>Task</th>
        <th>Result</th>
        <th>Agent</th>
        <th>Test</th>
        <th>Agent Time</th>
        <th>Test Time</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${resultsRows}
    </tbody>
  </table>

  <footer>
    <a href="../">Back to Leaderboard</a> &middot;
    <a href="https://github.com/laiso/ts-bench">GitHub</a>
  </footer>
</div>
</body>
</html>`;
}

async function main(): Promise<void> {
    if (!existsSync(LEADERBOARD_PATH)) {
        console.error(`Leaderboard not found at ${LEADERBOARD_PATH}`);
        process.exit(1);
    }

    const raw = await readFile(LEADERBOARD_PATH, 'utf-8');
    const leaderboard = JSON.parse(raw) as LeaderboardData;

    await mkdir(RESULTS_DIR, { recursive: true });

    // Copy leaderboard.json to docs/data/ so the static site can read it
    await mkdir(DATA_OUT_DIR, { recursive: true });
    await cp(LEADERBOARD_PATH, join(DATA_OUT_DIR, 'leaderboard.json'));
    console.log(`Copied leaderboard.json to ${DATA_OUT_DIR}/leaderboard.json`);

    const entries = Object.entries(leaderboard.results);
    let count = 0;

    for (const [_key, entry] of entries) {
        const safeKey = sanitizeKey(entry.metadata.agent, entry.metadata.model);
        const html = generateResultPage(safeKey, entry);
        const outPath = join(RESULTS_DIR, `${safeKey}.html`);
        await writeFile(outPath, html, 'utf-8');
        count++;
    }

    console.log(`Generated ${count} result pages in ${RESULTS_DIR}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
