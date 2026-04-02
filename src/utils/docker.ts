import { mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';

export const DOCKER_BASE_ARGS = ["docker", "run", "--rm"] as const;
const CLI_CACHE_ENV = 'TS_BENCH_CLI_CACHE';
/** Default mount target (ts-bench-container, v1) */
export const CLI_CACHE_CONTAINER_PATH = '/root/.local';
/** SWE-Lancer image already uses /root/.local/bin for mitmdump etc.; mount CLI cache elsewhere */
export const SWELANCER_CLI_CACHE_CONTAINER_PATH = '/opt/ts-bench-cli';
const NPM_CACHE_ENV = 'TS_BENCH_NPM_CACHE';
export const NPM_CACHE_CONTAINER_PATH = '/root/.npm';

export interface DockerWorkspaceOptions {
  workspacePath: string;
  workingDir?: string;
}

export function createWorkspaceArgs(options: DockerWorkspaceOptions): string[] {
  const { workspacePath, workingDir = "/workspace" } = options;
  return [
    "-v", `${workspacePath}:${workingDir}`,
    "-w", workingDir
  ];
}

export function createEnvironmentArgs(envVars: Record<string, string>): string[] {
    // These keys are passed as empty strings on purpose:
    // - NPM_* clears host prefix overrides so the container can use its own Node setup.
    // - ANTHROPIC_API_KEY clears any inherited Anthropic key when Claude is configured for OpenRouter.
    const allowEmptyKeys = new Set(['NPM_CONFIG_PREFIX', 'npm_config_prefix', 'NPM_PREFIX', 'ANTHROPIC_API_KEY']);
    return Object.entries(envVars)
        // Security hardening: only pass variables that have explicit values set
        // Avoid implicit host env pass-through with `-e KEY` which can leak secrets unexpectedly
        .filter(([key, value]) => typeof value === 'string' && (value.length > 0 || allowEmptyKeys.has(key)))
        .flatMap(([key, value]) => ["-e", `${key}=${value}`]);
}

/**
 * Write environment variables to a temporary file and return "--env-file" args
 * plus a cleanup callback.  Using a file instead of "-e KEY=VALUE" keeps secrets
 * out of the process list (visible via "ps aux" or "/proc/PID/cmdline").
 *
 * The file is created with mode 0o600 so only the current user can read it.
 * Always call cleanup() after the Docker command completes (success or failure).
 */
export function createEnvironmentFile(envVars: Record<string, string>): { args: string[]; cleanup: () => void } {
    // These keys are passed as empty strings on purpose:
    // - NPM_* clears host prefix overrides so the container can use its own Node setup.
    // - ANTHROPIC_API_KEY clears any inherited Anthropic key when Claude is configured for OpenRouter.
    const allowEmptyKeys = new Set(['NPM_CONFIG_PREFIX', 'npm_config_prefix', 'NPM_PREFIX', 'ANTHROPIC_API_KEY']);
    const lines = Object.entries(envVars)
        .filter(([key, value]) => typeof value === 'string' && (value.length > 0 || allowEmptyKeys.has(key)))
        .map(([key, value]) => `${key}=${value}`);
    const filePath = join(tmpdir(), `ts-bench-env-${process.pid}-${Date.now()}`);
    writeFileSync(filePath, lines.join('\n'), { mode: 0o600 });
    return {
        args: ['--env-file', filePath],
        // Silently ignore errors: the file may have already been removed or
        // the process may be shutting down; cleanup is best-effort.
        cleanup: () => { try { unlinkSync(filePath); } catch { /* best-effort */ } }
    };
}

export function createCliCacheArgs(containerMountPath: string = CLI_CACHE_CONTAINER_PATH): string[] {
  const hostPath = resolveCliCachePath();
  return ['-v', `${hostPath}:${containerMountPath}`];
}

function resolveCliCachePath(): string {
  const explicit = process.env[CLI_CACHE_ENV];
  const base = explicit && explicit.trim().length > 0
    ? explicit
    : join(homedir(), '.cache', 'ts-bench', 'cli');
  mkdirSync(base, { recursive: true });
  return base;
}

export function createNpmCacheArgs(): string[] {
  const hostPath = resolveNpmCachePath();
  return ['-v', `${hostPath}:${NPM_CACHE_CONTAINER_PATH}`];
}

function resolveNpmCachePath(): string {
  const explicit = process.env[NPM_CACHE_ENV];
  const base = explicit && explicit.trim().length > 0
    ? explicit
    : join(homedir(), '.cache', 'ts-bench', 'npm');
  mkdirSync(base, { recursive: true });
  return base;
}
