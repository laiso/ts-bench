#!/usr/bin/env bash
set -euo pipefail

CLI_PREFIX=${RUN_AGENT_CLI_PREFIX:-/root/.local}
export PATH="${CLI_PREFIX}/bin:${PATH}"
export npm_config_prefix="${CLI_PREFIX}"
export NPM_CONFIG_PREFIX="${CLI_PREFIX}"

AGENT=${1:-}
if [[ -z "$AGENT" ]]; then
  echo "[run-agent] Missing agent name" >&2
  exit 1
fi
shift || true

ensure_node_cli() {
  local bin_name="$1"
  local package_name="$2"

  if command -v "$bin_name" >/dev/null 2>&1; then
    return 0
  fi

  echo "[run-agent] Installing ${bin_name} (package: ${package_name})" >&2
  npm install -g --prefix "$CLI_PREFIX" "$package_name"
}

case "$AGENT" in
  aider)
    if ! command -v "aider" >/dev/null 2>&1; then
      echo "[run-agent] Installing aider via official script" >&2
      curl -LsSf https://aider.chat/install.sh | bash
    fi
    exec aider "$@"
    ;;
  goose)
    if ! command -v "goose" >/dev/null 2>&1; then
      echo "[run-agent] Installing goose CLI" >&2
      env CONFIGURE=false curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | bash
    fi
    exec goose "$@"
    ;;
  cursor | cursor-agent)
    if ! command -v "cursor-agent" >/dev/null 2>&1; then
      echo "[run-agent] Installing cursor agent" >&2
      curl -fsS https://cursor.com/install | bash
    fi
    exec cursor-agent "$@"
    ;;
  opencode)
    ensure_node_cli "opencode" "opencode-ai"
    exec opencode "$@"
    ;;
  codex)
    ensure_node_cli "codex" "@openai/codex"
    exec codex "$@"
    ;;
  claude)
    ensure_node_cli "claude" "@anthropic-ai/claude-code"
    exec claude "$@"
    ;;
  gemini)
    ensure_node_cli "gemini" "@google/gemini-cli"
    exec gemini "$@"
    ;;
  qwen)
    ensure_node_cli "qwen" "@qwen-code/qwen-code"
    exec qwen "$@"
    ;;
  copilot)
    ensure_node_cli "copilot" "@github/copilot"
    exec copilot "$@"
    ;;
  *)
    if command -v "$AGENT" >/dev/null 2>&1; then
      exec "$AGENT" "$@"
    fi

    echo "[run-agent] Unsupported agent '${AGENT}'. Please install the CLI manually." >&2
    exit 1
    ;;
 esac
