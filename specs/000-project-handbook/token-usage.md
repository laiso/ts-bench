# Token Usage Collection

How ts-bench collects and reports token counts from each agent CLI.

## Overview

After each agent run, `extractTokenUsage()` (`src/utils/token-parser.ts`) inspects
the agent's output and log files to produce a `TokenUsage` object:

```typescript
interface TokenUsage {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cost?: number;
}
```

Results are displayed in the benchmark summary:

```
🔤 Total Tokens: 182,300 (input: 179,800 / output: 2,500)
```

Cost is attached automatically when both `inputTokens` and `outputTokens` are
available and a pricing entry exists for the model (see `src/config/pricing.ts`).

---

## Per-Agent Collection Method

### Claude (`agent === 'claude'`)

**Source:** `~/.claude/projects/<project-dir>/*.jsonl` (local) or
`~/.cache/ts-bench/auth/claude/projects/<project-dir>/*.jsonl` (Docker)

The newest `.jsonl` file in the project directory is parsed line-by-line.
Each line is a JSON event; token counts come from two mutually exclusive locations:

| Event type | Token location |
|---|---|
| `message_delta` | top-level `usage.input_tokens` / `usage.output_tokens` |
| `message_start` | `message.usage.input_tokens` / `message.usage.output_tokens` |

A line carrying both fields is **not** double-counted (`if / else if`).

### Copilot (`agent === 'copilot'`)

**Source:** stderr (`parseCopilotStderr`)

Copilot prints a session summary to stderr at the end of each run:

```
Breakdown by AI model:
 claude-sonnet-4.6   237.9k in, 2.0k out, 158.6k cached (Est. 1 Premium request)
```

All model lines are summed. Token counts may use `k`/`m` suffixes
(`237.9k` → 237,900).

### All other agents — generic stdout/stderr fallback

**Source:** stdout then stderr (`parseStdoutTokenUsage`)

Patterns matched in order:

| Pattern | Example | Fields |
|---|---|---|
| JSON blob | `{"input_tokens":1234,"output_tokens":567}` | input + output |
| Aider | `Tokens: 1,200 sent, 340 received` | input + output |
| Generic input | `Input tokens: 1234` | input |
| Generic output | `Output tokens: 567` | output |
| Generic total | `Total tokens: 1801` | total only |
| Codex CLI | `tokens used\n9,113` | total only |
| Codex API key | `Usage: prompt=1234 completion=567` | input + output |

### Availability by agent

| Agent | Input/Output | Total only | Notes |
|---|---|---|---|
| `claude` | ✅ | — | JSONL file |
| `copilot` | ✅ | — | stderr summary |
| `aider` | ✅ | — | stdout pattern |
| `codex` | ❌ | ✅ | `tokens used\nN` in stdout |
| `gemini` | ❌ | ❌ | no output |
| `goose` | ❌ | ❌ | no output |
| `opencode` | ❌ | ❌ | no output |
| `cursor` | ❌ | ❌ | no output |
| `qwen` | ❌ | ❌ | no output |
| `kimi` | ❌ | ❌ | no output |

---

## Aggregation (`sumTokenUsages`)

When multiple exercises are benchmarked, per-exercise `TokenUsage` objects are
merged by `sumTokenUsages()`:

- `inputTokens` and `outputTokens` are summed across all entries that provide them.
- Entries that carry **only** `totalTokens` (no breakdown) are accumulated
  separately and added to the final `totalTokens` without polluting the
  input/output breakdown with zeros.
- `cost` is summed only when at least one entry provides it.
- Returns `undefined` when all entries are `undefined`.

```
totalTokens = Σ inputTokens + Σ outputTokens + Σ totalOnlyTokens
```
