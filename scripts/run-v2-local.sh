#!/usr/bin/env bash
# Run a single v2 (SWE-Lancer) benchmark task locally, mirroring .github/workflows/benchmark-v2.yml.
#
# Usage:
#   scripts/run-v2-local.sh [options]
#
# Examples:
#   scripts/run-v2-local.sh                                       # defaults: task 16912_4, agent codex, model gpt-4.1-mini, provider openai
#   scripts/run-v2-local.sh --task 28565_1001 --agent gemini --model gemini-2.5-flash --provider google
#   scripts/run-v2-local.sh --tasks 16912_4,28565_1001 --agent claude --model claude-sonnet-4-20250514 --provider anthropic
#   scripts/run-v2-local.sh --task 16912_4 --agent codex --model gpt-4.1-mini --provider openai --verbose
#
# Environment variables (set at least the key for your chosen provider):
#   ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY / GEMINI_API_KEY,
#   OPENROUTER_API_KEY, DASHSCOPE_API_KEY, XAI_API_KEY, DEEPSEEK_API_KEY,
#   CURSOR_API_KEY, MOONSHOT_API_KEY, KIMI_API_KEY, ZAI_API_KEY, MISTRAL_API_KEY
#
# See .github/workflows/benchmark-v2.yml and specs/000-project-handbook/environment.md for full docs.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ── defaults (same as workflow_dispatch defaults) ────────────────────────────
TASK="16912_4"
TASKS=""
AGENT="codex"
PROVIDER="openai"
MODEL="gpt-4.1-mini"
TIMEOUT="3600"
V2_SETUP_WAIT_SEC="${TS_BENCH_V2_SETUP_WAIT_SEC:-900}"
VERBOSE=""
CUSTOM_INSTRUCTION="${CUSTOM_INSTRUCTION:-}"
SAVE_RESULT=""
RESULT_DIR="./data/results"
OUTPUT_DIR="./results"
SKIP_IMAGE_PULL=""

# ── parse arguments ──────────────────────────────────────────────────────────
usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --task <id>             Single v2 task id (default: 16912_4)
  --tasks <id,id,...>     Comma-separated task ids
  --agent <name>          Agent: claude, codex, gemini, opencode, goose, qwen, aider, cursor, copilot, vibe, kimi (default: codex)
  --provider <name>       Provider: openai, anthropic, google, openrouter, etc. (default: openai)
  --model <name>          Model name (default: gpt-4.1-mini)
  --timeout <seconds>     Per-task timeout in seconds (default: 3600, minimum 3600)
  --verbose               Show detailed output
  --custom-instruction <text>  Additional instruction text appended to the prompt
  --save-result           Save benchmark results to file
  --result-dir <dir>      Directory to save results (default: ./data/results)
  --output-dir <dir>      Output directory for logs (default: ./results)
  --skip-image-pull       Skip Docker image pull (use if already pulled)
  --help                  Show this help message
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --task)       TASK="$2"; TASKS=""; shift 2 ;;
    --tasks)      TASKS="$2"; TASK=""; shift 2 ;;
    --agent)      AGENT="$2"; shift 2 ;;
    --provider)   PROVIDER="$2"; shift 2 ;;
    --model)      MODEL="$2"; shift 2 ;;
    --timeout)    TIMEOUT="$2"; shift 2 ;;
    --verbose)    VERBOSE="--verbose"; shift ;;
    --custom-instruction) CUSTOM_INSTRUCTION="$2"; shift 2 ;;
    --save-result) SAVE_RESULT="--save-result"; shift ;;
    --result-dir) RESULT_DIR="$2"; shift 2 ;;
    --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    --skip-image-pull) SKIP_IMAGE_PULL=1; shift ;;
    --help)       usage ;;
    *)            echo "Unknown option: $1" >&2; usage ;;
  esac
done

# ── prerequisite checks ─────────────────────────────────────────────────────
echo "==> Checking prerequisites"

if ! command -v bun >/dev/null 2>&1; then
  echo "ERROR: bun is not installed. Install it: https://bun.sh" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker CLI not found. Install Docker Desktop or docker CLI." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker daemon is not running. Start Docker Desktop (or colima start) and retry." >&2
  exit 1
fi

# ── submodules ───────────────────────────────────────────────────────────────
echo "==> Ensuring submodules"
if [[ ! -f repos/frontier-evals/project/swelancer/all_swelancer_tasks.csv ]]; then
  echo "    Initializing submodules..."
  git submodule update --init --recursive repos/frontier-evals repos/expensify-app
  git lfs install
  git submodule foreach --recursive 'git lfs pull || true'
