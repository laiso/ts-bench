import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
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

/** Mapping of agent names to their auth config directory inside the container. */
export const AUTH_CACHE_AGENTS: Record<string, string> = {
  claude: '/root/.claude',
  gemini: '/root/.gemini',
  codex: '/root/.codex',
};

/**
 * Arguments appended to `bash /app/scripts/run-agent.sh <agent>` to trigger
 * the agent's login flow.
 *
 * - Claude / Gemini: authenticate interactively on first launch (no extra args).
 * - Codex: requires `codex login --device-auth` for headless Device-Code flow.
 */
export const AUTH_LOGIN_ARGS: Record<string, string[]> = {
  claude: [],
  gemini: [],
  codex: ['login', '--device-auth'],
};

/**
 * Known credential files written by each agent CLI after a successful login.
 * Used by `--setup-auth` to detect whether auth succeeded even when the CLI
 * exits with a non-zero code (e.g. Claude/Gemini enter interactive mode and
 * the user presses Ctrl-C to quit).
 */
export const AUTH_CREDENTIAL_FILES: Record<string, string> = {
  claude: '.credentials.json',
  gemini: 'oauth_creds.json',
  codex: 'auth.json',
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

/**
 * Sentinel file written by `--setup-auth` to indicate that a successful
 * login was completed.  We check for this instead of "any file" because
 * the auth cache directory is mounted as the agent's config root inside
 * Docker, so the agent may also write non-auth files (e.g. Claude's
 * conversation logs under `projects/`) during normal API-key runs.
 */
export const AUTH_SENTINEL = '.ts-bench-auth';

/** Return true when the host-side auth cache for `agent` contains the sentinel written by `--setup-auth`. */
export function hasAuthCache(agent: string): boolean {
  try {
    const dir = join(homedir(), '.cache', 'ts-bench', 'auth', agent);
    return existsSync(join(dir, AUTH_SENTINEL));
  } catch {
    return false;
  }
}

/**
 * Return true when the host-side auth cache for `agent` contains the
 * agent-specific credential file (e.g. `.credentials.json` for Claude).
 * This is more reliable than checking the exit code because some CLIs
 * (Claude, Gemini) enter interactive mode after login and exit non-zero
 * when the user presses Ctrl-C.
 */
export function hasCredentialFile(agent: string): boolean {
  const fileName = AUTH_CREDENTIAL_FILES[agent];
  if (!fileName) return false;
  try {
    const dir = join(homedir(), '.cache', 'ts-bench', 'auth', agent);
    return existsSync(join(dir, fileName));
  } catch {
    return false;
  }
}
