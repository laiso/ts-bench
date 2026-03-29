# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

ts-bench is a TypeScript AI Agent Benchmark CLI tool built with **Bun**. See `README.md` for full details.

### Key commands

| Task | Command |
|---|---|
| Install deps | `bun install` |
| Unit tests | `bun test ./src` |
| Type check | `bunx --bun tsc -p . --noEmit` |
| CLI help | `bun src/index.ts --help` |
| List exercises | `bun src/index.ts --list --exercism-path repos/exercism-typescript` |

### Non-obvious caveats

- **Bun is the primary runtime**, not Node.js. All project commands use `bun`, not `node` / `npm`.
- The exercism exercises submodule lives at `repos/exercism-typescript`. The CLI defaults to `exercism-typescript` (legacy path), so pass `--exercism-path repos/exercism-typescript` when running locally.
- Exercises contain intentionally broken placeholder code; `--test-only` will report failures — this is expected and by design.
- Running actual benchmarks requires an AI agent CLI + API key (e.g. `ANTHROPIC_API_KEY`). Use `--test-only` or `--print-instructions` for dry-run validation without credentials.
- Exercise test execution uses `corepack yarn` (Yarn v4). `corepack@0.29.4` must be installed globally and enabled: `npm install -g corepack@0.29.4 && corepack enable`.
- The v2 dataset (SWE-Lancer) requires Docker and additional submodules — see `docs/environment.md`.
