#!/usr/bin/env bash
set -euo pipefail

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

AGENT=${1:-}
if [[ -z "$AGENT" ]]; then
  echo "[run-agent] Missing agent name" >&2
  exit 1
fi
shift || true

# Try to load nvm if available (common in swelancer images)
export NVM_DIR="/root/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Set npm prefix after nvm is loaded to avoid nvm prefix guardrails
export npm_config_prefix="${CLI_PREFIX}"
export NPM_CONFIG_PREFIX="${CLI_PREFIX}"

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

# Resolve the directory containing this script so agents.json can be found
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS_JSON="${SCRIPT_DIR}/agents.json"

# If jq is available and agents.json exists, attempt data-driven install for unknown agents
install_from_registry() {
  local agent_name="$1"
  if ! command -v jq >/dev/null 2>&1 || [[ ! -f "$AGENTS_JSON" ]]; then
    return 1
  fi

  local method bin package url cmd_prefix python_ver
  method=$(jq -r --arg a "$agent_name" '.[$a].method // empty' "$AGENTS_JSON")
  if [[ -z "$method" ]]; then
    return 1
  fi

  bin=$(jq -r --arg a "$agent_name" '.[$a].bin' "$AGENTS_JSON")

  case "$method" in
    npm)
      package=$(jq -r --arg a "$agent_name" '.[$a].package' "$AGENTS_JSON")
      ensure_node_cli "$bin" "$package"
      ;;
    curl)
      if ! command -v "$bin" >/dev/null 2>&1; then
        url=$(jq -r --arg a "$agent_name" '.[$a].url' "$AGENTS_JSON")
        cmd_prefix=$(jq -r --arg a "$agent_name" '.[$a].cmdPrefix // empty' "$AGENTS_JSON")
        echo "[run-agent] Installing ${bin} via curl" >&2
        # Only allow simple KEY=VALUE env var prefixes (no arbitrary commands)
        if [[ -n "$cmd_prefix" ]] && [[ "$cmd_prefix" =~ ^[A-Z_][A-Z0-9_]*=[^[:space:]]*$ ]]; then
          env "$cmd_prefix" curl -fsSL "$url" | bash
        else
          curl -fsSL "$url" | bash
        fi
      fi
      ;;
    pip)
      if ! command -v "$bin" >/dev/null 2>&1; then
        package=$(jq -r --arg a "$agent_name" '.[$a].package' "$AGENTS_JSON")
        echo "[run-agent] Installing ${bin} via pip" >&2
        pip install "$package"
      fi
      ;;
    uv_tool)
      if command -v "$bin" >/dev/null 2>&1; then
        return 0
      fi
      package=$(jq -r --arg a "$agent_name" '.[$a].package' "$AGENTS_JSON")
      if command -v uv >/dev/null 2>&1; then
        python_ver=$(jq -r --arg a "$agent_name" '.[$a].python // empty' "$AGENTS_JSON")
        if [[ -n "$python_ver" ]]; then
          uv tool install --python "$python_ver" "$package"
        else
          uv tool install "$package"
        fi
      else
        url=$(jq -r --arg a "$agent_name" '.[$a].url // empty' "$AGENTS_JSON")
        if [[ -n "$url" ]]; then
          echo "[run-agent] Installing ${bin} via official installer" >&2
          curl -LsSf "$url" | bash
        else
          echo "[run-agent] uv not found and no fallback URL for ${bin}. Please install manually." >&2
          exit 1
        fi
      fi
      ;;
    *)
      return 1
      ;;
  esac
  return 0
}

# Return the binary name for an agent from agents.json, or the agent key if not found.
get_agent_bin() {
  local agent_name="$1"
  local bin
  if command -v jq >/dev/null 2>&1 && [[ -f "$AGENTS_JSON" ]]; then
    bin=$(jq -r --arg a "$agent_name" '.[$a].bin // empty' "$AGENTS_JSON")
    if [[ -n "$bin" ]]; then
      echo "$bin"
      return 0
    fi
  fi
  echo "$agent_name"
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
  cline)
    ensure_node_cli "cline" "cline"
    if [ "${1:-}" != "--version" ]; then
      if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
        cline auth -p anthropic -k "$ANTHROPIC_API_KEY"
      elif [ -n "${OPENAI_API_KEY:-}" ]; then
        cline auth -p openai-native -k "$OPENAI_API_KEY"
      elif [ -n "${OPENROUTER_API_KEY:-}" ]; then
        cline auth -p openrouter -k "$OPENROUTER_API_KEY"
      elif [ -n "${MOONSHOT_API_KEY:-}" ]; then
        cline auth -p moonshot -k "$MOONSHOT_API_KEY"
      elif [ -n "${XAI_API_KEY:-}" ]; then
        cline auth -p xai -k "$XAI_API_KEY"
      elif [ -n "${DEEPSEEK_API_KEY:-}" ]; then
        cline auth -p deepseek -k "$DEEPSEEK_API_KEY"
      fi
    fi
    exec cline "$@"
    ;;
  kimi)
    if command -v "kimi" >/dev/null 2>&1; then
      exec kimi "$@"
    fi

    if command -v "uv" >/dev/null 2>&1; then
      uv tool install --python 3.13 kimi-cli
      exec kimi "$@"
    fi

    echo "[run-agent] Installing Kimi CLI via official installer" >&2
    curl -LsSf https://code.kimi.com/install.sh | bash
    exec kimi "$@"
    ;;
  vibe)
    if ! command -v "vibe" >/dev/null 2>&1; then
      echo "[run-agent] Installing mistral-vibe" >&2
      pip install mistral-vibe
    fi
    exec vibe "$@"
    ;;
  *)
    # Try data-driven install from agents.json registry, then fall back to
    # running the binary directly if it is already installed.
    if install_from_registry "$AGENT"; then
      exec "$(get_agent_bin "$AGENT")" "$@"
    elif command -v "$AGENT" >/dev/null 2>&1; then
      exec "$AGENT" "$@"
    else
      echo "[run-agent] Unsupported agent '${AGENT}'. Please install the CLI manually." >&2
      exit 1
    fi
    ;;
 esac
