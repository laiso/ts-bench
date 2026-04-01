# Aggregated results (`leaderboard.json`)

The repository **does not** publish a ranked table in the main [README](../README.md). Optional **aggregated** benchmark history is stored in:

- **`public/data/leaderboard.json`** — keyed by `agent-model`, updated by `scripts/update-leaderboard.ts` (e.g. from CI artifacts via `.github/workflows/update-leaderboard.yml`).

Local runs with `--save-result` refresh **`public/data/latest-results.json`** (and the leaderboard generator may run as part of that flow—see source).

This file is **community-operational**: it helps compare runs you choose to merge into `leaderboard.json`; it is **not** a statistically controlled leaderboard.

## Update script

```bash
bun scripts/update-leaderboard.ts <path/to/result.json>
```

Environment variables `RUN_URL`, `RUN_ID`, and `ARTIFACT_NAME` are optional metadata for the merged record (used by the GitHub workflow).
