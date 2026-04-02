import { mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

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

/** Mapping of agent names to their auth config directory inside the container. */
export const AUTH_CACHE_AGENTS: Record<string, string> = {
  claude: '/root/.claude',
  gemini: '/root/.gemini',
  codex: '/root/.codex',
};

/**
 * Create Docker volume mount arguments for an agent's subscription-auth
 * state directory.  Returns an empty array for unknown agents.
 */
export function createAuthCacheArgs(agent: string): string[] {
  const containerPath = AUTH_CACHE_AGENTS[agent];
  if (!containerPath) return [];
  const hostPath = resolveAuthCachePath(agent);
  return ['-v', `${hostPath}:${containerPath}`];
}

/**
 * Return the host-side auth cache directory for an agent, creating it
 * if it does not exist.
 */
export function resolveAuthCachePath(agent: string): string {
  const base = join(homedir(), '.cache', 'ts-bench', 'auth', agent);
  mkdirSync(base, { recursive: true });
  return base;
}

/** Return true when the host-side auth cache for `agent` contains at least one file. */
export function hasAuthCache(agent: string): boolean {
  try {
    const dir = join(homedir(), '.cache', 'ts-bench', 'auth', agent);
    return readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}
