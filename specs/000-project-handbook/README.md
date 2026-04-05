# Project handbook

**Canonical location** for operational and methodology docs (not duplicated in README). The root **`docs/`** directory is reserved for **generated** SWE-Lancer Pages assets only (`docs/swelancer-tasks/`).

**Spec Kit** slash commands (`/speckit.*`) use `.specify/` and feature directories under `specs/`; this `000-project-handbook` folder is reference material for humans and agents.

| Document | Topic |
|----------|--------|
| [environment.md](environment.md) | Local setup, Docker, v2 SWE-Lancer, secrets, GitHub Actions |
| [leaderboard.md](leaderboard.md) | Optional aggregated results JSON |
| [METHODOLOGY.md](METHODOLOGY.md) | Benchmark methodology |
| [v2-grouped-execution.md](v2-grouped-execution.md) | V2 commit-grouped container reuse |
| [v2-default-benchmark-set.md](v2-default-benchmark-set.md) | Default 5-task benchmark set & tier rating |
| [parallelization.md](parallelization.md) | Parallelization levels, trade-offs, and practical speedup options |

**GitHub Pages (SWE-Lancer task browser):** built output lives under `docs/swelancer-tasks/` (`bun run build:swelancer-pages`). See root `README.md`.
