import type { LeaderboardEntry } from '../shared/types.ts';
import { V2_TOTAL } from '../shared/types.ts';
import { tierFromEntry } from '../shared/tier.ts';
import { esc, fmtDate, fmtDuration, agentDisplayName } from '../shared/format.ts';

export function renderHistoryTable(entries: LeaderboardEntry[]): string {
    if (entries.length === 0) {
        return '<div class="loading">No v2 results yet.</div>';
    }

    const sorted = entries.slice().sort((a, b) => {
        const tA = a.data.metadata?.timestamp ?? '';
        const tB = b.data.metadata?.timestamp ?? '';
        return tB.localeCompare(tA);
    });

    let html = '<table><thead><tr>';
    html += '<th>Agent</th><th>Model</th><th>Provider</th><th>Tier</th>';
    html += '<th>Solved</th><th>Total Time</th><th>Date</th><th></th>';
    html += '</tr></thead><tbody>';

    sorted.forEach((entry) => {
        const d = entry.data;
        const meta = d.metadata;
        const summary = d.summary;
        const tier = tierFromEntry(d);
        const solved = d.tier ? d.tier.solved : (summary.successCount != null ? summary.successCount : 0);
        const tierColors: Record<string, string> = {
            S: '#ffd700', A: '#87c0ff', B: '#b0e070',
            C: '#f0a030', D: '#e06040', F: '#cc2222',
        };
        const tierColor = tier ? tierColors[tier] : 'var(--text-secondary)';
        const tierBg = tier ? tierColors[tier] : 'transparent';

        html += '<tr>';
        html += `<td>${esc(agentDisplayName(meta.agent || entry.key))}</td>`;
        html += `<td>${esc(meta.model || '-')}</td>`;
        html += `<td>${esc(meta.provider || '-')}</td>`;
        html += `<td><span class="tier-badge tier-badge-${tier || ''}" style="background:${tierBg};${tier === 'S' || tier === 'B' ? 'color:#000;' : ''}">${esc(tier || '-')}</span></td>`;
        html += `<td>${solved}/${V2_TOTAL}</td>`;
        html += `<td>${fmtDuration(summary.totalDuration)}</td>`;
        html += `<td>${fmtDate(meta.timestamp)}</td>`;
        html += `<td><a href="results/${esc(entry.key)}.html">Details</a></td>`;
        html += '</tr>';
    });

    html += '</tbody></table>';
    return html;
}
