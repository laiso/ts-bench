# Subscription Authentication

Run AI agents without API keys using local login sessions.

## Supported Agents

- Claude Code
- Gemini CLI
- Codex

## Quick Start

```bash
# One-time setup (choose your agent)
bun src/index.ts --setup-auth claude
bun src/index.ts --setup-auth gemini
bun src/index.ts --setup-auth codex

# Then run benchmarks normally — no API key needed
bun src/index.ts --agent claude --exercise acronym --docker
```

## How It Works

Authentication happens inside a Docker container and persists on your machine:

| Priority | Condition | Behavior |
|---|---|---|
| 1 | API key env var is set | Use API key (GitHub Actions, explicit key) |
| 2 | Auth cache exists | Use subscription auth (local Docker) |
| 3 | Neither | Error with setup suggestion |

Auth state is stored at `~/.cache/ts-bench/auth/<agent>/` and mounted into containers automatically.

## FAQ

**Is this safe for GitHub Actions?**
GitHub Actions always uses API keys via secrets (priority 1). Subscription auth is for local development only.

**Do I need to re-authenticate?**
Auth state persists across container runs. Re-authenticate only if credentials expire.

**Which agents support this?**
Only agents with built-in local login: Claude Code, Gemini CLI, and Codex. Other agents (aider, goose, etc.) still require API keys.
