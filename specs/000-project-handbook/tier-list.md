# Tier List

## Overview

The **tier list** ranks AI agent runs on the [default v2 benchmark set](v2-default-benchmark-set.md) (5 SWE-Lancer tasks) into a single letter grade: **S → A → B → C → D → F**.

It is the primary human-readable summary of a v2 benchmark run and is:

- printed to the console at the end of every qualifying run
- stored in the saved JSON result (`tier` field)
- rendered on the public leaderboard site (`public/`) under the **Tier List** tab

Tier is computed only when the result set exactly matches the default 5-task set (`V2_DEFAULT_TASKS`). Partial or custom-task runs do not receive a tier.

---

## Thresholds

Defined in `src/config/constants.ts` as `V2_TIER_THRESHOLDS`.

| Tier | Tasks solved (out of 5) | Description          |
|------|-------------------------|----------------------|
| S    | 5                       | All tasks solved     |
| A    | 4                       |                      |
| B    | 3                       |                      |
| C    | 2                       |                      |
| D    | 1                       |                      |
| F    | 0                       | No tasks solved      |

### Design note — no weighting

The current thresholds use a **simple solved count** with no weighting by reward amount or task difficulty. This is an intentional simplification for the initial design. Future iterations may weight tasks by their USD reward (e.g. task `14958` at $8,000 vs `14268` at $2,000) or by difficulty label to produce a more discriminating score. The threshold array is kept separate from the task list precisely to make such refinements easy.

---

## Computation

### At run time (`src/benchmark/reporter.ts`)

`BenchmarkReporter.computeTier(results)` is called when saving a result file:

1. Builds a set of the default task IDs from `V2_DEFAULT_TASKS`.
2. Checks that the result set is an **exact match** — same size, same IDs. Any deviation returns `undefined` (no tier).
3. Counts `overallSuccess` results that belong to the default set → `solved`.
4. Walks `V2_TIER_THRESHOLDS` sorted descending by `minCorrect` and returns the first entry where `solved >= minCorrect`.
5. Returns `{ tier, label, solved, total }`, which is written into the saved JSON under the top-level `tier` key.

`BenchmarkReporter.printTier()` reads the same saved JSON and prints the tier rating to the console after each run.

### On the leaderboard site (`src/site/shared/tier.ts`)

`tierFromEntry(savedResult)`:

1. If the saved JSON already contains a `tier.tier` field (modern runs), return it directly.
2. Otherwise fall back to counting `overallSuccess` on results whose `exercise` ID is in `V2_DEFAULT_TASKS` (legacy support).

`sortEntriesByTier(entries)` sorts by tier rank (`S=0 … F=5`), with ties broken by ascending `avgDuration`.

---

## Site Display (`src/site/components/tier-list.ts`)

`renderTierList(entries)` generates the HTML for the **Tier List** tab:

- Iterates `TIERS = ['S', 'A', 'B', 'C', 'D', 'F']`.
- Groups leaderboard entries by their tier (via `tierFromEntry`).
- Renders one row per tier. Empty tiers are shown with a dimmed style (`tier-empty`).
- Each agent is rendered as a card (`agent-card`) showing:
  - agent icon (`assets/icons/<agent>.png`)
  - agent name + model
  - `X/5 · HH:mm` (solved count and average duration)
  - a tooltip with per-task pass/fail breakdown on hover

When no v2 results exist in the leaderboard, a placeholder message is shown:

> *No v2 benchmark results yet. Run `bun src/index.ts --dataset v2` and update the leaderboard to see tier ratings here.*

---

## Current State

No benchmark runs have been submitted to the leaderboard yet. The tier list is empty until a run is completed and merged via `scripts/update-leaderboard.ts`. See [leaderboard.md](leaderboard.md) for instructions.

---

## Related

- [`src/config/constants.ts`](../../src/config/constants.ts) — `V2_DEFAULT_TASKS`, `V2_TIER_THRESHOLDS`
- [`src/benchmark/reporter.ts`](../../src/benchmark/reporter.ts) — `computeTier`, `printTier`
- [`src/site/shared/tier.ts`](../../src/site/shared/tier.ts) — `tierFromEntry`, `sortEntriesByTier`
- [`src/site/components/tier-list.ts`](../../src/site/components/tier-list.ts) — HTML rendering
- [v2-default-benchmark-set.md](v2-default-benchmark-set.md) — task list and selection criteria
- [leaderboard.md](leaderboard.md) — how to add results to the leaderboard
