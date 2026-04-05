import type { LeaderboardEntry, SavedResult } from '../shared/types.ts';
import { TIERS } from '../shared/types.ts';
import { tierFromEntry } from '../shared/tier.ts';
import { esc, fmtDuration } from '../shared/format.ts';

function getTaskBreakdown(entry: SavedResult): Array<{ exercise: string; overallSuccess: boolean }> {
    if (!entry.results || entry.results.length === 0) return [];
    return entry.results.map((r) => ({
        exercise: r.exercise,
        overallSuccess: r.overallSuccess,
    }));
}

export function renderTierList(entries: LeaderboardEntry[]): string {
    if (entries.length === 0) {
        return `<div class="loading">No v2 benchmark results yet.<br><small style="color:var(--text-secondary)">Run <code style="background:var(--surface-2);padding:2px 6px;border-radius:4px;font-size:0.85em">bun src/index.ts --dataset v2</code> and update the leaderboard to see tier ratings here.</small></div>`;
    }

    const groups: Record<string, LeaderboardEntry[]> = {};
    TIERS.forEach((t) => { groups[t] = []; });
    entries.forEach((entry) => {
        const tier = tierFromEntry(entry.data);
        if (tier && groups[tier]) groups[tier]!.push(entry);
    });

    let html = '<div class="tier-list">';
    TIERS.forEach((t) => {
        const isEmpty = groups[t]!.length === 0;
        html += `<div class="tier-row${isEmpty ? ' tier-empty' : ''}">`;
        html += `<div class="tier-label tier-label-${t}">${t}<span class="tier-sort-hint">sorted by time</span></div>`;
        html += '<div class="tier-items">';
        groups[t]!.forEach((entry) => {
            const d = entry.data;
            const meta = d.metadata;
            const summary = d.summary;
            const solved = d.tier ? d.tier.solved : (summary.successCount != null ? summary.successCount : 0);
            const agentDisplay = meta.agent || entry.key;
            const modelDisplay = meta.model || '';
            const agentName = agentDisplay.toLowerCase();
            const iconPath = `assets/icons/${esc(agentName)}.png`;
            const nameModelHtml = modelDisplay
                ? `<span class="agent-name-model">${esc(agentDisplay)} <span class="model-part">(${esc(modelDisplay)})</span></span>`
                : `<span class="agent-name-model">${esc(agentDisplay)}</span>`;

            html += `<a class="agent-card" href="results/${esc(entry.key)}.html">`;
            html += `<img class="agent-icon" src="${iconPath}" alt="${esc(agentDisplay)}" onerror="this.style.display='none'">`;
            html += nameModelHtml;
            const costDisplay = summary.totalCost !== undefined
                ? ` &middot; $${summary.totalCost.toFixed(4)}`
                : '';
            html += `<span class="agent-meta">${solved}/5 &middot; ${fmtDuration(summary.avgDuration)}${costDisplay}</span>`;

            const breakdown = getTaskBreakdown(d);
            if (breakdown.length > 0) {
                html += '<div class="card-tooltip">';
                html += '<div class="tooltip-title">Task Breakdown</div>';
                breakdown.forEach((r) => {
                    const statusClass = r.overallSuccess ? 'pass' : 'fail';
                    const statusText = r.overallSuccess ? 'Pass' : 'Fail';
                    html += `<div class="tooltip-task"><span class="task-id">${esc(r.exercise)}</span><span class="${statusClass}">${statusText}</span></div>`;
                });
                html += '</div>';
            }
            html += '</a>';
        });
        html += '</div></div>';
    });
    html += '</div>';

    return html;
}
