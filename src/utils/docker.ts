import { mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export const DOCKER_BASE_ARGS = ["docker", "run", "--rm", "-i"] as const;
const CLI_CACHE_ENV = 'TS_BENCH_CLI_CACHE';
export const CLI_CACHE_CONTAINER_PATH = '/root/.local';
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
    const allowEmptyKeys = new Set(['NPM_CONFIG_PREFIX', 'npm_config_prefix', 'NPM_PREFIX']);
    return Object.entries(envVars)
        // Security hardening: only pass variables that have explicit values set
        // Avoid implicit host env pass-through with `-e KEY` which can leak secrets unexpectedly
        .filter(([key, value]) => typeof value === 'string' && (value.length > 0 || allowEmptyKeys.has(key)))
        .flatMap(([key, value]) => ["-e", `${key}=${value}`]);
}

export function createCliCacheArgs(): string[] {
  const hostPath = resolveCliCachePath();
  return ['-v', `${hostPath}:${CLI_CACHE_CONTAINER_PATH}`];
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
