/**
 * Reads SWE-Lancer task CSV (RFC 4180-style) and writes a JSON file for the static task browser.
 * Also generates individual HTML pages for each task under docs/swelancer-tasks/<question_id>.html.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { SWELANCER_ISSUES_PATH } from '../src/config/constants.ts';
import { renderLayout } from '../src/site/templates/layout.ts';
import { esc } from '../src/site/shared/format.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const csvArg = process.argv[2];
const CSV_PATH = csvArg ? resolve(csvArg) : '';

const OUT_DIR = join(REPO_ROOT, 'docs/swelancer-tasks');
const OUT_FILE = join(OUT_DIR, 'tasks.json');

interface CsvRow {
    question_id: string;
    variant: string;
    price: string;
    set: string;
    title: string;
    description: string;
}

export interface TaskRecord {
    question_id: string;
    variant: string;
    price: number;
    set: string;
    title: string;
    description: string;
}

function toNumberPrice(raw: string): number {
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
}


/**
 * Convert description text to HTML:
 * - Markdown images `![alt](url)` → `<img src="url" alt="alt">`
 * - Bare image URLs ending in .png/.jpg/.gif/.webp → `<img src="url">`
 * - Otherwise wrap in `<pre>` for plain text display
 */
export function descriptionToHtml(text: string): string {
    if (!text) return '';

    // Unescape literal \n sequences from CSV
    const normalized = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t');

    const mdImageRe = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
    const bareImageRe = /^https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp)$/i;

    // Check if the text is predominantly image references
    const hasMdImage = mdImageRe.test(normalized);
    mdImageRe.lastIndex = 0;

    const text2 = normalized;

    if (hasMdImage) {
        const replaced = text2.replace(mdImageRe, (_match, alt, url) => {
            return `<img src="${esc(url)}" alt="${esc(alt)}" style="max-width:100%;border-radius:4px;margin:8px 0">`;
        });
        // Split each line on <img ...> boundaries so text parts get esc() but
        // already-HTML <img> tags pass through unchanged.
        const imgTagRe = /(<img\s[^>]*>)/g;
        const wrapped = replaced
            .split('\n')
            .map((line) => {
                const trimmed = line.trim();
                if (!trimmed) return '';
                const parts = trimmed.split(imgTagRe);
                const inner = parts
                    .map((part) => (part.startsWith('<img') ? part : esc(part)))
                    .join('');
                // If the whole line is just an img, don't wrap in <p>
                return parts.every((p) => !p || p.startsWith('<img'))
                    ? inner
                    : `<p>${inner}</p>`;
            })
            .filter((l) => l !== '')
            .join('\n');
        return `<div class="desc-html">${wrapped}</div>`;
    }

    if (bareImageRe.test(text2.trim())) {
        return `<img src="${esc(text2.trim())}" alt="" style="max-width:100%;border-radius:4px">`;
    }

    return `<pre style="white-space:pre-wrap;word-break:break-word;font-size:0.85rem;line-height:1.5;background:var(--surface-2,#1a1a1a);padding:12px 16px;border-radius:6px;overflow-x:auto">${esc(text2)}</pre>`;
}

