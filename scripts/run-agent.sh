#!/usr/bin/env bash
set -euo pipefail

# Bypass asdf/mise/rtx tool version checks if we are inside a repo with .tool-versions
export ASDF_SKIP_RESHIM=1

# Determine default prefix based on environment
if [[ "$OSTYPE" == "darwin"* ]] || [[ "$OSTYPE" == "linux-gnu"* && "$EUID" -ne 0 ]]; then
    # User mode (macOS or non-root Linux)
    DEFAULT_PREFIX="${HOME}/.local"
else
    # Docker/Root mode
    DEFAULT_PREFIX="/root/.local"
fi

CLI_PREFIX=${RUN_AGENT_CLI_PREFIX:-$DEFAULT_PREFIX}
export PATH="${CLI_PREFIX}/bin:${PATH}"
export npm_config_prefix="${CLI_PREFIX}"
export NPM_CONFIG_PREFIX="${CLI_PREFIX}"

AGENT=${1:-}
if [[ -z "$AGENT" ]]; then
  echo "[run-agent] Missing agent name" >&2
  exit 1
fi
shift || true

# Hide .tool-versions if present to avoid version manager conflicts (asdf/mise)
if [ -f .tool-versions ]; then
    # Try to rename, but don't fail if we can't (e.g. read-only)
    if mv .tool-versions .tool-versions.hidden 2>/dev/null; then
        trap 'mv .tool-versions.hidden .tool-versions' EXIT
    else
        echo "[run-agent] Warning: Could not hide .tool-versions. Agent might fail due to version mismatch." >&2
    fi
fi

# Try to load nvm if available (common in swelancer images)
export NVM_DIR="/root/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

ensure_node_cli() {
  local bin_name="$1"
  local package_name="$2"
  
  echo "[run-agent] Checking for ${bin_name}..." >&2

  if command -v "$bin_name" >/dev/null 2>&1; then
    echo "[run-agent] ${bin_name} found." >&2
    return 0
  fi

  # Check if node is available, if not try to install it
  if ! command -v node >/dev/null 2>&1; then
      echo "[run-agent] Node.js not found. Attempting to install..." >&2
      if command -v conda >/dev/null 2>&1; then
          echo "[run-agent] Installing nodejs via conda..." >&2
          conda install -y -c conda-forge nodejs
      elif command -v apt-get >/dev/null 2>&1; then
          echo "[run-agent] Installing nodejs via apt..." >&2
          curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
          apt-get install -y nodejs
      else 
          echo "[run-agent] No package manager found to install nodejs." >&2
          exit 1
      fi
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
    aider "$@"
    ;;
  goose)
    if ! command -v "goose" >/dev/null 2>&1; then
      echo "[run-agent] Installing goose CLI" >&2
      env CONFIGURE=false curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | bash
    fi
    goose "$@"
    ;;
  cursor | cursor-agent)
    if ! command -v "cursor-agent" >/dev/null 2>&1; then
      echo "[run-agent] Installing cursor agent" >&2
      curl -fsS https://cursor.com/install | bash
    fi
    cursor-agent "$@"
    ;;
  opencode)
    ensure_node_cli "opencode" "opencode-ai"
    opencode "$@"
    ;;
  codex)
    ensure_node_cli "codex" "@openai/codex"
    codex "$@"
    ;;
  claude)
    ensure_node_cli "claude" "@anthropic-ai/claude-code"
    claude "$@"
    ;;
  gemini)
    ensure_node_cli "gemini" "@google/gemini-cli"
    gemini "$@"
    ;;
  qwen)
    ensure_node_cli "qwen" "@qwen-code/qwen-code"
    qwen "$@"
    ;;
  copilot)
    ensure_node_cli "copilot" "@github/copilot"
    copilot "$@"
    ;;
  vibe)
    if ! command -v "vibe" >/dev/null 2>&1; then
      echo "[run-agent] Installing mistral-vibe" >&2
      pip install mistral-vibe
    fi
    vibe "$@"
    ;;
  *)
    if command -v "$AGENT" >/dev/null 2>&1; then
      "$AGENT" "$@"
    else
      echo "[run-agent] Unsupported agent '${AGENT}'. Please install the CLI manually." >&2
      exit 1
    fi
    ;;
 esac