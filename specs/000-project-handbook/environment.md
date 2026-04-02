# Environment Design

## Policy Overview

- Execution modes: "GHA: Native" and "Local: Docker (default)/Native (optional)".
- Emphasis on reproducibility and safety: When running in Docker, pass environment variables explicitly and mount test files as read-only.
- Container name unified as `TS_BENCH_CONTAINER = "ts-bench-container"`.

---

## Execution Modes

- GHA (Native)
    - Default for `use_docker` in `.github/workflows/benchmark.yml` is `false`.
    - Agent CLIs are installed on the runner and executed directly.

- Local (Docker, default)
    - Uses the included `Dockerfile` to eliminate environment differences.
    - Run with CLI option `--docker`.

- Local (Native, for debugging)
    - Install agent CLIs on the host and run without `--docker`.

---

## Container Design

- Container name: `ts-bench-container` (`TS_BENCH_CONTAINER`)
- Base image: `oven/bun:1.2.22-slim`
- Included components:
    - Git/Curl/NPM/Unzip/bzip2
    - Node.js 20 (via NodeSource) + npm 10
    - corepack (Enable `corepack@0.29.4` compatible with Node 20)
    - PATH additions: `/root/.local/bin`
    - Agent bootstrap script: `/app/scripts/run-agent.sh`
- Agent CLIs are installed on-demand by `run-agent.sh`. They are not baked into the image to keep layers small。
    - `scripts/run-agent.sh` installs agent CLIs on demand (supports aider, goose, cursor, and Node-based CLIs), always installing to `/root/.local`. The host-side cache directory `TS_BENCH_CLI_CACHE` (default: `~/.cache/ts-bench/cli`) is mounted for persistence across runs.
    - `scripts/smoke-agents.sh` verifies each agent's CLI with `--version` inside Docker, using the same cache mount to avoid redundant installations.
    - Base args: `docker run --rm -i`
    - Workspace: Mount host exercise directory to `/workspace` and set as working directory.
    - Test files: Mount individually as read-only (`-v host:container:ro`).
    - Environment variables: Only explicitly set keys are passed with `-e KEY=VALUE` (no implicit passthrough).
    - Implementation reference: `src/execution/docker-strategy.ts` / `src/utils/docker.ts`

- Local Execution
    - Change to each exercise directory before running (for simple path resolution).
    - Implementation reference: `src/runners/test.ts` / `src/runners/test-only.ts`

---

## Testing and Package Management

- Common test command: `corepack yarn && corepack yarn test`
- Exercism exercises assume Yarn v4 (e.g., `packageManager: yarn@4.5.1`).
- In the container, `corepack@0.29.4` is enabled (compatible with Node 20).
- Each agent requires the appropriate API key for its provider; if a required key is missing (e.g., `OPENAI_API_KEY` for OpenAI agents), execution will immediately fail with an error — unless subscription-based authentication has been set up for that agent (see below).

---

## Subscription-based Authentication

Agents that support local login sessions (Claude Code, Gemini CLI, Codex) can run **without API keys** after a one-time setup.

### Setup

```bash
# Authenticate an agent inside Docker (one-time per agent)
bun src/index.ts --setup-auth claude
bun src/index.ts --setup-auth gemini
bun src/index.ts --setup-auth codex
```

This starts an interactive Docker container, runs the agent's login command, and persists auth state in a Docker volume at `~/.cache/ts-bench/auth/<agent>/`.

### How it works

| Priority | Condition | Behaviour |
|---|---|---|
| 1 | API key env var is set | Use API key (GHA, explicit key) |
| 2 | Auth cache volume has credentials | Use subscription auth (local Docker) |
| 3 | Neither | Error with suggestion to set API key or run `--setup-auth` |

### Auth volume mounts

| Agent | Host path | Container path |
|---|---|---|
| Claude | `~/.cache/ts-bench/auth/claude` | `/root/.claude` |
| Gemini | `~/.cache/ts-bench/auth/gemini` | `/root/.gemini` |
| Codex | `~/.cache/ts-bench/auth/codex` | `/root/.codex` |