function generateTaskPage(task: TaskRecord, issuesBasePath: string): Promise<string> {
    return (async () => {
        const taskDir = join(issuesBasePath, task.question_id);
        const cliCommand = `bun src/index.ts --dataset v2 --agent <YOUR_AGENT> --task ${task.question_id}`;

        let testPySection = '';
        let patchSection = '';

        if (existsSync(taskDir)) {
            const testPyPath = join(taskDir, 'test.py');
            if (existsSync(testPyPath)) {
                const testPyContent = await readFile(testPyPath, 'utf-8').catch(() => '');
                if (testPyContent) {
                    testPySection = `
<details>
  <summary>test.py</summary>
  <pre style="white-space:pre-wrap;word-break:break-word;font-size:0.8rem;line-height:1.5;overflow-x:auto">${esc(testPyContent)}</pre>
</details>`;
                }
            }
            const patchPath = join(taskDir, 'bug_reintroduce.patch');
            if (existsSync(patchPath)) {
                const patchContent = await readFile(patchPath, 'utf-8').catch(() => '');
                if (patchContent) {
                    patchSection = `
<details>
  <summary>bug_reintroduce.patch</summary>
  <pre style="white-space:pre-wrap;word-break:break-word;font-size:0.8rem;line-height:1.5;overflow-x:auto">${esc(patchContent)}</pre>
</details>`;
                }
            }
        }

        const descHtml = descriptionToHtml(task.description);

        const body = `
  <div class="breadcrumb"><a href="../">ts-bench</a> &rsaquo; <a href="index.html">Task Browser</a> &rsaquo; ${esc(task.question_id)}</div>

  <div class="hero">
    <h1>${esc(task.question_id)}</h1>
    <div class="hero-meta">
      <div><strong>$${esc(String(task.price))}</strong> reward</div>
      <div>Set <strong>${esc(task.set)}</strong></div>
      <div>Variant <strong>${esc(task.variant)}</strong></div>
    </div>
  </div>

  <h2>Title</h2>
  <p style="font-size:1rem;line-height:1.5;margin-bottom:24px">${esc(task.title)}</p>

  <h2>Description</h2>
  <div style="margin-bottom:24px">${descHtml}</div>

  <h2>CLI Command</h2>
  <div class="cli-block" style="display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:24px">
    <code id="cli-cmd" style="flex:1;font-size:0.85rem;word-break:break-all">${esc(cliCommand)}</code>
    <button style="flex-shrink:0;background:var(--accent);color:#0d1117;border:none;border-radius:6px;padding:6px 14px;font-size:0.8rem;font-weight:600;cursor:pointer" onclick="(function(btn){var t=document.getElementById('cli-cmd').textContent;navigator.clipboard&&navigator.clipboard.writeText(t).then(function(){btn.textContent='Copied';setTimeout(function(){btn.textContent='Copy';},2000)}).catch(function(){btn.textContent='Failed';setTimeout(function(){btn.textContent='Copy';},2000)});})(this)">Copy</button>
  </div>
${testPySection}${patchSection}
  <footer>
    <a href="../">ts-bench</a> &middot;
    <a href="index.html">Task Browser</a> &middot;
    <a href="https://github.com/laiso/ts-bench">GitHub</a>
  </footer>
`;

        return renderLayout({
            title: `${task.question_id} — SWE-Lancer task (ts-bench)`,
            description: task.title.slice(0, 160),
            body,
            faviconPath: '../favicon.png',
        });
    })();
}

async function main(): Promise<void> {
    const content = await readFile(CSV_PATH, 'utf-8');
    const rows = parse(content, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true
    }) as CsvRow[];

    const tasks: TaskRecord[] = rows.map(row => ({
        question_id: row.question_id ?? '',
        variant: row.variant ?? '',
        price: toNumberPrice(row.price ?? '0'),
        set: row.set ?? '',
        title: row.title ?? '',
        description: row.description ?? ''
    }));

    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(OUT_FILE, JSON.stringify(tasks, null, 0), 'utf-8');
    console.log(`Wrote ${tasks.length} tasks to ${OUT_FILE}`);

    const issuesBasePath = join(REPO_ROOT, SWELANCER_ISSUES_PATH);
    let pageCount = 0;
    for (const task of tasks) {
        if (!task.question_id) continue;
        const html = await generateTaskPage(task, issuesBasePath);
        const outPath = join(OUT_DIR, `${task.question_id}.html`);
        await writeFile(outPath, html, 'utf-8');
        pageCount++;
    }
    console.log(`Generated ${pageCount} task pages in ${OUT_DIR}`);
}

if (import.meta.main) {
    if (!csvArg) {
        console.warn(
            '⚠ No CSV path provided. Skipping SWE-Lancer page build.\n' +
            '  Usage: bun run scripts/build-swelancer-pages.ts <path-to-csv>'
        );
        process.exit(0);
    }
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
