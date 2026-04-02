import { format } from 'util';

const DEFAULT_ANY_ENV_MESSAGE = 'Please set at least one of the following environment variables: %s';

export function requireEnv(key: string, message?: string): string {
    const value = process.env[key];
    if (value && value.trim().length > 0) {
        return value;
    }
    throw new Error(message ?? `Environment variable ${key} is not set`);
}

export function requireAnyEnv(keys: string[], message?: string): { key: string; value: string } {
    for (const key of keys) {
        const value = process.env[key];
        if (value && value.trim().length > 0) {
            return { key, value };
        }
    }

    const formatted = message ?? format(DEFAULT_ANY_ENV_MESSAGE, keys.join(', '));
    throw new Error(formatted);
}

/**
 * Try to find a non-empty value for any of the given environment variable
 * keys.  Returns `null` instead of throwing when none are set.
 */
export function tryAnyEnv(keys: string[]): { key: string; value: string } | null {
    for (const key of keys) {
        const value = process.env[key];
        if (value && value.trim().length > 0) {
            return { key, value };
        }
    }
    return null;
}
