# ts-bench Constitution

## Core Principles

### I. Bun-first runtime

The harness and tooling run on **Bun**. Use `bun` for install, tests, and invoking the CLI (`bun src/index.ts`). Do not introduce Node/npm-centric workflows unless required by an external constraint, and document exceptions.

### II. CLI as the contract

The **public contract** for runners is the CLI (`src/utils/cli.ts`, `--help` text). Prefer extending the CLI and types in `src/config/` over one-off scripts. **v1** uses `--exercise`; **v2** uses `--task` / `--tasks` — keep dataset boundaries strict.

### III. Tests for harness changes

Changes to runner, agents, or benchmarks must include or update **unit tests** under `src/**/__tests__/` where applicable. `bun test ./src` is the standard check. Do not rely on full benchmark runs as the only verification.

### IV. Datasets and isolation

**v1** targets the Exercism submodule at `repos/exercism-typescript`. **v2** uses Docker, submodules (`repos/frontier-evals`, `repos/expensify-app`), and fixed image constants — document env and mounts in the handbook, not duplicated prose in code comments.

### V. Honest results

Preserve honest reporting: failed runs, timeouts, and agent errors stay visible in output and JSON. Avoid masking failures for a prettier summary.

## Stack and repositories

- **Language:** TypeScript, strict mode (`tsconfig.json`).
- **v2 execution:** Docker is implied for `--dataset v2`; agent invocation and test execution paths are sensitive to image and mount layout — change with care and update `specs/000-project-handbook/environment.md` when behavior shifts.

## Development workflow

- Small, focused PRs; match existing style (imports, naming).
- **Long-form docs** live in `specs/000-project-handbook/`; **README** stays minimal for humans.
- **Spec Kit:** use `/speckit.*` and `specs/<feature>/` for feature work; keep `.specify/templates` aligned when adding new phases.

## Governance

This constitution guides implementation and reviews. Amendments: update this file, bump **Version** below, and note **Last Amended**. Runtime agent hints for Cursor remain in `AGENTS.md`.

**Version**: 1.0.0 | **Ratified**: 2026-04-01 | **Last Amended**: 2026-04-01
