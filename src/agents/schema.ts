import type { ProviderType } from '../config/base-types';

export type InstallConfig =
    | { method: 'mise'; tool: string; bin: string; version?: string }
    | { method: 'npm'; bin: string; package: string; version?: string }
    | { method: 'curl'; bin: string; url: string; cmdPrefix?: string; version?: string }
    | { method: 'pip'; bin: string; package: string; version?: string }
    | { method: 'uv_tool'; bin: string; package: string; python?: string; version?: string };

/**
 * A required host environment variable. A string means that variable must be
 * set; an array means at least one of the listed variables must be set.
 */
export type EnvRequirement = string | string[];

export interface ProviderEnvRule {
    /** Host env vars that must be present to run with this provider (fail fast) */
    require?: EnvRequirement[];
    /** Map of environment variable name to template or value (e.g. "${OPENAI_API_KEY}") */
    env?: Record<string, string>;
}

export interface AgentSchema {
    /** Agent identifier / name */
    name: string;
    /** Human-readable description */
    description?: string;
    /** Default LLM provider for this agent */
    defaultProvider: ProviderType;
    /** CLI tool installation configuration */
    install: InstallConfig;
    /** Default tool version */
    version?: string;
    /** Host env vars that must be present regardless of provider (fail fast) */
    require?: EnvRequirement[];
    /** Static or global environment variables */
    env?: Record<string, string>;
    /** Provider-specific environment variable rules and overrides */
    providers?: Record<string, ProviderEnvRule>;
    /** CLI argument template array (starting with executable name or flags) */
    command: string[];
}
