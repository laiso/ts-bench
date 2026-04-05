# Adding a New Agent

## Required changes

Adding a new agent requires changes in at most **2 places**:

| # | File | What to do |
|---|------|-----------|
| 1 | `src/agents/registry.ts` | Add one entry to `AGENT_REGISTRY` (**mandatory**) |
| 2 | `scripts/agents.json` | Add one entry for auto-install in `run-agent.sh` (optional but recommended) |

Everything else — `AgentType` union, `AGENT_DEFAULT_PROVIDER`, the factory switch-case, and the `--help` agent list — is derived automatically from the registry.

---

## Step 1 — Add an entry to `AGENT_REGISTRY`

Open `src/agents/registry.ts` and add a new key to the `AGENT_REGISTRY` object.
Each entry must satisfy the `AgentDefinition` interface:

```typescript
export interface AgentDefinition {
    defaultProvider: ProviderType;          // used when --provider is not specified
    install: InstallConfig;                 // mirrors agents.json
    getEnv(config: AgentConfig): Record<string, string>;
    buildArgs(config: AgentConfig, instructions: string, fileList?: FileList): string[];
}
```

### Minimal example (npm-installed agent)

```typescript
mynewagent: {
    defaultProvider: 'openai' as ProviderType,
    install: { method: 'npm', bin: 'mynewagent', package: '@acme/mynewagent-cli' },
    getEnv(config: AgentConfig): Record<string, string> {
        return {
            ACME_API_KEY: requireEnv('ACME_API_KEY', 'Missing ACME_API_KEY for MyNewAgent')
        };
    },
    buildArgs(config: AgentConfig, instructions: string): string[] {
        return [
            'bash', config.agentScriptPath,
            'mynewagent',
            '--model', config.model,
            '-p', instructions
        ];
    }
},
```

### `install` variants

| `method` | Required fields | Effect in `run-agent.sh` |
|----------|----------------|--------------------------|
| `npm`     | `bin`, `package` | `npm install -g <package>` |
| `curl`    | `bin`, `url`, optional `cmdPrefix` | `curl -fsSL <url> \| bash` (cmdPrefix must be `KEY=VALUE`) |
| `pip`     | `bin`, `package` | `pip install <package>` |
| `uv_tool` | `bin`, `package`, optional `python` | `uv tool install [--python <ver>] <package>` |

---

## Step 2 — Add an entry to `scripts/agents.json` (optional)

If the new agent is **not** already in the `case` block of `run-agent.sh`, add it to
`scripts/agents.json` so the generic `*)` fallback can install it automatically:

```json
"mynewagent": { "bin": "mynewagent", "method": "npm", "package": "@acme/mynewagent-cli" }
```

Fields mirror the `InstallConfig` type from `registry.ts`.  
If the agent already has a named `case` in `run-agent.sh`, this step can be skipped.

---

## What is derived automatically

Once the registry entry exists, the following require **no manual update**:

- `AgentType` — derived as `keyof typeof AGENT_REGISTRY`
- `AGENT_DEFAULT_PROVIDER` — derived from each entry's `defaultProvider`
- `AgentFactory.create()` — uses `GenericAgentBuilder` with the registry definition
- `--help` agent list in `src/utils/cli.ts` — uses `Object.keys(AGENT_REGISTRY)`

---

## Special cases

Agents with unusual logic (multi-step auth, complex arg construction, etc.) should
implement their `getEnv` / `buildArgs` as inline functions directly in the registry
entry — no separate builder class is needed.

If an agent genuinely requires a custom `BaseAgentBuilder` subclass (e.g. for a
completely different `buildCommand` lifecycle), create a builder in
`src/agents/builders/<name>.ts` and export it; then call it from the `AgentFactory`
instead of using `GenericAgentBuilder` for that agent.

---

## Agent complexity classification (3-layer model)

Agents fall into three layers based on the complexity of their CLI and environment
setup. The **core principle** is: *declare what you can; use a function for what you
can't.*

### Layer 1 — Declarative (most new agents)

The only differences are flag names. Express everything as fields in the registry
entry and rely on the generic builder to assemble the command:

| Field | Purpose | Example values |
|---|---|---|
| `cliBin` | Executable name | `'gemini'`, `'opencode'` |
| `subcommand` | Optional CLI subcommand | `'run'` (goose), `'exec'` (codex) |
| `autoApproveFlag` | Skip confirmation prompt | `'--yolo'`, `'--dangerously-skip-permissions'`, `'--auto-approve'` |
| `modelFlag` | Model flag name | `'--model'` (default), `'-m'` |
| `instructionFlag` | Prompt flag name | `'-p'`, `'--message'`, `'--text'`, `'--prompt'`, `null` (positional) |
| `extraStaticArgs` | Additional fixed flags | `['--debug']` |
| `envKeys` | Env vars required | `['MISTRAL_API_KEY']` |

Agents that fit entirely in Layer 1: **vibe, copilot, gemini, qwen, opencode, cursor**.

Example:

```typescript
vibe: {
    defaultProvider: 'mistral',
    install: { method: 'pip', bin: 'vibe', package: 'mistral-vibe' },
    // layer-1 declarative fields:
    autoApproveFlag: '--auto-approve',
    instructionFlag: '--prompt',
    getEnv(config) { return { MISTRAL_API_KEY: requireEnv('MISTRAL_API_KEY') }; },
    buildArgs(config, instructions) { /* assembled by generic builder */ return []; }
}
```

### Layer 2 — Function hooks (moderate complexity)

When `fileList` handling or dynamic config generation is needed, define custom
`buildArgs` / `getEnv` functions inline in the registry entry.
The generic builder calls these when present; otherwise it falls back to the
Layer 1 field-based assembly.

Agents in this layer: **aider** (per-file `--file`/`--read` flags), **kimi** (JSON
config passed via `--config`), **codex** (provider-specific env).

Example — aider's fileList handling:

```typescript
buildArgs(config, instructions, fileList) {
    const args = ['bash', config.agentScriptPath, 'aider',
                  '--yes-always', '--no-auto-commits', '--model', config.model];
    const src = fileList?.sourceFiles ?? [];
    (src.length > 0 ? src : ['*.ts']).forEach(f => args.push('--file', f));
    const test = fileList?.testFiles ?? [];
    (test.length > 0 ? test : ['*.test.ts']).forEach(f => args.push('--read', f));
    args.push('--message', instructions);
    return args;
}
```

### Layer 3 — Existing builder class (most complex)

**claude** and **goose** have non-trivial provider-switching logic and auth-cache
handling that would be cumbersome to express as a function hook.  Keep their
dedicated `*AgentBuilder` classes and reference them from the registry:

```typescript
claude: { builderClass: ClaudeAgentBuilder, defaultProvider: 'anthropic', install: ... },
goose:  { builderClass: GooseAgentBuilder,  defaultProvider: 'anthropic', install: ... },
```

`AgentFactory` checks for `builderClass` first and instantiates it directly;
otherwise it uses `GenericAgentBuilder`.

### Summary

| Layer | When to use | Agents |
|---|---|---|
| **1 — Declarative** | Only flag names differ | vibe, copilot, gemini, qwen, opencode, cursor |
| **2 — Function hooks** | Custom fileList or dynamic config | aider, kimi, codex |
| **3 — Builder class** | Provider switching + auth cache | claude, goose |

Most future agents will be Layer 1 — a single registry object with no code beyond
`getEnv`. Only reach for Layer 2 or 3 when genuinely needed.
