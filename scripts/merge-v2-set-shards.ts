/**
 * Merge benchmark result JSON files from v2-set matrix shards (one file per shard).
 * Usage: bun scripts/merge-v2-set-shards.ts <directory>
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface SavedPayload {
    metadata?: Record<string, unknown>;
    summary?: {
        successCount?: number;
        totalCount?: number;
        successRate?: number;
        [k: string]: unknown;
    };
    results?: Array<{ exercise: string; overallSuccess: boolean; [k: string]: unknown }>;
}

async function main(): Promise<void> {
    const dir = process.argv[2];
    if (!dir) {
        console.error('Usage: bun scripts/merge-v2-set-shards.ts <directory-with-json>');
        process.exit(1);
    }

    const names = (await readdir(dir))
        .filter(f => f.startsWith('shard-') && f.endsWith('.json'))
        .sort((a, b) => {
            const na = parseInt(a.replace(/^shard-/, '').replace(/\.json$/, ''), 10);
            const nb = parseInt(b.replace(/^shard-/, '').replace(/\.json$/, ''), 10);
            return na - nb;
        });
    if (names.length === 0) {
        console.error('No shard-*.json files in', dir);
        process.exit(1);
    }

    const payloads: SavedPayload[] = [];
    for (const name of names) {
        const raw = await readFile(join(dir, name), 'utf-8');
        payloads.push(JSON.parse(raw) as SavedPayload);
    }

    const allResults = payloads.flatMap(p => p.results ?? []);
    const successCount = allResults.filter(r => r.overallSuccess).length;
    const totalCount = allResults.length;
    const successRate = totalCount > 0 ? Number(((successCount / totalCount) * 100).toFixed(1)) : 0;

    const out = {
        metadata: {
            merged: true,
            mergedFrom: names,
            mergedAt: new Date().toISOString(),
            ...(payloads[0]?.metadata && { baseMetadata: payloads[0].metadata }),
        },
        summary: {
            successCount,
            totalCount,
            successRate,
            totalDuration: allResults.reduce(
                (s, r) => s + (Number((r as { totalDuration?: number }).totalDuration) || 0),
                0
            ),
        },
        byShard: names.map((file, i) => ({
            file,
            shardIndex: file.replace(/^shard-/, '').replace(/\.json$/, ''),
            summary: payloads[i]?.summary,
            taskCount: (payloads[i]?.results ?? []).length,
            tasks: (payloads[i]?.results ?? []).map(r => r.exercise),
        })),
        results: allResults,
    };

    const outPath = join(dir, '..', 'v2-set-aggregate.json');
    await writeFile(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf-8');
    console.log(`Wrote ${outPath} (${totalCount} tasks, ${successCount} success)`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
