## Leaderboard Operation Design

This document summarizes the final design for publishing the leaderboard in ts-bench, aiming for a "lightweight, reproducible, and transparent" process.

### TL;DR

- Single data source: Only the latest version is kept in `public/data/leaderboard.json` (key: `agent-model`).
- README displays only the Top N entries, auto-generated (marker replacement). The Result column shows a Run link.
- Raw result JSONs are not committed to the repository, but saved as GitHub Actions Artifacts.
- Local runs with `--save-result` automatically regenerate `public/data/latest-results.json` to give an up-to-date preview before publishing.
- Workflow separation:
  - Benchmark run (uploads result JSON as Artifact)
  - Update run (fetches Artifact from any run → merges into JSON → updates README → opens a PR with only 2 changed files)
- README acts as a "template" with an initial table, always ensuring display.

---

## Architecture Overview

1) Manual Benchmark Run (Execution → Artifact)
- Run ts-bench to generate result JSONs (including `latest.json`, default: `./results`).
- Result JSONs are not committed, but uploaded as Artifacts.

2) Propose Leaderboard Update (Update via PR)
- Retrieve `latest.json` (or first `*.json` if not present) from the specified run's Artifact.
- Upsert into `public/data/leaderboard.json` (key: `agent-model`).
- Replace the marker section in README with a Top N table (Result column links to Run).
- Open a Pull Request that includes changes to `README.md` and `public/data/leaderboard.json`.

Benefits
- Repository size remains small (history kept in Artifacts).
- Fast updates (Upsert into single JSON + table generation).
- Can regenerate from any run (reproducibility & transparency).

---

## Data File Specification (leaderboard.json)

- Path: `public/data/leaderboard.json`
- Structure: `results` always keeps only the latest entry per `agent-model` key.

```jsonc
{
  "lastUpdated": "2025-08-31T00:00:00.000Z",
  "results": {
    "codex-gpt-5": {
      "metadata": {
        "agent": "codex",
        "model": "gpt-5",
        "provider": "openai",
        "version": "unknown",
        "timestamp": "2025-08-30T12:30:00.000Z",
        "exerciseCount": 25,
        "benchmarkVersion": "1.0.0",
        "generatedBy": "ts-bench",
        "runUrl": "https://github.com/laiso/ts-bench/actions/runs/17344734992",
        "runId": "17344734992",
        "artifactName": "results-codex-gpt-5"
      },
      "summary": {
        "successRate": 88.0,
        "totalDuration": 2292500.0,
        "avgDuration": 91700.0,
        "successCount": 22,
        "totalCount": 25,
        "agentSuccessCount": 22,
        "testSuccessCount": 22,
        "testFailedCount": 3
      },
      "results": []
    }
  }
}
```

Key Design
- Default: `agent-model`. Can be extended to `agent-model-provider` if needed.

---

## Update Script (scripts/update-leaderboard.ts)

Role
- Validates and loads input JSON (from Artifact).
- Upserts into `public/data/leaderboard.json` (overwrites by `agent-model`, updates `lastUpdated`).
- Replaces the marker section in README with Top N table.

Specs
- Sort: By descending success rate → ascending average time.
- Top count: `TOP_N` (env var, default 10).
- Result column: Uses `RUN_URL/RUN_ID` to display as `[#<last 6 digits>]` link (if missing, show `-`).
- If no marker, inserts table right after "## Leaderboard", or at the top if not found.

Usage (local)
```
TOP_N=10 \
RUN_URL="https://github.com/<org>/<repo>/actions/runs/<run_id>" \
RUN_ID="<run_id>" \
bun scripts/update-leaderboard.ts <path/to/result.json>
```

---

## README as a Template

- `README.md` contains the initial leaderboard table with markers.
- The script only replaces the section between markers, so the table is always displayed even if not run or failed.

Example (markers)
```
<!-- BEGIN_LEADERBOARD -->
| Rank | Agent | Model | Success Rate | Solved | Avg Time | Result |
|:----:|:------|:------|:--------------:|:------:|:----------:|:-----:|
| 1 | codex | gpt-5 | **88.0%** | 22/25 | 91.7s | [#734992](https://github.com/laiso/ts-bench/actions/runs/17344734992) |
| 2 | claude | claude-sonnet-4-20250514 | **72.0%** | 18/25 | 206.1s | [#732069](https://github.com/laiso/ts-bench/actions/runs/17344732069) |
<!-- END_LEADERBOARD -->
```

---

## GitHub Actions

1) Benchmark Workflow (`.github/workflows/benchmark.yml`)
- Runs benchmark → saves JSONs under `results/` (including `latest.json`) → uploads as Artifact only.

2) Update Workflow (`.github/workflows/update-leaderboard.yml`)
- Inputs: `run_id` (required), `artifact_name` (required).
- Retrieves `latest.json` (or first `*.json`) from specified run's Artifact.
- Injects `RUN_URL/RUN_ID/ARTIFACT_NAME` as env vars to the script.
- Script merges into JSON → replaces README section → proposes a PR with the changes (no direct commit to `main`).
- Runs serially: `concurrency: group: leaderboard-update` to avoid conflicts.

---

## Operation Steps

1. Run the benchmark
- Actions → Manual Benchmark Run → specify inputs → after completion, Artifact (`results-<agent>-<model>`) is generated on the Run page.
- Local runs with `--save-result` refresh `public/data/latest-results.json` so you can review the leaderboard before publishing changes.

2. Update the leaderboard (PR)
- Actions → Propose Leaderboard Update from Artifact → specify `run_id` (from URL) and `artifact_name` → run.
- After execution, a PR is opened with changes to `README.md` and `public/data/leaderboard.json`. Review and merge it to update `main`.

---

## Guardrails / Notes

- Conflict avoidance: Update workflow runs serially. If failed, rerun to restore consistency.
- Schema compatibility: Fields are added for backward compatibility (e.g., `metadata.runUrl`).
- Key design: Default is `agent-model`, can be extended with `provider` if needed.
- Display policy: README shows only Top N. All entries are in `public/data/leaderboard.json`. Result column shows `-` if Run URL is missing.

---

## Local Verification

```
# Check README update behavior with sample JSON
bun scripts/update-leaderboard.ts src/benchmark/__tests__/sample/results/latest.json

# Test with custom Top N and links
TOP_N=5 RUN_URL="https://github.com/<org>/<repo>/actions/runs/123456" RUN_ID=123456 \
  bun scripts/update-leaderboard.ts src/benchmark/__tests__/sample/results/latest.json
```

---

## Future Extensions

- Visualization on static site (graphs, filters, history comparison).
- Bulk regeneration from multiple run Artifacts (history-based reconstruction).
- Sub-ranking by model or period.

This design keeps the repository clean while enabling fast and reproducible leaderboard updates.
