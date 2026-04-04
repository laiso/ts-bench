# ts-bench

Benchmark CLI for comparing AI coding agents on TypeScript workloads. Run an agent, execute tests, get pass/fail — across models and providers. Numbers are directional, not lab-grade.

```bash
bun install
bun src/index.ts --agent claude --model <model>
```

`bun src/index.ts --help` for all options.

## Datasets

### v1 — Exercism (default)

25 self-contained TypeScript practice exercises. No Docker required.

```bash
bun src/index.ts --agent claude --model <model>
```

Frozen baseline for reproducibility: tag [`v1-final`](https://github.com/laiso/ts-bench/releases/tag/v1-final)

### v2 — SWE-Lancer

Real-world tasks from a large monorepo (Expensify). Requires Docker.

```bash
./scripts/setup-v2-env.sh                                    # one-time setup
bun src/index.ts --dataset v2 --task <id> --agent claude ...  # run
```

## Results

Workflow runs: [v1](.github/workflows/benchmark.yml) · [v2](.github/workflows/benchmark-v2.yml) · [Releases](https://github.com/laiso/ts-bench/releases)

Task browser: `bun run build:swelancer-pages` then open `docs/swelancer-tasks/`. See [`docs/README.md`](docs/README.md).

## Docs

- **[Handbook](specs/000-project-handbook/README.md)** — setup, secrets, CI, methodology
- **[AGENTS.md](AGENTS.md)** — runner caveats for Cursor and other agents
- **[Subscription auth](docs/auth/)** — run agents without API keys
