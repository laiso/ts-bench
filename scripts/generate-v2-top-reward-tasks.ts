/**
 * Regenerate data/v2-top-reward-tasks.json from the SWE-Lancer CSV:
 * ic_swe rows only, sorted by price descending, top 10 question_ids.
 *
 * Run: bun scripts/generate-v2-top-reward-tasks.ts
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { SWELANCER_DATA_PATH } from '../src/config/constants';

interface CsvRow {
    question_id: string;
    variant: string;
    price: string;
}

async function main(): Promise<void> {
    const csvPath = join(process.cwd(), SWELANCER_DATA_PATH);
    const content = await readFile(csvPath, 'utf-8');
    const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
    }) as CsvRow[];

    const ic = records.filter(r => r.variant === 'ic_swe');
    const withPrice = ic.map(r => ({
        question_id: r.question_id,
        price: Number.parseFloat(r.price),
    }));
    withPrice.sort((a, b) => b.price - a.price);
    const top = withPrice.slice(0, 10);

    const payload = {
        description:
            'Top 10 SWE-Lancer ic_swe tasks by CSV price (reward amount), descending. Used by benchmark-v2-set.yml.',
        source_csv: SWELANCER_DATA_PATH,
        variant: 'ic_swe',
        selection: 'sort by price descending; take first 10',
        generated_at: new Date().toISOString(),
        tasks: top.map((t, i) => ({
            rank: i + 1,
            question_id: t.question_id,
            price: t.price,
        })),
        question_ids: top.map(t => t.question_id),
    };

    const outPath = join(process.cwd(), 'data/v2-top-reward-tasks.json');
    await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
    console.log(`Wrote ${outPath} (${top.length} tasks)`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