**GitHub Actions is unaffected** — workflows always provide API keys via `${{ secrets.* }}`, so priority 1 applies. Subscription auth is for local development only.

Implementation: `src/utils/docker.ts` (`createAuthCacheArgs`, `hasAuthCache`), agent builders (`claude.ts`, `gemini.ts`, `codex.ts`), `src/index.ts` (`runSetupAuth`).

Spec: `specs/000-project-handbook/subscription-auth.md`

---

## GitHub Actions (Native Execution)

- Workflow: `.github/workflows/benchmark.yml`
- Default for `use_docker` is `false` (native). Add `--docker` only when specified.
- Agent CLIs installed on runner ("Install agent CLI (local mode)" step).
- Secrets: Pass `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GROQ_API_KEY` etc. via `env`.
- Example command: `bun src/index.ts --agent <agent> --model <model> [--docker] ...`

---

## GitHub Actions (v2 SWE-Lancer)

- Workflow: `.github/workflows/benchmark-v2.yml` (manual `workflow_dispatch`). **Task input** accepts **one or more** v2 task ids as a **comma-separated list** (same as `--tasks a,b,c` locally; a single id uses `--task`). Use workflow input **`job_timeout_minutes`** when running several tasks so the job is not killed before completion (default **360** minutes).
- Workflow: `.github/workflows/benchmark-v2-set.yml` (manual `workflow_dispatch`, **subset of tasks**). Task pool is **`data/v2-top-reward-tasks.json`**: all **`ic_swe`** rows sorted by **`price`** descending (regenerate: `bun scripts/generate-v2-top-reward-tasks.ts`; optional **`TOP_N`** to cap). Defaults: **`task_count=1`**, **`job_count=1`** (one task, one job). Inputs: **`task_count`** (≤ pool size) and **`job_count`** (1…`task_count`) split the first *N* ids into *J* **roughly equal shards**. **`max_parallel`** (default 16). Shards use **`--result-name shard-<i>`** and **`--skip-leaderboard-refresh`**; **aggregate** merges **`shard-*.json`** via `scripts/merge-v2-set-shards.ts`.
- **Submodules**: Checkout uses `submodules: recursive` and **Git LFS** (`lfs: true` + `git lfs pull` in submodules) so `repos/frontier-evals` and `repos/expensify-app` are present.
- **Docker**: The job pulls `swelancer/swelancer_x86_monolith:releasev1` (`linux/amd64`). Agent and tests run inside that image per the CLI (same as local v2).
- **Disk**: Hosted runners have limited disk; the workflow runs a best-effort cleanup before checkout. The monolith image is large; if the job fails with “no space left”, use a larger/self-hosted runner or a pre-warmed image cache.
- **Timeouts**: Job `timeout-minutes` is set by workflow input **`job_timeout_minutes`** (default **360**). Per-exercise timeout defaults to **3600** seconds (CLI also floors v2 at 3600s). Ansible waits for `/setup_done.txt` are controlled by **`TS_BENCH_V2_SETUP_WAIT_SEC`** (workflow input `v2_setup_wait_seconds`, default **900**).
- **Secrets**: Same as v1 — set the keys your agent and provider need (e.g. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CURSOR_API_KEY`, `OPENROUTER_API_KEY`, …). Missing keys fail fast when the agent runs.
- **Artifacts**: `data/results/`, `results/<agent>/logs/`, `benchmark-summary.txt`, `.patches/`, and **`.v2-swelancer-logs/`** (per-issue `pytest.log`, `npm_run_dev.log`, `mitmdump.log`, `ffmpeg.log`, `pytest_exit_code` from the monolith). `benchmark-v2.yml` uploads these together; `benchmark-v2-set.yml` also includes **`.v2-swelancer-logs/`** in each shard’s `v2-set-shard-*-logs-*` artifact.
- **Job log**: After the benchmark step, `scripts/print-v2-swelancer-logs.sh` prints a collapsible **`v2 SWE-Lancer host logs`** section (file list + `pytest.log` tail up to 1000 lines, other logs truncated if large) so failures are visible without downloading the artifact.
- **Expected runtime**: Often **well over** an hour **per task** (image pull, Expensify setup inside the container, agent, Playwright/pytest). Multiple tasks run **sequentially** in one job; scale **`job_timeout_minutes`** accordingly. Treat as a long-running manual job, not a PR gate.

---

## Main CLI Options

- `--agent <agent>`: Agent to use (claude/goose/aider/codex/gemini/opencode/qwen/cursor/copilot/vibe/kimi)
- `--model <model>`: Model to use
- `--provider <provider>`: openai/anthropic/google/openrouter/dashscope/xai/deepseek/moonshot
- `--docker`: Switch to Docker execution
- **v1**: `--exercise <name|N|a,b,c>` — single slug, first N exercises, or comma-separated slugs
- **v2**: `--task <id>`, `--tasks id,id,...`, or `--task-limit <n>` — SWE-Lancer task ids only (`--exercise` is rejected with `--dataset v2`)
- `--exercism-path <path>`: Exercism root (default: `repos/exercism-typescript`)
- `--test-only` / `--print-instructions`: Test only / show instructions
- `--save-result --result-dir <dir>`: Save results and refresh local aggregate data (e.g. `public/data/latest-results.json`; see [leaderboard.md](leaderboard.md))
- `--timeout <sec>`: Timeout per exercise (default: 300)

---

## Claude (OpenRouter)

- Required env: `OPENROUTER_API_KEY`
- Optional env: `ANTHROPIC_BASE_URL` (default: `https://openrouter.ai/api`)
- Claude Code auth token is derived from `OPENROUTER_API_KEY`; `ANTHROPIC_API_KEY` is forced to empty to avoid conflicts.

Example:

```
export OPENROUTER_API_KEY=sk-or-...
bun src/index.ts --agent claude --provider openrouter --model <openrouter-model-id> --exercise acronym --docker
```

---

## Kimi (Moonshot)

- Required env: `KIMI_API_KEY`
- Optional env: `KIMI_BASE_URL` (default: `https://api.moonshot.ai/v1`)
- Default provider for `--agent kimi` is `moonshot`

Example:

```
export KIMI_API_KEY=sk-...
bun src/index.ts --agent kimi --provider moonshot --model kimi-k2.5 --exercise acronym --docker
```

---

## Directories and I/O

- Exercise root: `repos/exercism-typescript` (`EXERCISM_PRACTICE_PATH`)
- Exercise path: `exercises/practice/<exercise>`
- Output (example): Use `--save-result --result-dir ./results` to export JSON

---

## SWE-Lancer dataset (`--dataset v2`)

Benchmark v2 uses **two Git submodules** (paths are fixed in `src/config/constants.ts`):

| Submodule | Path | Role |
|-----------|------|------|
| [openai/frontier-evals](https://github.com/openai/frontier-evals) | `repos/frontier-evals` | `project/swelancer/all_swelancer_tasks.csv` and per-task metadata under `project/swelancer/issues/<taskId>/` |
| [Expensify/App](https://github.com/Expensify/App) | `repos/expensify-app` | Working tree for agent runs (`SWELANCER_REPO_PATH`) |

**Initial setup**

```bash
git submodule update --init repos/frontier-evals repos/expensify-app
```

- **Git LFS**: `frontier-evals` may use LFS objects. Install [git-lfs](https://git-lfs.com/) (`brew install git-lfs` on macOS), then run `git lfs install` once per machine before checking out the submodule.
- **Checkout conflicts**: If `repos/frontier-evals` was partially checked out or has local untracked files blocking the pinned commit, from that directory run `git clean -fdx && git checkout -f` then re-run `git submodule update --init repos/frontier-evals` from the repo root.
- **Expensify clone size**: The App repo is large; first clone can take several minutes. If a fetch fails with pack/index errors, remove `repos/expensify-app` and `.git/modules/expensify-app`, then run `git submodule update --init repos/expensify-app` again.

**Sanity check** (from repository root):

```bash
test -f repos/frontier-evals/project/swelancer/all_swelancer_tasks.csv && echo "frontier-evals OK"
test -d repos/expensify-app/.git && echo "expensify-app OK"
```

v1 (Exercism-only) runs use the `repos/exercism-typescript` submodule; initialize it with `git submodule update --init repos/exercism-typescript` if needed.

### Docker execution (required for v2)

`--dataset v2` turns on Docker for both the agent and the test runner (`src/utils/cli.ts`). Runs use the **SWE-Lancer monolith image**, not the repo `Dockerfile` (that image is for v1-style `ts-bench-container`).

| Item | Detail |
|------|--------|
| Image | `swelancer/swelancer_x86_monolith:releasev1` (`SWELANCER_IMAGE` in `src/config/constants.ts`) |
| Platform | `linux/amd64` (benchmark passes `--platform linux/amd64`; Apple Silicon uses emulation) |
| Host mounts | Repo root read-only at `/ts-bench-host`, frontier issues at `/app/tests/issues`, `.patches` at `/patches`, CLI cache, npm cache, optional `~/.claude` |
| Inside container | Working dir `/app/expensify`; setup uses `ansible-playbook` from `setup_expensify.yml` with `ISSUE_ID` set to the task id |

**One-shot setup** (from repository root):

```bash
./scripts/setup-v2-env.sh
```

This checks Docker is running, initializes the two submodules, creates `.patches`, and `docker pull`s the monolith image. The image is large; first pull may take a long time.

**Manual pull** (equivalent to the script):

```bash
docker pull --platform linux/amd64 swelancer/swelancer_x86_monolith:releasev1
```

**Agent credentials** are read from your shell environment (same as v1). For Cursor: `CURSOR_API_KEY`. They are passed into the container via the agent wrapper / `run-agent.sh` as configured for each agent.

**Smoke run** (one task id from the CSV, e.g. `16912_4`):

```bash
export CURSOR_API_KEY=...   # or rely on your existing shell / IDE injection
bun src/index.ts --agent cursor --model sonnet --dataset v2 --task 16912_4 --verbose
```

**Without Docker (native v2)** you can pass an explicit flag only when you intentionally avoid the default: the CLI sets Docker on for v2; to experiment with host-side git checkout + patch in `repos/expensify-app`, you would need a workflow that disables Docker (advanced; not the default path).

---

## Security / Reproducibility

- Docker uses `--rm` to discard containers after each run (no state left).
- Test files are mounted read-only (prevents unintended modification during testing).
- Environment variables are only passed explicitly with `-e KEY=VALUE` (no passthrough for unset keys).
- corepack/Yarn versions are fixed to improve reproducibility of dependency resolution.

---

## Local Usage

- Docker execution (default)
    1) Build runtime image: `docker build -t ts-bench-container .`
    2) Run: `bun src/index.ts --agent aider --model gpt-4o --docker`
       - The first invocation for each agent installs the corresponding CLI inside the ephemeral container via `run-agent.sh`.

- Native execution (debug)
    - Install agent CLIs on host (see GHA install steps)
    - Run: `bun src/index.ts --agent aider --model gpt-4o`

---

## Troubleshooting

- corepack not found: `npm i -g corepack@0.29.4 && corepack enable`
- Yarn workspace warnings: Run in each exercise directory (handled by design for both Docker/local).
- Agent CLI not found: When using Docker, confirm `/app/scripts/run-agent.sh` supports the agent or install the CLI manually on the host when running without Docker.

---

## Customization Guidelines

- Change container name: `src/config/constants.ts`
- Add agent CLIs: Add install steps to `Dockerfile`
- Add environment variables: Only pass those with values (Docker arg `-e KEY=VALUE`); specify as needed
- Update Node/corepack: Update base image/version and check compatibility
- Extend on-demand installation: Update `scripts/run-agent.sh` to support additional agents or custom installers.
