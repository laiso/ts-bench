# Adding a New Agent

## Required changes

Adding a new agent requires **one new file**:

| # | File | What to do |
|---|------|-----------|
| 1 | `config/agents/<name>.yaml` | Declare the agent (**mandatory**) |

Everything else — the agent registry, `AGENT_DEFAULT_PROVIDER`, the factory, and the
`--help` agent list — is derived automatically from the files in `config/agents/`.

To try an agent without committing it to the repository, point the CLI at any
YAML/JSON file instead:

```bash
bun src/index.ts --agent-config ./my-agent.yaml
```

---

## Step 1 — Write the config file

Create `config/agents/mynewagent.yaml`. The fields mirror the `AgentSchema` type in
`src/agents/schema.ts`:

```yaml
name: mynewagent
description: "Acme's coding agent"
defaultProvider: openai        # used when --provider is not specified
install:
  method: mise
  tool: npm:@acme/mynewagent-cli
  bin: mynewagent

require:                       # fail fast before the run when these are unset
  - ACME_API_KEY

env:
  ACME_API_KEY: "${ACME_API_KEY}"

command:
  - mynewagent
  - --yolo
  - "{#model}--model {model}{/model}"
  - -p
  - "{instructions}"
```

### `install` variants

`install.method` decides how `scripts/run-agent.sh` obtains the binary when it is not
already on `PATH`:

| `method` | Required fields | Effect in `run-agent.sh` |
|----------|----------------|--------------------------|
| `mise`    | `bin`, `tool`, optional `version` | `mise use -g <tool>[@<version>]`, then runs via `mise exec` |
| `npm`     | `bin`, `package` | `npm install -g <package>` |
| `curl`    | `bin`, `url`, optional `cmdPrefix` | `curl -fsSL <url> \| bash` (cmdPrefix must be `KEY=VALUE`) |
| `pip`     | `bin`, `package` | `pip install <package>` |
| `uv_tool` | `bin`, `package`, optional `python` | `uv tool install [--python <ver>] <package>` |

Only `mise` supports on-demand install of agents that have no dedicated `case` branch
in `run-agent.sh`: the loader exports the tool spec as `AGENT_TOOL` and the script's
generic `*)` fallback installs it. `--agent-version` overrides `install.version`.

---

## Step 2 — Declare environment variables

`env` is applied first, then `providers.<provider>.env` is merged over it. Values go
through template expansion:

| Form | Meaning |
|---|---|
| `${VAR}` | Host env var; the entry is **dropped** when unset |
| `${VAR:-${OTHER:-lit}}` | Recursive fallback chain, shell-style |
| `{model}` / `{provider}` / `{exercise}` | Run parameters; dropped when absent |
| `""` (literal empty) | **Kept** as an explicit blank — use this to mask a host env var the CLI must not see (see `qwen.yaml`) |

`require` lists host env vars that must be present, checked *before* the benchmark
starts. A string requires that one variable; a list requires at least one of them:

```yaml
require:
  - CURSOR_API_KEY                                  # this one
  - [ANTHROPIC_API_KEY, DASHSCOPE_API_KEY]          # at least one of these
```

Put `require` at the top level for always-needed keys, or under
`providers.<provider>.require` when it depends on `--provider`.

---

## Step 3 — Declare the command template

`command` is the argv template. The first element is the agent name passed to
`run-agent.sh`; `bash <script>` is prepended automatically.

| Template | Expands to |
|---|---|
| `"{instructions}"` | The task prompt, **verbatim** — never env-expanded, so prompts containing `${...}` survive intact |
| `"{#model}--model {model}{/model}"` | `--model <model>` when `--model` is given, otherwise nothing |
| `"{sourceFiles}"` / `"{testFiles}"` | One argument per file; nothing when the list is empty |
| `"--file {sourceFiles}"` | The flag repeated per file: `--file a.ts --file b.ts` |
| `"--read {testFiles:-*.test.ts}"` | Same, falling back to `*.test.ts` when the list is empty |

Use the flag-per-file form whenever the CLI binds one path per flag. Writing
`--read` and `{testFiles}` as two separate array elements would attach only the first
file to the flag and leave the rest as positional arguments — for aider that would
make the test files editable.

---

## What is derived automatically

Once the config file exists, the following require **no manual update**:

- `AGENT_REGISTRY` — loaded from `config/agents/` at import time
- `AGENT_DEFAULT_PROVIDER` — derived from each schema's `defaultProvider`
- `AgentFactory.create()` — uses `GenericAgentBuilder` with the loaded definition
- `--help` agent list in `src/utils/cli.ts` — uses `Object.keys(AGENT_REGISTRY)`

---

## Special cases

A few agents need behavior the schema cannot yet express, and carry a branch keyed on
`schema.name` inside `src/agents/loader.ts`:

- **claude, gemini, codex, copilot** — subscription auth: when no API key is set, fall
  back to a cached Docker credential (`--setup-auth`) or the local CLI login instead of
  failing.
- **claude** — mapping `--model` onto `ANTHROPIC_DEFAULT_*_MODEL` for non-Anthropic providers.
- **opencode** — prefixing the model with `<provider>/` when it has no slash.
- **kimi** — generating the `--config` JSON that registers the moonshot provider and the
  model's context size, exposed to the template as `{kimiConfig}`.

Adding a new agent should not need a new branch here. If yours does, prefer extending
the schema so the behavior stays declarative — see #122.
