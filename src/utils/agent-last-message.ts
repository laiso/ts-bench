/**
 * Extract the agent's final natural-language reply for benchmark logs.
 * Supports Claude Code --print JSON and Claude session JSONL assistant events.
 */

function extractTextFromAssistantRecord(obj: Record<string, unknown>): string | null {
    if (obj.type !== 'assistant') {
        return null;
    }
    const msg = obj.message;
    if (!msg || typeof msg !== 'object') {
        return null;
    }
    const content = (msg as { content?: unknown }).content;
    if (!Array.isArray(content)) {
        return null;
    }
    const parts: string[] = [];
    for (const block of content) {
        if (
            block &&
            typeof block === 'object' &&
            (block as { type?: unknown }).type === 'text' &&
            typeof (block as { text?: unknown }).text === 'string'
        ) {
            parts.push((block as { text: string }).text);
        }
    }
    const joined = parts.join('');
    return joined.length > 0 ? joined : null;
}

/**
 * Last line-based assistant text from Claude Code session JSONL (newest assistant wins).
 */
export function extractLastAssistantFromClaudeJsonl(jsonl: string): string | null {
    let last: string | null = null;
    for (const line of jsonl.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }
        try {
            const obj = JSON.parse(trimmed) as Record<string, unknown>;
            const text = extractTextFromAssistantRecord(obj);
            if (text) {
                last = text;
            }
        } catch {
            continue;
        }
    }
    return last;
}

/**
 * Final result string from agents that emit a single JSON object (e.g. claude --print --output-format=json).
 */
export function extractLastAgentMessageFromStdout(stdout: string): string | null {
    const trimmed = stdout.trim();
    if (!trimmed) {
        return null;
    }

    const tryParse = (s: string): string | null => {
        try {
            const parsed = JSON.parse(s) as Record<string, unknown>;
            if (!parsed || typeof parsed !== 'object') {
                return null;
            }
            if (parsed.type === 'result' && typeof parsed.result === 'string') {
                return parsed.result;
            }
            if (typeof parsed.message === 'string') {
                return parsed.message;
            }
        } catch {
            return null;
        }
        return null;
    };

    const whole = tryParse(trimmed);
    if (whole) {
        return whole;
    }

    const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
        const fromLine = tryParse(lines[i]!);
        if (fromLine) {
            return fromLine;
        }
    }

    return null;
}
