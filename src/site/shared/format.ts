export function fmtDuration(ms: number): string {
    if (!ms || ms <= 0) return '-';
    const sec = ms / 1000;
    if (sec < 60) return sec.toFixed(1) + 's';
    const min = sec / 60;
    if (min < 60) return min.toFixed(1) + 'm';
    const hr = min / 60;
    return hr.toFixed(1) + 'h';
}

export function fmtDate(ts: string): string {
    if (!ts) return '-';
    return ts.split('T')[0] ?? '-';
}

export function agentDisplayName(slug: string): string {
    switch (slug.toLowerCase()) {
        case 'claude': return 'Claude Code';
        case 'codex': return 'Codex CLI';
        case 'goose': return 'Goose CLI';
        case 'aider': return 'Aider';
        case 'gemini': return 'Gemini CLI';
        case 'qwen': return 'Qwen Code';
        case 'cursor': return 'Cursor Agent';
        case 'copilot': return 'GitHub Copilot CLI';
        case 'kimi': return 'Kimi Code CLI';
        case 'cline': return 'Cline';
        case 'windsurf': return 'Windsurf';
        case 'devin': return 'Devin';
        case 'opencode': return 'OpenCode';
        default: return slug.charAt(0).toUpperCase() + slug.slice(1).toLowerCase();
    }
}

export function esc(s: string): string {
    if (!s) return '';
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
