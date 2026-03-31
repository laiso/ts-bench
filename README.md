# ts-bench: TypeScript Agent Benchmark

**ts-bench** is a **reproducible** benchmark for comparing **AI coding agents** (CLIs and assistants) on **TypeScript** workloads—not raw model APIs in isolation.

## Who this is for

The goal is to help **individual developers** and **small teams** run the **same harness** on **their machine or CI**, with **agents they actually use**, and compare outcomes **at the agent layer** (prompting, tool use, iteration)—not to optimize abstract **model × provider** matrices for lab leaderboards.

## Limitations (read this)

This project is **not** an enterprise-grade evaluation platform. Runs depend on your hardware, network, API keys, and agent versions—**variance is expected**. Treat numbers as **directional**, not statistically rigorous or publication-ready.

## Datasets

### v1 — Exercism (baseline / template)

- Small **Exercism** practice exercises (default: a curated set of 25).
- Serves as a **reproducible baseline** for “can this agent edit TS in isolation?”
- The v1 exercise set and its long-form docs are **not** a high-maintenance product surface; think of it as a **template** you can fork and extend yourself.

### v2 — SWE-Lancer (current focus)

- Uses the **SWE-Lancer** task set against a **large real-world monorepo** ([Expensify/App](https://github.com/Expensify/App) via submodules), driven by metadata from [openai/frontier-evals](https://github.com/openai/frontier-evals).
- **Why this dataset:** it is a **large monorepo**, the product is **complex** (including **mobile** and web surfaces), and the stack is **TypeScript**-heavy—closer to day-to-day engineering than toy katas.
- **Requires Docker** (`--dataset v2` implies Docker) and the SWE-Lancer monolith image; setup: `./scripts/setup-v2-env.sh` or [Environment Setup](docs/environment.md) (Docker / v2).
- **CI:** manual workflow [`.github/workflows/benchmark-v2.yml`](.github/workflows/benchmark-v2.yml) (long-running; see docs). Optional: [`.github/workflows/benchmark-v2-set.yml`](.github/workflows/benchmark-v2-set.yml) runs a **subset** of high-reward tasks serially (see `docs/environment.md`).

## Supported agents (`--agent`)

| CLI value | Agent | Notes |
|-----------|--------|--------|
| `claude` | [Claude Code](https://www.anthropic.com/claude-code) | |
| `codex` | [Codex CLI](https://developers.openai.com/codex/cli/) | |
| `gemini` | [Gemini CLI](https://cloud.google.com/gemini/docs/codeassist/gemini-cli) | |
| `opencode` | [OpenCode](https://opencode.ai/) | |
| `goose` | [Goose CLI](https://block.github.io/goose/) | |
| `qwen` | [Qwen Code](https://qwenlm.github.io/qwen-code-docs/) | |
| `aider` | [Aider](https://aider.chat/) | |
| `kimi` | [Kimi Code CLI](https://www.kimi.com/code/) | Default provider: `moonshot` |
| `cursor` | [Cursor](https://cursor.com/) | Uses `CURSOR_API_KEY` where applicable |
| `copilot` | GitHub Copilot CLI | See [Environment Setup](docs/environment.md) |
| `vibe` | Mistral Vibe | Requires `MISTRAL_API_KEY` |

## Supported providers (`--provider`)

Typical API keys live in your environment; full detail is in **[docs/environment.md](docs/environment.md)**.

| Provider | Typical env vars |
|----------|------------------|
| `openai` | `OPENAI_API_KEY` |
| `anthropic` | `ANTHROPIC_API_KEY` |
| `google` | `GOOGLE_API_KEY`, `GEMINI_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |
| `dashscope` | `DASHSCOPE_API_KEY` |
| `xai` | `XAI_API_KEY` |
| `deepseek` | `DEEPSEEK_API_KEY` |
| `github` | GitHub token (e.g. `GH_TOKEN`) for Copilot flows |
| `cerebras` | `CEREBRAS_API_KEY` |
| `mistral` | `MISTRAL_API_KEY` |
| `moonshot` | `MOONSHOT_API_KEY`, `KIMI_API_KEY` |

The manual v2 workflow also lists **`groq`** and **`zai`** as provider choices for GitHub Actions secrets alignment (not all are exposed in the CLI type union); see [`.github/workflows/benchmark-v2.yml`](.github/workflows/benchmark-v2.yml).

## Vision and principles

Inspired by benchmarks like [Aider Polyglot](https://aider.chat/2024/12/21/polyglot.html), ts-bench evaluates the **whole agent**, not a single model endpoint.

- **TypeScript-first:** static typing and real project shapes matter for agents.
- **Agent-agnostic:** swap CLIs behind the same runner.
- **v1 vs v2:** v1 is a **compact baseline**; v2 stresses **repo-scale** editing and integration.

## Results and methodology

- **v1 runs:** [benchmark workflow runs](https://github.com/laiso/ts-bench/actions/workflows/benchmark.yml)
- **v2 runs:** [benchmark-v2 workflow runs](https://github.com/laiso/ts-bench/actions/workflows/benchmark-v2.yml)
- **Methodology:** [docs/METHODOLOGY.md](docs/METHODOLOGY.md)

Artifacts include JSON logs suitable for your own analysis—**no official ranked leaderboard is maintained in this README.**

## SWE-Lancer task browser (GitHub Pages)

https://laiso.github.io/ts-bench/swelancer-tasks/

After you enable **GitHub Pages** with **GitHub Actions** as the source (Settings → Pages), the searchable SWE-Lancer task list is published at **`https://<org>.github.io/<repo>/swelancer-tasks/`** (exact URL appears in the workflow run after deploy). Locally, run `bun run build:swelancer-pages`, then serve the `docs/` folder with any static file server and open `/swelancer-tasks/` (e.g. `bunx serve docs` and visit `http://localhost:3000/swelancer-tasks/`).

## Documentation

- [Environment Setup](docs/environment.md) — local, Docker, secrets, v2 image, GHA
- [AGENTS.md](AGENTS.md) — agent-specific notes and v2 caveats
- [Cursor Cloud and fallback hosts for v2](docs/phase-0-cursor-cloud.md) — disk, Docker, image pull; alternatives if cloud is insufficient
- [Aggregated results JSON](docs/leaderboard.md) — optional `public/data/leaderboard.json` (community-maintained)

## Git branches

- **`main`:** default branch. Includes **v1** (Exercism) and opt-in **v2** (SWE-Lancer). Omitting `--dataset` selects **v1**.
- **`v2`:** optional long-lived topic branch for focused v2 work; **prefer `main`** for contributions unless you are coordinating branch-specific experiments.

## Getting started

### Install

```bash
bun install
```

For **v2**, also initialize submodules and pull the monolith image (v2 always uses Docker):

```bash
./scripts/setup-v2-env.sh
```

### Run

```bash
bun src/index.ts --help

# v1 example (default dataset): Claude on the default exercise list
bun src/index.ts --agent claude --model claude-3-5-sonnet-20240620

# Single Exercism exercise
bun src/index.ts --agent aider --model gpt-4o --exercise acronym

# v2 (Docker): one SWE-Lancer task by id (--task; v1 uses --exercise only)
bun src/index.ts --dataset v2 --agent claude --model <model> --provider anthropic --task 16912_4
```

With `--save-result`, results are written under your `--result-dir` and local aggregates can be refreshed (see [docs/leaderboard.md](docs/leaderboard.md)).
