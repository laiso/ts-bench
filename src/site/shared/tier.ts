import type { ResultEntry, SavedResult, LeaderboardEntry } from './types.ts';
import { V2_DEFAULT_TASKS, V2_TOTAL } from './types.ts';

const V2_SET: Record<string, boolean> = {};
V2_DEFAULT_TASKS.forEach((t) => { V2_SET[t] = true; });

export function isV2Entry(d: SavedResult): boolean {
    if (d.tier && d.tier.tier) return true;
    if (d.results && d.results.length === V2_TOTAL) {
        let allMatch = true;
        for (let i = 0; i < d.results.length; i++) {
            if (!V2_SET[d.results[i]!.exercise]) { allMatch = false; break; }
        }
        if (allMatch) return true;
    }
    return false;
}

export function tierFromEntry(d: SavedResult): string | null {
    if (d.tier && d.tier.tier) return d.tier.tier;
    if (!d.results || d.results.length === 0) return null;
    let solved = 0;
    for (let i = 0; i < d.results.length; i++) {
        if (V2_SET[d.results[i]!.exercise] && d.results[i]!.overallSuccess) solved++;
    }
    if (solved >= 5) return 'S';
    if (solved >= 4) return 'A';
    if (solved >= 3) return 'B';
    if (solved >= 2) return 'C';
    if (solved >= 1) return 'D';
    return 'F';
}

export function resultKey(entry: SavedResult): string {
    const a = entry.metadata?.agent ?? '';
    const m = entry.metadata?.model ?? '';
    return (a + '-' + m).replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function filterV2Entries(results: Record<string, SavedResult>): LeaderboardEntry[] {
    return Object.entries(results)
        .map(([key, data]) => ({ key, data }))
        .filter((e) => isV2Entry(e.data));
}

export function sortEntriesByTier(entries: LeaderboardEntry[]): LeaderboardEntry[] {
    const tierRank: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4, F: 5 };
    return entries.slice().sort((a, b) => {
        const tA = tierFromEntry(a.data);
        const tB = tierFromEntry(b.data);
        const rA = tA != null && tierRank[tA] != null ? tierRank[tA] : 99;
        const rB = tB != null && tierRank[tB] != null ? tierRank[tB] : 99;
        if (rA !== rB) return rA - rB;
        const durA = a.data.summary?.avgDuration ?? 0;
        const durB = b.data.summary?.avgDuration ?? 0;
        return durA - durB;
    });
}