fi

if [[ ! -f repos/frontier-evals/project/swelancer/all_swelancer_tasks.csv ]]; then
  echo "ERROR: Missing CSV. Run: git lfs install && git submodule foreach --recursive 'git lfs pull'" >&2
  exit 1
fi

# ── directories ──────────────────────────────────────────────────────────────
echo "==> Creating required directories"
mkdir -p .patches .v2-swelancer-logs "$RESULT_DIR" "$OUTPUT_DIR"

# ── install dependencies ─────────────────────────────────────────────────────
echo "==> Installing dependencies"
bun install --frozen-lockfile

# ── Docker image ─────────────────────────────────────────────────────────────
SWELANCER_IMAGE="swelancer/swelancer_x86_monolith:releasev1"
if [[ -z "$SKIP_IMAGE_PULL" ]]; then
  if ! docker image inspect "$SWELANCER_IMAGE" >/dev/null 2>&1; then
    echo "==> Pulling SWE-Lancer monolith image (this may take a while, ~15 GB)"
    docker pull --platform linux/amd64 "$SWELANCER_IMAGE"
  else
    echo "==> Docker image already present: $SWELANCER_IMAGE"
  fi
else
  echo "==> Skipping Docker image pull (--skip-image-pull)"
fi

# ── build benchmark command ──────────────────────────────────────────────────
CMD=(
  bun src/index.ts
  --dataset v2
  --docker
  --agent "$AGENT"
  --model "$MODEL"
  --provider "$PROVIDER"
  --timeout "$TIMEOUT"
  --output-dir "$OUTPUT_DIR"
)

if [[ -n "$TASKS" ]]; then
  CMD+=(--tasks "$TASKS")
elif [[ -n "$TASK" ]]; then
  CMD+=(--task "$TASK")
fi

if [[ -n "$SAVE_RESULT" ]]; then
  CMD+=(--save-result --result-dir "$RESULT_DIR")
fi

if [[ -n "$VERBOSE" ]]; then
  CMD+=(--verbose)
fi

if [[ -n "$CUSTOM_INSTRUCTION" ]]; then
  CMD+=(--custom-instruction "$CUSTOM_INSTRUCTION")
fi

export TS_BENCH_V2_SETUP_WAIT_SEC="$V2_SETUP_WAIT_SEC"

# ── run ──────────────────────────────────────────────────────────────────────
TASK_DISPLAY="${TASKS:-$TASK}"
echo ""
echo "======================================================"
echo "  v2 SWE-Lancer local benchmark"
echo "  Task(s): $TASK_DISPLAY"
echo "  Agent:   $AGENT"
echo "  Model:   $MODEL"
echo "  Provider: $PROVIDER"
echo "  Timeout: ${TIMEOUT}s"
echo "======================================================"
echo ""
echo "Running: ${CMD[*]}"
echo ""

"${CMD[@]}" 2>&1 | tee benchmark-summary.txt
BENCH_EXIT=${PIPESTATUS[0]}

# ── post-run: print SWE-Lancer logs ─────────────────────────────────────────
echo ""
echo "==> SWE-Lancer host logs"
bash scripts/print-v2-swelancer-logs.sh .v2-swelancer-logs

# ── summary ──────────────────────────────────────────────────────────────────
echo ""
echo "======================================================"
echo "  Local run summary"
echo "======================================================"
echo "  Task(s):  $TASK_DISPLAY"
echo "  Agent:    $AGENT"
echo "  Model:    $MODEL"
echo "  Provider: $PROVIDER"

if [[ -f "$RESULT_DIR/latest.json" ]] && command -v jq >/dev/null 2>&1; then
  SR=$(jq -r '.summary.successRate // "n/a"' "$RESULT_DIR/latest.json")
  SC=$(jq -r '.summary.successCount // "?"' "$RESULT_DIR/latest.json")
  TC=$(jq -r '.summary.totalCount // "?"' "$RESULT_DIR/latest.json")
  echo "  Success rate: ${SR}% (${SC}/${TC})"
fi

echo ""
echo "  Logs:     $OUTPUT_DIR/$AGENT/logs/"
echo "  Patches:  .patches/"
echo "  SWE logs: .v2-swelancer-logs/"
if [[ -n "$SAVE_RESULT" ]]; then
  echo "  Results:  $RESULT_DIR/"
fi
echo "======================================================"

exit "$BENCH_EXIT"
