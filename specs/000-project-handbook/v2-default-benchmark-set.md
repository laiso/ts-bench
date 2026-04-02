# V2 Default Benchmark Set

## Overview

The default v2 benchmark set is a curated group of **5 SWE-Lancer tasks** that serve as the project's standard evaluation suite. Every task has been verified to PASS when the correct patch is applied, ensuring that test failures always indicate an agent's inability to solve the problem — not infrastructure issues.

## Task List

| Task ID   | Reward  | Difficulty | Commit          |
|-----------|---------|------------|-----------------|
| `14958`   | $8,000  | Hard       | `2b791c9f3053`  |
| `15815_1` | $4,000  | Medium     | `2b791c9f3053`  |
| `15193`   | $4,000  | Medium     | `2b791c9f3053`  |
| `14268`   | $2,000  | Easy-Med   | `2b791c9f3053`  |
| `20079`   | $2,000  | Easy-Med   | `2b791c9f3053`  |

**Total max reward:** $20,000

All 5 tasks share commit `2b791c9f3053`, so grouped execution uses a single container with one setup phase.

## Selection Criteria

1. **Verified correctness** — each task passes `scripts/verify-task.ts` (reverse the bug patch, run pytest, confirm PASS).
2. **High reward** — tasks are selected from the top of the reward distribution to reflect real-world complexity.
3. **Same commit** — all tasks share a base commit for efficient grouped execution.
4. **No infrastructure flakiness** — tasks with known Playwright/mitmproxy replay issues (Issue #82) are excluded.

## Tier Rating

When running the default set, the benchmark outputs a tier rating based on the number of tasks solved:

| Tier | Solved | Description           |
|------|--------|-----------------------|
| S    | 5/5    | All tasks solved      |
| A    | 4/5    |                       |
| B    | 3/5    |                       |
| C    | 2/5    |                       |
| D    | 1/5    |                       |
| F    | 0/5    | No tasks solved       |

The tier is printed to console and included in the saved JSON result (`tier` field).

## Running the Default Set

```bash
# Locally (uses default 5-task set automatically)
bun src/index.ts --dataset v2 --docker --agent codex --model gpt-5.4-mini --provider openai

# With explicit task list
bun src/index.ts --dataset v2 --docker --tasks 14958,15815_1,15193,14268,20079 --agent codex --model gpt-5.4-mini --provider openai

# GHA workflow dispatch (default input is the 5-task set)
gh workflow run "Manual Benchmark Run (v2 SWE-Lancer)" \
  --field agent="codex" \
  --field provider="openai" \
  --field model="gpt-5.4-mini"
```

## Cost & Time Estimates (gpt-5.4-mini)

| Metric | Value |
|--------|-------|
| API cost | ~$1 |
| Execution time | ~53 min |
| GHA compute | ~$0.42 |
| Total cost | ~$1.50 |

## Related

- [Issue #73 — Build reproducible v2 benchmark set](https://github.com/laiso/ts-bench/issues/73)
- [Issue #82 — Track v2 tasks needing deep verification](https://github.com/laiso/ts-bench/issues/82)
- [v2-grouped-execution.md](v2-grouped-execution.md) — Container reuse for same-commit tasks
- `src/config/constants.ts` — `V2_DEFAULT_TASKS`, `V2_TIER_THRESHOLDS`
