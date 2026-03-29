# Phase 0: Cursor Cloud verification

Goal: decide whether **Cursor Cloud** (managed disposable environment) can host **ts-bench `--dataset v2`** before investing in Codespaces / GCP / Hetzner / exe.dev.

## Scope

- **In scope:** disk headroom, Docker availability, ability to `docker pull` the SWE-Lancer image, clone repo + submodules, run a **single** v2 smoke (optional if timeboxed).
- **Out of scope:** full 25-task benchmark, CI integration.

## Preconditions

- Cursor account with **Cloud Agent** (or equivalent) access per current Cursor docs.
- Repository access: `ts-bench` (and submodules: `repos/frontier-evals`, `repos/expensify-app`).
- API keys for the agent you use (e.g. `CURSOR_API_KEY` for cursor-agent) available in the cloud environment.
- **Same shell context for checks:** Automation / agent runs may use a different environment than the integrated terminal. Confirm `docker` and `df -h` in the **same context** you will use for `bun src/index.ts ...` (or document both if they differ).

## Observed behavior (project runs, non-binding)

These are **one-off observations**, not guarantees from Cursor. Always re-check on your plan and current docs.

| Topic | Example outcome |
|-------|------------------|
| **Disk (`df -h`, root)** | One session: **~126 GB** total; **~112 GB** free before pull; after successful pull, **~21 GB** used and **~100 GB** free. Enough for **~70 GB-class** image + workspace **in that profile**. |
| **Docker preinstalled** | Same session: **`docker` not installed** initially (no command on PATH). Treat **Docker as not guaranteed** until you verify. |
| **`docker pull` (SWE-Lancer)** | Completed **without disk errors** (~2 minutes in that run). `docker images` size **~11.7 GB**. **Minimum Phase 0 bar (pull OK) → Pass** for that VM. |
| **Docker after install (nested VM)** | **`docker.io`** + **`fuse-overlayfs`** via `apt`. `/etc/docker/daemon.json`: **`storage-driver: fuse-overlayfs`**, **`iptables: false`** so **`dockerd` starts** (first attempt failed on iptables/nat). Start **`dockerd`** manually or `sudo service docker start` as appropriate. |

### Official Cursor docs (disk GB)

Under **Cloud Agent → Setup / Resource limits**, docs describe **default VM CPU/memory caps** and **Enterprise contacting support**. As of a **2026-03** review, **no explicit per-VM disk size in GB** was found there; **storage add-ons for personal plans** were **not** confirmed from that page alone. Treat disk limits as **subject to doc and product changes**.

### Full v2 path not covered by pull-only

You can **Pass** checklist items **1–2** (disk + pull) and still **not** run **`bun install`** or **`bun src/index.ts ... --dataset v2`**. For end-to-end confidence, complete checklist items **3–5** (submodules, Bun, one-task smoke) **in the same environment**. For repeatable Cloud setups, bake Docker install + `daemon.json` + daemon start into a **Dockerfile** / **`.cursor/environment.json`** or startup script (forum patterns; verify current Cursor behavior).

### If Docker is missing

1. Install **`docker.io`** and **`fuse-overlayfs`** via `apt` on Ubuntu, or follow [Docker’s Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/), then start the daemon and confirm `docker version`.
2. If `dockerd` fails on **iptables/nat** in a nested VM, set **`"iptables": false`** in `/etc/docker/daemon.json` (trade-offs apply; dev-only is common).
3. Optionally, pre-build a dev image so Cloud Agent does not rely on manual install: see Cursor forum threads on **`.cursor/environment.json`** with a **`build.dockerfile`** path (community patterns; verify against current Cursor behavior).
4. If pull or daemon fails with other iptables / permission errors, search for **rootless** / **fuse-overlayfs** in Docker + your host docs—fixes are environment-specific.

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
| **Fail** (disk or Docker) | Proceed to **Phase 1: GitHub Codespaces** (see [docs/v2-env-trial-plan.md](v2-env-trial-plan.md)) or **GCP GCE** with explicit disk size. |

## Example verdict (2026-03 project session)

Non-binding summary of one completed Cursor Cloud run (checklist **1–2** only; **3–5** not run in that session):

- **Checklist 1 (disk):** Root **~126 GB** total; **~112 GB** free before pull; **~21 GB** used and **~100 GB** free after pull. **70 GB-class concurrent use: OK** in that VM.
- **Checklist 2 (Docker + pull):** **Pass** — `docker pull --platform linux/amd64 swelancer/swelancer_x86_monolith:releasev1` finished with **no disk errors** (~2 min; image **~11.7 GB** on disk).
- **Official docs:** No **GB disk cap** found in Cloud Agent Resource limits text reviewed at that time; results may **differ on another VM profile**.
- **Not done:** `bun install`, `bun src/index.ts ... --dataset v2`. **Next:** same environment — submodules, Bun, one-task smoke; consider **Dockerfile / env startup** so `dockerd` + settings are repeatable.

## Notes

- Cursor Cloud **storage limits** change; verify against **current** [Cursor documentation](https://cursor.com/docs) / pricing, not third-party summaries.
- If the cloud session is **ephemeral**, large `docker pull` every session may be costly in time and quota.
