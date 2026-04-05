# Copilot Instructions for ts-bench

ts-bench is a **TypeScript AI Agent Benchmark CLI** built with **Bun**. It runs AI coding agents against TypeScript exercises, executes the test suites, and records pass/fail results.

## Key commands

| Task | Command |
|---|---|
| Install deps | `bun install` |
| Unit tests | `bun test ./src` |
| Type check | `bunx --bun tsc -p . --noEmit` |
| CLI help | `bun src/index.ts --help` |
| List exercises | `bun src/index.ts --list` |
| Build site assets | `bun run build:all` |

> **Always use `bun`, never `node` or `npm run` for source files.**

## Repository structure

```
src/
  agents/       # AgentBuilder implementations per agent (claude, aider, goose, …)
  benchmark/    # Core benchmark loop
  config/       # Constants, paths, CLI types
  datasets/     # v1 (Exercism) and v2 (SWE-Lancer) dataset adapters
  execution/    # Docker and local execution strategies
  exercises/    # Exercise metadata and reset helpers
  runners/      # Test runner (test.ts, test-only.ts)
  site/         # SWE-Lancer Pages builder helpers
  utils/        # Docker CLI helpers, file utilities
scripts/        # Shell and TS build/setup scripts
repos/          # Git submodules (exercism-typescript, frontier-evals, expensify-app)
specs/000-project-handbook/  # Operational docs (environment, methodology, …)
data/           # Static data files (v2 task lists, results)
public/         # Aggregated leaderboard JSON
docs/           # Generated SWE-Lancer Pages (do not edit manually)
```

## Datasets

### v1 — Exercism (default)
- 25 self-contained TypeScript exercises from `repos/exercism-typescript`.
- No Docker required; exercises run with `corepack yarn && corepack yarn test`.
- Submodule init: `git submodule update --init repos/exercism-typescript`

### v2 — SWE-Lancer (Expensify)
- Real-world tasks from the Expensify monorepo; **requires Docker**.
- Monolith image: `swelancer/swelancer_x86_monolith:releasev1` (~15 GB).
- One-time setup: `./scripts/setup-v2-env.sh`
- Submodules: `git submodule update --init repos/frontier-evals repos/expensify-app`
- `--dataset v2` automatically enables Docker; per-task timeout floors at 3600 s.

## Supported agents

`claude` · `aider` · `goose` · `codex` · `gemini` · `opencode` · `qwen` · `cursor` · `copilot` · `vibe` · `kimi`

Each agent has a dedicated builder in `src/agents/builders/`. Add new agents there and register them in `src/agents/factory.ts`.

## Architecture patterns

- **AgentBuilder** (`src/agents/types.ts`): one class per agent; implements `buildCommand(instructions, fileList)` → `Command`.
- **Execution strategies**: `DockerStrategy` (`src/execution/docker-strategy.ts`) and `LocalStrategy`; selected by `--docker` flag or dataset.
- **Benchmark loop**: resets exercise state via `git checkout HEAD -- .`, invokes agent, restores test files, runs tests, records result.
- **Results**: JSON saved under `--result-dir`; aggregated into `public/data/leaderboard.json` with `--save-result`.

## TypeScript conventions

- Strict mode is enabled (`strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`).
- Module resolution: `bundler`; use `.ts` extensions in imports (`allowImportingTsExtensions`).
- `verbatimModuleSyntax` is on — use `import type` for type-only imports.
- Target/lib: `ESNext`.
- `repos/` is excluded from compilation.

## Environment variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude (Anthropic direct) |
| `OPENAI_API_KEY` | OpenAI / Codex agents |
| `OPENROUTER_API_KEY` | OpenRouter provider |
| `GROQ_API_KEY` | Groq provider |
| `CURSOR_API_KEY` | Cursor agent |
| `KIMI_API_KEY` | Kimi (Moonshot) agent |

Subscription-based auth (no API key) is supported for Claude, Gemini, and Codex via `bun src/index.ts --setup-auth <agent>`.

## Testing notes

- **Any new or changed code must be accompanied by tests. Always run `bun test ./src` after writing tests and confirm all tests pass before finishing.**
- Exercise tests use **Yarn v4** (`corepack yarn`). Install corepack if missing: `npm install -g corepack@0.29.4 && corepack enable`.
- Exercism placeholder code is **intentionally broken**; `--test-only` failures on unmodified exercises are expected.
- Unit tests for the CLI itself live under `src/**/__tests__/` and run with `bun test ./src`.

## Docker notes

- v1 container: built from repo `Dockerfile`, named `ts-bench-container`.
- Agent CLIs are installed on-demand by `scripts/run-agent.sh` (not baked into the image).
- Only explicitly listed env vars are forwarded (`-e KEY=VALUE`); no implicit passthrough.
- Test files are mounted read-only to prevent agent modification.

## CI workflows

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | push/PR | Type check + unit tests |
| `benchmark.yml` | manual / schedule | v1 Exercism benchmark |
| `benchmark-v2.yml` | manual | v2 SWE-Lancer (single / comma-separated tasks) |
| `benchmark-v2-set.yml` | manual | v2 sharded benchmark set |
| `gh-pages.yml` | push to main | Deploy task browser to GitHub Pages |
