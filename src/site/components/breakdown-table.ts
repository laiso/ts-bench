import type { LeaderboardEntry } from '../shared/types.ts';
import { V2_DEFAULT_TASKS } from '../shared/types.ts';
import { esc, fmtDuration } from '../shared/format.ts';

export function renderBreakdownTable(entries: LeaderboardEntry[]): string {
    const withResults = entries.filter((e) => e.data.results && e.data.results.length > 0);
    if (withResults.length === 0) {
        return '<div class="loading">No v2 task-level data available.</div>';
    }

    let html = '<table><thead><tr><th>Agent / Model</th>';
    V2_DEFAULT_TASKS.forEach((task) => {
        html += `<th>${esc(task)}</th>`;
    });
    html += '</tr></thead><tbody>';

    withResults.forEach((e) => {
        const meta = e.data.metadata;
        html += `<tr><td><strong>${esc(meta.agent || e.key)}</strong><br><small>${esc(meta.model || '')}</small></td>`;
        V2_DEFAULT_TASKS.forEach((task) => {
            let found: { overallSuccess: boolean; totalDuration: number } | null = null;
            for (let i = 0; i < (e.data.results || []).length; i++) {
                if (e.data.results[i]!.exercise === task) { found = e.data.results[i]!; break; }
            }
            if (!found) {
                html += '<td style="color:var(--text-secondary)">-</td>';
            } else if (found.overallSuccess) {
                html += `<td class="pass" title="${fmtDuration(found.totalDuration)}">Pass</td>`;
            } else {
                html += '<td class="fail">Fail</td>';
            }
        });
        html += '</tr>';
    });

    html += '</tbody></table>';
    return html;
}
