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
- Each agent requires the appropriate API key for its provider; if a required key is missing (e.g., `OPENAI_API_KEY` for OpenAI agents), execution will immediately fail with an error.

---

## GitHub Actions (Native Execution)

- Workflow: `.github/workflows/benchmark.yml`
- Default for `use_docker` is `false` (native). Add `--docker` only when specified.
- Agent CLIs installed on runner ("Install agent CLI (local mode)" step).
- Secrets: Pass `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GROQ_API_KEY` etc. via `env`.
- Example command: `bun src/index.ts --agent <agent> --model <model> [--docker] ...`

---

## Main CLI Options

- `--agent <agent>`: Agent to use (claude/goose/aider/codex/gemini/opencode/qwen/cursor/kimi)
- `--model <model>`: Model to use
- `--provider <provider>`: openai/anthropic/google/openrouter/dashscope/xai/deepseek/moonshot
- `--docker`: Switch to Docker execution
- `--exercise <name|N|a,b,c>`: Specify exercise (name / first N / multiple)
- `--exercism-path <path>`: Exercism root (default: `exercism-typescript`)
- `--test-only` / `--print-instructions`: Test only / show instructions
- `--save-result --result-dir <dir>`: Save results and regenerate the local leaderboard dataset
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

- Exercise root: `exercism-typescript` (`EXERCISM_PRACTICE_PATH`)
- Exercise path: `exercises/practice/<exercise>`
- Output (example): Use `--save-result --result-dir ./results` to export JSON

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
