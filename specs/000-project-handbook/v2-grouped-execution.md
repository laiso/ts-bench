# V2 Commit-Grouped Execution

## Why This Exists

V2 tasks run inside a Docker monolith container. The `setup_expensify.yml` playbook (git checkout, npm install, webpack) takes 3-4 minutes. Without grouping, this runs once per task. Since 94% of tasks (187/199) share just 2 commits, grouping eliminates redundant setup.

## How It Works

Tasks are grouped by their base commit automatically (no CLI flag needed). For each group:
1. Create container and run setup **once**
2. For each task: apply bug patch → run agent + test → `git reset --hard`
3. Destroy container

Single-task mode uses the simpler per-task path (backward compatible).

## Time Savings

For the 154-task majority commit: ~462 min saved vs single-container, ~924 min vs original double-setup.

## Implementation

See `src/execution/v2-container.ts` (`V2ContainerManager`, `V2DockerExecStrategy`) and `src/benchmark/runner.ts` (`runV2CommitGroups`).
