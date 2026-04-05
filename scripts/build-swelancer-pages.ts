/**
 * Reads SWE-Lancer task CSV (RFC 4180-style) and writes a JSON file for the static task browser.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const csvArg = process.argv[2];
if (!csvArg) {
    console.warn(
        '⚠ No CSV path provided. Skipping SWE-Lancer page build.\n' +
        '  Usage: bun run scripts/build-swelancer-pages.ts <path-to-csv>'
    );
    process.exit(0);
}
const CSV_PATH = resolve(csvArg);

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
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
