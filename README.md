# ts-bench

Reproducible benchmark **CLI** for comparing **AI coding agents** on TypeScript workloads. Numbers are **directional**, not lab-grade.

**Interface:** `bun src/index.ts --help` — agents, providers, `--dataset v1|v2`, exercises vs tasks.

| Dataset | Role |
|--------|------|
| **v1** (default) | Exercism practice exercises |
| **v2** | SWE-Lancer (Docker, large monorepo) — run `./scripts/setup-v2-env.sh` first |

**Handbook** (setup, secrets, CI, methodology): [`specs/000-project-handbook/README.md`](specs/000-project-handbook/README.md). **Cursor / runner caveats:** [`AGENTS.md`](AGENTS.md). **Spec Kit** (SDD): `.specify/`, `specs/`; local `/speckit.*` commands live under **`.cursor/`** (gitignored — run `specify init --here --ai cursor-agent --force` after clone).

**v1 frozen baseline** for reproducibility: tag [`v1-final`](https://github.com/laiso/ts-bench/releases/tag/v1-final) → [`2b3bc94`](https://github.com/laiso/ts-bench/commit/2b3bc944eb5728b5cb24d00e19371b595d528847). [`Releases`](https://github.com/laiso/ts-bench/releases)

```bash
bun install
bun src/index.ts --agent claude --model <model>              # v1 default
bun src/index.ts --dataset v2 --task <id> --agent claude ...  # v2 (Docker)
```

Workflows: [v1](.github/workflows/benchmark.yml) · [v2](.github/workflows/benchmark-v2.yml). **SWE-Lancer task UI:** `bun run build:swelancer-pages` then open `docs/swelancer-tasks/` (see [`docs/README.md`](docs/README.md)). **Subscription Auth:** run agents without API keys — [guide](docs/auth/).
