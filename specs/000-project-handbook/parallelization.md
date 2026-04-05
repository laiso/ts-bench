# Parallelization

Parallelization is **possible at some levels and not others**, depending on whether tasks share container state.

## Current Execution Model

Everything inside a single CLI process runs **sequentially**:

1. **Between commit groups**: iterated with `for...of` in `runV2CommitGroups`
2. **Tasks within the same commit group**: inside one container, `prepareTask → agent + test → resetToBaseline` loops one at a time

## Levels of Parallelization

### 1. CI (GitHub Actions) — already supported

`benchmark-v2-set.yml` splits tasks into shards and runs them as **parallel jobs via matrix strategy**. `job_count` and `max_parallel` control the degree of parallelism.

The same approach works locally: **manually launch multiple CLI processes** in separate terminals:

```bash
# Terminal 1
bun src/index.ts --dataset v2 --docker --agent gemini --model gemini-3-flash-preview --tasks 14958,15815_1 --save-result
# Terminal 2
bun src/index.ts --dataset v2 --docker --agent gemini --model gemini-3-flash-preview --tasks 15193,14268,20079 --save-result
```

Each process creates its own container so they do not interfere. Results can be merged with `scripts/merge-v2-set-shards.ts`.

### 2. Between different commit groups — possible but not yet implemented in CLI

Replacing the `for...of` in `runV2CommitGroups` with `Promise.all` would let different commit groups run in separate containers simultaneously. Because each group is fully isolated in its own container, there is no state collision.

### 3. Tasks within the same commit group — difficult to parallelize

These tasks **share state inside one container**:

- Only one Git working tree (patch apply → reset is inherently sequential)
- Ports (`:9000`, `:8082`) are reused across tasks
- `resetToBaseline()` kills the previous task's processes before the next one starts

Parallelizing at this level would require one container per task, which means repeating `setupBase()` (npm install + webpack) for every task—making setup costs much heavier.

## Practical Options for Speeding Up Runs

| Method | Effect | Implementation cost |
|--------|--------|---------------------|
| **Launch multiple CLI processes manually** | High (scales with task count) | None — works today |
| **Increase CI `job_count`** | High | None — existing feature |
| **`Promise.all` for commit groups** | Medium (only when multiple groups exist) | Low |
| **Parallelize within a commit group** | High but complex | High (one container per task; repeated setup) |

For the fastest local speedup, split tasks with `--tasks` and run them in **multiple terminals simultaneously**. Be mindful of machine resources (CPU, memory, disk) and API rate limits. The SWE-Lancer monolith image is large; running three or more containers at once requires a capable machine.
