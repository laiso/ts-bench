# Phase 0: Cursor Cloud verification

Goal: decide whether **Cursor Cloud** (managed disposable environment) can host **ts-bench `--dataset v2`** before investing in Codespaces / GCP / Hetzner / exe.dev.

## Scope

- **In scope:** disk headroom, Docker availability, ability to `docker pull` the SWE-Lancer image, clone repo + submodules, run a **single** v2 smoke (optional if timeboxed).
- **Out of scope:** full 25-task benchmark, CI integration.

## Preconditions

- Cursor account with **Cloud Agent** (or equivalent) access per current Cursor docs.
- Repository access: `ts-bench` (and submodules: `repos/frontier-evals`, `repos/expensify-app`).
- API keys for the agent you use (e.g. `CURSOR_API_KEY` for cursor-agent) available in the cloud environment.

## Checklist (record Pass / Fail / N/A)

1. **Environment**
   - [ ] Confirm **total disk** and **free space** (`df -h` or provider UI).
   - [ ] Note whether **70GB-class** simultaneous use (large image + workspace) is **documented** or **observed** as possible.

2. **Docker**
   - [ ] `docker version` succeeds.
   - [ ] `docker pull --platform linux/amd64 swelancer/swelancer_x86_monolith:releasev1` **starts and completes** without `no space left on device` / I/O errors.

3. **Repository**
   - [ ] Clone `ts-bench` (or open from integrated Git).
   - [ ] `git submodule update --init repos/frontier-evals repos/expensify-app` (install **git-lfs** first if LFS objects are required).

4. **Toolchain**
   - [ ] Install **Bun** (or use project-documented install path).
   - [ ] `bun install` at repo root succeeds.

5. **Smoke (optional)**
   - [ ] Run one task, e.g.  
     `bun src/index.ts --agent cursor --model sonnet --dataset v2 --exercise 16912_4 --verbose`  
     (adjust agent/model per your setup.)

## Decision

| Outcome | Next step |
|---------|-----------|
| **Pass** (pull + optional smoke OK) | You may continue v2 work on Cursor Cloud; still monitor disk for multi-run debugging. |
| **Fail** (disk or Docker) | Proceed to **Phase 1: GitHub Codespaces** (see `.cursor/plans/` trial plan) or **GCP GCE** with explicit disk size. |

## Notes

- Cursor Cloud **storage limits** change; verify against **current** [Cursor documentation](https://cursor.com/docs) / pricing, not third-party summaries.
- If the cloud session is **ephemeral**, large `docker pull` every session may be costly in time and quota.
