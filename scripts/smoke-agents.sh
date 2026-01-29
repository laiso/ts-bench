#!/usr/bin/env bash
set -euo pipefail

IMAGE=${1:-ts-bench-container}
CACHE_DIR=${TS_BENCH_CLI_CACHE:-$HOME/.cache/ts-bench/cli}

mkdir -p "$CACHE_DIR"
AGENTS=(
  claude
  codex
  gemini
  opencode
  qwen
  aider
  goose
  cursor-agent
  kimi
)

for agent in "${AGENTS[@]}"; do
  echo "=== ${agent} --version ===" >&2
  docker run --rm \
    -v "${CACHE_DIR}:/root/.local" \
    "${IMAGE}" \
    bash /app/scripts/run-agent.sh "${agent}" --version
  echo >&2
  sleep 1
done
