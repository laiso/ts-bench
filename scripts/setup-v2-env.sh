#!/usr/bin/env bash
# Prepare local environment for SWE-Lancer benchmark (--dataset v2).
# Comments in English per project convention.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SWELANCER_IMAGE="${SWELANCER_IMAGE:-swelancer/swelancer_x86_monolith:releasev1}"

echo "==> Checking Docker"
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker CLI not found. Install Docker Desktop (or Colima + docker CLI) first."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running. Start Docker Desktop (or colima start) and retry."
  exit 1
fi

echo "==> Git submodules: repos/frontier-evals, repos/expensify-app"
git submodule update --init --recursive repos/frontier-evals repos/expensify-app

echo "==> Creating .patches (used for task patch mounts)"
mkdir -p .patches

echo "==> Pulling SWE-Lancer monolith image: ${SWELANCER_IMAGE} (platform linux/amd64)"
docker pull --platform linux/amd64 "${SWELANCER_IMAGE}"

echo "==> Sanity checks"
test -f repos/frontier-evals/project/swelancer/all_swelancer_tasks.csv || {
  echo "Missing CSV. If using git-lfs, run: brew install git-lfs && git lfs install"
  exit 1
}
test -d repos/expensify-app/.git || { echo "expensify-app submodule missing"; exit 1; }

echo ""
echo "v2 environment ready."
echo "Example (single IC task; requires agent API key, e.g. CURSOR_API_KEY):"
echo "  bun src/index.ts --agent cursor --model sonnet --dataset v2 --task 16912_4 --verbose"
echo ""
echo "See specs/000-project-handbook/environment.md (SWE-Lancer / Docker execution) for details."
