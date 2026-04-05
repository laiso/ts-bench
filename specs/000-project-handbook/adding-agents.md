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
