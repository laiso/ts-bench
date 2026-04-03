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

export function esc(s: string): string {
    if (!s) return '';
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
