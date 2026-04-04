# AGENTS.md

ts-bench is a TypeScript AI Agent Benchmark CLI built with **Bun**. See `README.md` for quick start; handbook: `specs/000-project-handbook/`.

## Key commands

| Task | Command |
|---|---|
| Install deps | `bun install` |
| Unit tests | `bun test ./src` |
| Type check | `bunx --bun tsc -p . --noEmit` |
| CLI help | `bun src/index.ts --help` |
| List exercises | `bun src/index.ts --list` |

## Caveats

- **Bun, not Node.js** — all commands use `bun`.
- Exercism exercises (`repos/exercism-typescript`) contain intentionally broken placeholder code; `--test-only` failures are expected.
- Running benchmarks requires an AI agent CLI + API key (e.g. `ANTHROPIC_API_KEY`). Use `--test-only` or `--print-instructions` for dry runs.
- Exercise tests use `corepack yarn` (Yarn v4). Install: `npm install -g corepack@0.29.4 && corepack enable`.

## v2 (SWE-Lancer) additional setup

- Requires Docker and submodules: `git submodule update --init repos/frontier-evals repos/expensify-app` + `mkdir -p .patches`.
- The monolith image (`swelancer/swelancer_x86_monolith:releasev1`) is ~15 GB.
- Tasks take 5+ minutes each (ansible setup + npm install inside container).
- `--dataset v2` automatically enables `--docker`.
- See `specs/000-project-handbook/environment.md` for full Docker setup.
