# ts-bench: TypeScript Agent Benchmark

**ts-bench** is a transparent and reproducible benchmark project for evaluating the TypeScript code editing capabilities of AI coding agents.

## Leaderboard

<!-- BEGIN_LEADERBOARD -->
| Rank | Agent | Model | Success Rate | Solved | Avg Time | Result |
|:----:|:------|:------|:--------------:|:------:|:----------:|:-----:|
| 1 | opencode | openai/gpt-5 | **96.0%** | 24/25 | 64.8s | [#415419](https://github.com/yukukotani/ts-bench/actions/runs/17366415419) |
| 2 | kimi | kimi-k2.5 | **96.0%** | 24/25 | 78.7s | [#628525](https://github.com/laiso/ts-bench/actions/runs/21475628525) |
| 3 | gemini | gemini-3-pro-preview | **96.0%** | 24/25 | 188.1s | [#914072](https://github.com/laiso/ts-bench/actions/runs/19484914072) |
| 4 | gemini | gemini-3-flash-preview | **92.0%** | 23/25 | 99.7s | [#081278](https://github.com/laiso/ts-bench/actions/runs/20326081278) |
| 5 | goose | claude-sonnet-4-20250514 | **92.0%** | 23/25 | 122.2s | [#186071](https://github.com/laiso/ts-bench/actions/runs/17373186071) |
| 6 | opencode | anthropic/claude-sonnet-4-20250514 | **92.0%** | 23/25 | 127.8s | [#043809](https://github.com/laiso/ts-bench/actions/runs/17375043809) |
| 7 | claude | glm-4.6 | **92.0%** | 23/25 | 132.3s | [#009680](https://github.com/laiso/ts-bench/actions/runs/18133009680) |
| 8 | codex | gpt-5.2 | **92.0%** | 23/25 | 140.4s | [#260672](https://github.com/laiso/ts-bench/actions/runs/20157260672) |
| 9 | gemini | gemini-2.5-pro | **92.0%** | 23/25 | 168.5s | [#052819](https://github.com/laiso/ts-bench/actions/runs/17351052819) |
| 10 | codex | gpt-5 | **88.0%** | 22/25 | 91.7s | [#734992](https://github.com/laiso/ts-bench/actions/runs/17344734992) |
<!-- END_LEADERBOARD -->

























## 🤖 Supported Agents

Currently supported agents:

* [Claude Code](https://www.anthropic.com/claude-code)
* [Codex CLI](https://developers.openai.com/codex/cli/)
* [Gemini CLI](https://cloud.google.com/gemini/docs/codeassist/gemini-cli)
* [OpenCode](https://opencode.ai/)
* [Goose CLI](https://block.github.io/goose/)
* [Qwen Code](https://qwenlm.github.io/qwen-code-docs/)
* [Aider](https://aider.chat/)
* [Kimi Code CLI](https://www.kimi.com/code/)

## 📖 Vision & Principles

This project is strongly inspired by benchmarks like [Aider Polyglot](https://aider.chat/2024/12/21/polyglot.html). Rather than measuring the performance of large language models (LLMs) alone, it focuses on evaluating the **agent layer**—the entire AI coding assistant tool, including prompt strategies, file operations, and iterative logic.

Based on this vision, the benchmark is designed according to the following principles:

* **TypeScript-First**: Focused on TypeScript, which is essential in modern development. Static typing presents unique challenges and opportunities for AI agents, making it a crucial evaluation target.
* **Agent-Agnostic**: Designed to be independent of any specific AI agent, allowing fair comparison of multiple CLI-based agents such as `Aider` and `Claude Code`.
* **Baseline Performance**: Uses self-contained problem sets sourced from Exercism to serve as a **baseline** for measuring basic code reading and editing abilities. It is not intended to measure performance on **large-scale editing tasks or complex bug fixes across entire repositories** like SWE-bench.

## 📊 Results & Methodology

All benchmark results are generated and published via GitHub Actions.

* **➡️ [View All Benchmark Runs Here](https://github.com/laiso/ts-bench/actions/workflows/benchmark.yml)**
* **📜 [Read the Benchmark Methodology](docs/METHODOLOGY.md)**

Each results page provides a formatted summary and downloadable artifacts containing raw data (JSON).

## Documentation
For detailed documentation, see:

- [Environment Setup](docs/environment.md): Details on setting up the local and Docker environments.
- [Leaderboard Operation Design](docs/leaderboard.md): Explains how the leaderboard is updated and maintained.

## 🚀 Getting Started

### Installation

```bash
bun install
```

### Usage

Run the benchmark with the following commands. Use `--help` to see all available options.

```bash
# Run the default 25 problems with Claude Code (Sonnet 3.5)
bun src/index.ts --agent claude --model claude-3-5-sonnet-20240620

# Run only the 'acronym' problem with Aider (GPT-4o)
bun src/index.ts --agent aider --model gpt-4o --exercise acronym
```

Running the benchmark with `--save-result` now also regenerates the local leaderboard dataset under `public/data/latest-results.json`, so you no longer need separate leaderboard flags after exporting results.
