# V2 Commit-Grouped Execution

## Overview

V2 (SWE-Lancer) tasks run inside a Docker monolith container.  The expensive
`setup_expensify.yml` playbook (git checkout, npm install, webpack) takes 3-4
minutes.  Previously this ran **twice** per task (agent container + test
container).

PR #84 introduced **single-container execution** (setup once per task).  This
document describes the next optimisation: **commit-grouped execution**, where
tasks sharing the same base commit share a single container and setup.

## Commit Distribution

| Commit | Tasks |
|--------|-------|
| `2b791c9f3053...` | 154 |
| `da2e6688c3f1...` | 33 |
| 12 other commits | 1 each |
| **Total** | **199** |

94% of tasks (187/199) share just 2 commits.  Grouped execution eliminates
redundant npm install + webpack for every task in the same group.

## Scope

The current implementation targets **all tasks with a known commitId**.  Tasks
are grouped automatically; no CLI flag is needed.  When only a single task is
selected, the simpler single-task path is used.

## Architecture

### Key Classes

| Class | File | Role |
|-------|------|------|
| `V2ContainerManager` | `src/execution/v2-container.ts` | Manages Docker container lifecycle |
| `V2DockerExecStrategy` | `src/execution/v2-container.ts` | `ExecutionStrategy` that emits `docker exec` |
| `BenchmarkRunner` | `src/benchmark/runner.ts` | Orchestrates grouped execution |
| `ExerciseRunner` | `src/runners/exercise.ts` | Runs agent + test for a single task |
| `SweLancerDataset` | `src/datasets/swelancer.ts` | Provides `getCommitIds()` for grouping |

### Execution Flow

#### Single task (backward compatible)

```
ExerciseRunner.run()
  └─ runV2Docker()
       ├─ docker create + start
       ├─ setup(issueId)           ← runs setup_expensify.yml (checkout + patch + npm + webpack)
       ├─ runV2Task(agent + test)
       └─ docker rm
```

#### Multiple tasks (commit-grouped)

```
BenchmarkRunner.run()
  ├─ getCommitIds(tasks)           ← resolve commitId per task
  ├─ group tasks by commitId
  └─ for each commit group:
       BenchmarkRunner.runOneCommitGroup()
         ├─ docker create + start
         ├─ setupBase(commitId)    ← checkout + npm + webpack (ONCE)
         └─ for each task:
              ├─ prepareTask(issueId)  ← apply bug patch (seconds)
              ├─ runV2Task(agent + test)
              └─ resetToBaseline()     ← git reset --hard (seconds)
         └─ docker rm
```

### V2ContainerManager Methods

| Method | Purpose | When |
|--------|---------|------|
| `create(opts)` | `docker create` + `docker start` with all mounts | Always first |
| `setup(opts)` | Full `setup_expensify.yml` for a single task | Single-task mode |
| `setupBase(opts)` | Checkout + npm + webpack without task patch | Grouped mode |
| `prepareTask(issueId)` | Apply `revert_command` or `bug_reintroduce.patch` | Before each task in group |
| `resetToBaseline()` | `git reset --hard` to "base setup" commit | Between tasks in group |
| `exec(cmd)` | Run arbitrary command via `docker exec` | Internal |
| `destroy()` | `docker rm -f` | Always last |

### Time Savings

```
Before (double setup):     setup(3min) x 2 x N tasks  = 6min x N
Single-container (PR #84): setup(3min) x 1 x N tasks  = 3min x N
Commit-grouped:            setup(3min) x 1 per commit = 3min + patch(5s) x N
```

For the 154-task majority commit: **462 minutes saved** vs single-container,
**924 minutes saved** vs the original double-setup.

## DatasetReader Extension

```typescript
interface DatasetReader {
  // ... existing methods ...

  /** Batch lookup of commitId per task for grouping. */
  getCommitIds?(taskIds: string[]): Promise<Map<string, string>>;
}
```

`SweLancerDataset.getCommitIds()` reads `commit_id.txt` files in parallel.
The method is optional so v1 datasets are unaffected.
