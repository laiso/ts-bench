# Project handbook

**Canonical location** for operational and methodology docs (not duplicated in README). The root **`docs/`** directory is reserved for **generated** SWE-Lancer Pages assets only (`docs/swelancer-tasks/`).

**Spec Kit** slash commands (`/speckit.*`) use `.specify/` and feature directories under `specs/`; this `000-project-handbook` folder is reference material for humans and agents.

| Document | Topic |
|----------|--------|
| [environment.md](environment.md) | Local setup, Docker, v2 SWE-Lancer, secrets, GitHub Actions |
| [phase-0-cursor-cloud.md](phase-0-cursor-cloud.md) | Cursor Cloud / constrained hosts for v2 |
| [leaderboard.md](leaderboard.md) | Optional aggregated results JSON |
| [ci-regression.md](ci-regression.md) | CI regression notes |
| [agentlog-collector.md](agentlog-collector.md) | Agent log collection |
| [METHODOLOGY.md](METHODOLOGY.md) | Benchmark methodology |
| [v2-grouped-execution.md](v2-grouped-execution.md) | V2 commit-grouped container reuse |

**GitHub Pages (SWE-Lancer task browser):** built output lives under `docs/swelancer-tasks/` (`bun run build:swelancer-pages`). See root `README.md`.
