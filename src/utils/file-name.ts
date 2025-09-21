const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

export function sanitizeFilenameSegment(value: string, fallback = 'unknown'): string {
    const sanitized = value
        .trim()
        .replace(INVALID_FILENAME_CHARS, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/\.+$/g, '')
        .replace(/^-+|-+$/g, '');

    return sanitized.length > 0 ? sanitized : fallback;
}
