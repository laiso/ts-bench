# Subscription-based (API Key-less) Authentication

**Issue**: [#59](https://github.com/laiso/ts-bench/issues/59)

## Background

Currently, all agents in ts-bench require an API key set in environment variables (e.g., `ANTHROPIC_API_KEY`). However, modern CLI agents like Claude Code, Gemini CLI, and Codex support subscription-based authentication via local login sessions (`claude login`, `gemini login`, etc.). This spec enables agents to run using these local credentials without API keys.

---

## Design Decision: All-in-Docker Approach

Three approaches were evaluated:

| Approach | Description | Pros | Cons |
|---|---|---|---|
| A. Host mount | Mount host `~/.claude` etc. into container | Simple | OS-dependent paths (Win/Mac/Linux), requires host CLI install |
| B. Container-local auth | Authenticate inside Docker, persist via Docker volume | No host dependency, OS-agnostic | Requires `--setup-auth` command, browser-less OAuth |
| C. Hybrid (A + B) | Support both host mount and container volume | Maximum flexibility | Most complex |

**Chosen: Approach B (Container-local auth)**

Rationale:
- Agent CLIs are already installed inside Docker via `scripts/run-agent.sh` + persistent CLI cache volume (`createCliCacheArgs` in `src/utils/docker.ts`). Authentication is the only missing piece.
- Eliminates OS-specific path handling (`process.env.HOME` vs `homedir()`, Windows `USERPROFILE`, etc.).
- Docker volumes are OS-agnostic — no Win/Mac/Linux differences.
- Simpler implementation than Approach A (no `src/utils/auth.ts` host filesystem detection needed).

---

## Architecture

### Current: CLI cache persistence (existing pattern)

```
Host: ~/.cache/ts-bench/cli  →  Container: /root/.local
```

`src/utils/docker.ts` `createCliCacheArgs()` provides this. Agent CLIs installed via `scripts/run-agent.sh` persist across container runs.

### New: Auth state persistence (same pattern)

```
Host: ~/.cache/ts-bench/auth/claude  →  Container: /root/.claude
Host: ~/.cache/ts-bench/auth/gemini  →  Container: /root/.gemini
Host: ~/.cache/ts-bench/auth/codex   →  Container: /root/.codex
```

### Authentication priority

```
1. Environment variable (API key) exists?  →  Use API key (GHA, explicit key)
2. Auth volume has credentials?            →  Use subscription auth (local Docker)
3. Neither                                 →  Error: "Set API key or run --setup-auth <agent>"
```

GitHub Actions workflows are unaffected — they always provide API keys via `${{ secrets.* }}`, so priority 1 applies. Subscription auth (priority 2) is for local development only.

---

## Tier 1 Targets

| Agent | Auth directory (container) | Auth directory (host volume) | Login command |
|---|---|---|---|
| Claude | `/root/.claude` | `~/.cache/ts-bench/auth/claude` | `claude login` |
| Gemini | `/root/.gemini` | `~/.cache/ts-bench/auth/gemini` | `gemini login` |
| Codex | `/root/.codex` | `~/.cache/ts-bench/auth/codex` | `codex login` |

---

## Implementation Tasks

### Task 1: Add `createAuthCacheArgs()` to `src/utils/docker.ts`

Follow the existing `createCliCacheArgs()` pattern. Add a mapping of agent names to container auth paths, and a function that creates the volume mount arguments.

```typescript
const AUTH_CACHE_AGENTS: Record<string, string> = {
  claude: '/root/.claude',
  gemini: '/root/.gemini',
  codex: '/root/.codex',
};

export function createAuthCacheArgs(agent: string): string[] {
  const containerPath = AUTH_CACHE_AGENTS[agent];
  if (!containerPath) return [];
  const hostPath = join(homedir(), '.cache', 'ts-bench', 'auth', agent);
  mkdirSync(hostPath, { recursive: true });
  return ['-v', `${hostPath}:${containerPath}`];
}
```

### Task 2: Make API keys optional in agent builders

Modify `src/agents/builders/claude.ts`, `src/agents/builders/gemini.ts`, and `src/agents/builders/codex.ts`.

Add a helper to `src/utils/env.ts`:

```typescript
export function tryAnyEnv(keys: string[]): { key: string; value: string } | null {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim().length > 0) {
      return { key, value };
    }
  }
  return null;
}
```

In each agent builder's `getEnvironmentVariables()`, for the default provider case:
- Call `tryAnyEnv()` instead of `requireAnyEnv()`.
- If it returns null, check if the auth cache directory exists on the host (`~/.cache/ts-bench/auth/<agent>/`).
- If auth cache exists, return env without the API key (subscription auth will be used).
- If neither exists, throw an error with a message suggesting `--setup-auth`.

Only the default/primary provider cases should fall back to subscription auth. Explicit provider overrides (openrouter, dashscope, etc.) should still require their respective API keys.

### Task 3: Apply auth mounts in `src/execution/docker-strategy.ts`

For v1 execution (around line 140-148), add `...createAuthCacheArgs(agentName)` to the Docker command array. This requires passing the agent name through to the execution strategy — check how `this.containerName` is already available and determine the agent name from context.

Replace the hardcoded `claudeMount` on line 36 with `createAuthCacheArgs('claude')` for v2 execution.

### Task 4: Apply auth mounts in `src/execution/v2-container.ts`

Replace the hardcoded `claudeMount` (line 310-311) in `buildMounts()` with `createAuthCacheArgs('claude')`. If the agent name is available in context, make it generic for all Tier 1 agents.

### Task 5: Implement `--setup-auth <agent>` CLI command

Add a new CLI option `--setup-auth` that accepts an agent name. When invoked:

1. Start a Docker container interactively (`docker run --rm -it`).
2. Mount the CLI cache volume (`createCliCacheArgs()`).
3. Mount the auth cache volume (`createAuthCacheArgs(agent)`).
4. Run the agent's login command inside the container (e.g., `bash /app/scripts/run-agent.sh claude login`).
5. The CLI (e.g., Claude Code) will use Device Code Flow — print a URL and code to the terminal. The user opens the URL in their host browser and completes OAuth.
6. Auth state is saved to the auth cache volume and persists for future runs.

Add this to the CLI parser in `src/utils/cli.ts` or `src/index.ts`.

### Task 6: Update `specs/000-project-handbook/environment.md`

Add a new section "Subscription-based Authentication" after the "Container Design" section, documenting:
- The `--setup-auth` command
- How auth volumes work
- That GHA is unaffected (still uses API key secrets)

Update the line at line 56 that says "Each agent requires the appropriate API key for its provider; if a required key is missing... execution will immediately fail with an error" to note the subscription auth alternative.

### Task 7: Tests

- Add unit tests for `createAuthCacheArgs()` in `src/utils/__tests__/docker.test.ts` (or create if it doesn't exist).
- Add unit tests for `tryAnyEnv()` in `src/utils/__tests__/env.test.ts`.
- Update agent builder tests to verify that `buildCommand()` does NOT throw when no API key is set but the auth cache directory exists.
- Update agent builder tests to verify that `buildCommand()` DOES throw when neither API key nor auth cache exists.

---

## Platform Considerations

| Platform | Impact |
|---|---|
| Linux | Fully supported. Native Docker, no path issues. |
| macOS | Fully supported. `homedir()` returns correct path. Docker Desktop file sharing covers `~/.cache/`. |
| Windows | Low priority. ts-bench does not explicitly support Windows. If needed, `homedir()` handles `USERPROFILE` correctly. |
| GitHub Actions | No impact. API keys via `${{ secrets.* }}` take priority. Auth volumes are not present on ephemeral runners. |

Note: The existing codebase has inconsistent home directory resolution — `process.env.HOME || '/root'` in `src/execution/docker-strategy.ts` (line 36) and `src/execution/v2-container.ts` (line 306) vs `homedir()` in `src/utils/docker.ts`. The new code should consistently use `homedir()` from the `os` module. Optionally unify the existing code as well.

---

## Acceptance Criteria

- [ ] `bun src/index.ts --setup-auth claude` starts an interactive Docker session and completes `claude login`.
- [ ] `bun src/index.ts --agent claude --exercise acronym --docker` succeeds without `ANTHROPIC_API_KEY` after `--setup-auth`.
- [ ] Same for `--agent gemini` and `--agent codex`.
- [ ] Existing API key-based execution is unaffected.
- [ ] GitHub Actions workflows pass without changes.
- [ ] Auth state persists across Docker container restarts (via `~/.cache/ts-bench/auth/` volume).
