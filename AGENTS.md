# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

ts-bench is a TypeScript AI Agent Benchmark CLI tool built with **Bun**. See `README.md` for a minimal entry point; **handbook:** `specs/000-project-handbook/`. **Project principles:** `.specify/memory/constitution.md`.

**Spec Kit (SDD):** [GitHub Spec Kit](https://github.com/github/spec-kit) — `.specify/` (templates, scripts), feature dirs under `specs/`. **`.cursor/` is gitignored** (local IDE state + slash commands). Regenerate slash commands: `specify init --here --ai cursor-agent --force` (or install CLI and run once per clone).

### Key commands

| Task | Command |
|---|---|
| Install deps | `bun install` |
| Unit tests | `bun test ./src` |
| Type check | `bunx --bun tsc -p . --noEmit` |
| CLI help | `bun src/index.ts --help` |
| List exercises | `bun src/index.ts --list` (default Exercism path: `repos/exercism-typescript`) |

### Non-obvious caveats

- **Bun is the primary runtime**, not Node.js. All project commands use `bun`, not `node` / `npm`.
- The exercism exercises submodule lives at `repos/exercism-typescript` (also the CLI default for `--exercism-path`).
- Exercises contain intentionally broken placeholder code; `--test-only` will report failures — this is expected and by design.
- Running actual benchmarks requires an AI agent CLI + API key (e.g. `ANTHROPIC_API_KEY`). Use `--test-only` or `--print-instructions` for dry-run validation without credentials.
- Exercise test execution uses `corepack yarn` (Yarn v4). `corepack@0.29.4` must be installed globally and enabled: `npm install -g corepack@0.29.4 && corepack enable`.
- The v2 dataset (SWE-Lancer) requires Docker and additional submodules — see `specs/000-project-handbook/environment.md`.

### v2 (SWE-Lancer) Docker caveats in Cursor Cloud

- Docker must be installed and `dockerd` started manually: `sudo dockerd &>/tmp/dockerd.log &`
- Fix socket permissions after starting: `sudo chmod 666 /var/run/docker.sock`
- The monolith image `swelancer/swelancer_x86_monolith:releasev1` is ~15 GB; first pull takes several minutes.
- Docker requires `fuse-overlayfs` storage driver and `iptables-legacy` in this VM (see system prompt instructions for Docker-in-Docker setup).
- v2 `--test-only` runs against unmodified Expensify code, so test failures are expected (no agent patch applied).
- v2 tasks take 5+ minutes per exercise due to ansible setup + npm install inside the container.
- Submodules needed: `repos/frontier-evals` and `repos/expensify-app`. Init with `git submodule update --init repos/frontier-evals repos/expensify-app`; also `mkdir -p .patches`.
- v2 automatically enables `--docker` (see `src/utils/cli.ts` line 119).

#### v2 test execution issues in Docker-in-Docker

The `--test-only --dataset v2` CLI path has two known issues in this environment:

1. **`run.sh` RUNTIME_SETUP timeout**: The monolith image has `RUNTIME_SETUP=true` baked in, causing `run.sh` to re-run the full `setup_expensify.yml` playbook (~5 min). The ts-bench test command waits only 120 seconds for `/setup_done.txt`, causing a timeout. The 2nd playbook also hangs because `Verify the flow file` installs mitmproxy via pip which conflicts with the nvm environment.

2. **`run_tests.yml` nvm/bash issue**: The `Start npm server in the background` task uses `/bin/sh` (via `become: true`) which cannot `source /root/.nvm/nvm.sh`, so `npm run web` fails to start on port 8082.

3. **Chrome missing**: The monolith image does not include Google Chrome, but Playwright tests require it. Install with `apt-get install -y /tmp/chrome.deb` from the Google Chrome .deb package.

**Manual workaround**: Skip the `run.sh`-based flow. Instead, start services (Xvfb, pusher-fake, nginx) manually, run `setup_mitmproxy.yml`, start `npm run web` with nvm sourced, install Chrome, and then run `pytest` directly. See the debug logs in `/opt/cursor/artifacts/v2_test_chrome.log` for a working example.
