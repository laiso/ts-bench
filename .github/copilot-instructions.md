# Copilot Instructions for ts-bench

> **Always use `bun`, never `node` or `npm run`.**

- **Any new or changed code must include tests. Run `bun test ./src` and confirm all pass.**
- Exercism placeholder code is **intentionally broken**; `--test-only` failures on unmodified exercises are expected.
- Exercise tests use Yarn v4 (`corepack yarn`). Install corepack if missing: `npm install -g corepack@0.29.4 && corepack enable`.
- To add an agent: add a builder in `src/agents/builders/` and register it in `src/agents/factory.ts`.
- v2 (SWE-Lancer) requires Docker. One-time setup: `./scripts/setup-v2-env.sh`. Image: `swelancer/swelancer_x86_monolith:releasev1` (~15 GB).
- Subscription-based auth (no API key) for Claude, Gemini, Codex: `bun src/index.ts --setup-auth <agent>`.
