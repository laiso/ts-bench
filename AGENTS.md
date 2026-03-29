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

### v2 (SWE-Lancer) Docker caveats in Cursor Cloud

- Docker must be installed and `dockerd` started manually: `sudo dockerd &>/tmp/dockerd.log &`
- Fix socket permissions after starting: `sudo chmod 666 /var/run/docker.sock`
- The monolith image `swelancer/swelancer_x86_monolith:releasev1` is ~15 GB; first pull takes several minutes.
- Docker requires `fuse-overlayfs` storage driver and `iptables-legacy` in this VM (see system prompt instructions for Docker-in-Docker setup).
- v2 `--test-only` runs against unmodified Expensify code, so test failures are expected (no agent patch applied).
- v2 tasks take 5+ minutes per exercise due to ansible setup + npm install inside the container.
- Submodules needed: `repos/frontier-evals` and `repos/expensify-app`. Init with `git submodule update --init repos/frontier-evals repos/expensify-app`; also `mkdir -p .patches`.
- v2 automatically enables `--docker` (see `src/utils/cli.ts` line 119).
