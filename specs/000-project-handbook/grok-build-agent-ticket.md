# Grok Build agent integration ticket

Status: in progress

Branch: `feat/grok-build-agent`

Latest pushed commit: `929eb19 Configure Grok API model for CLI`

PR URL: https://github.com/laiso/ts-bench/pull/new/feat/grok-build-agent

## Goal

Add a `grok` agent path for xAI Grok Build / Grok Code Fast so manual benchmark runs can execute Grok CLI from GitHub Actions with `XAI_API_KEY`.

## Done

- Added `grok` as an agent option in the CLI/registry and benchmark workflows.
- Wired `XAI_API_KEY` and `GROK_CODE_XAI_API_KEY` into the Grok agent process.
- Added Grok CLI installation in manual benchmark workflows.
- Added Grok docs and environment notes for local and Actions usage.
- Added workflow diagnostics for `grok models`.
- Added an Actions step that writes `~/.grok/config.toml` for the requested model.
- Verified local tests: `bun test ./src` passed with 188 tests.
- Pushed branch using a repository-scoped deploy key.

## Run Findings

### Run 27019778747

URL: https://github.com/laiso/ts-bench/actions/runs/27019778747

- Commit: `a14e373`
- Model input: `grok-build-0.1`
- Grok CLI installed and benchmark execution started.
- Failed before solving because the CLI rejected the model:
  `Couldn't set model 'grok-build-0.1': Invalid params: "unknown model id".`

Conclusion: workflow install and secret wiring were working, but Grok CLI did not know `grok-build-0.1` without extra config.

### Run 27020033230

URL: https://github.com/laiso/ts-bench/actions/runs/27020033230

- Commit: old head before the latest config fix.
- The run reached the xAI API with `model_id=grok-build`.
- xAI returned 404:
  `The model grok-build does not exist or your team ... does not have access to it.`

Conclusion: `grok-build` is not a valid API model id for this request, or this team lacks access to it.

### Run 27020371897

URL: https://github.com/laiso/ts-bench/actions/runs/27020371897

- Commit: `929eb19`
- Model input: `grok-code-fast-1`
- Workflow summary reported `accumulate - Agent Success (14.9s)`.
- Test result still failed because the exercise file remained unchanged:
  `throw new Error('Remove this line and implement the function')`
- Artifact log `results/grok/logs/accumulate.log` showed no stdout and this stderr:
  `chat/completions API error status=404 Not Found`
  `Request URL: https://api.x.ai/v1/chat/completions model_id=grok-build`

Conclusion: this was a false positive agent success. No diff was produced, and Grok CLI still sent `model_id=grok-build` internally despite the workflow input being `grok-code-fast-1`.

## Current Diagnosis

- The benchmark runner currently treats the Grok CLI process as successful even when stderr contains an xAI API error and no files changed.
- The current `~/.grok/config.toml` format may be ignored or incorrect for Grok CLI `0.2.22`.
- `grok-code-fast-1` is the better model id to test, but the CLI still needs to be forced to pass it through as the API `model_id`.
- V1 artifacts do not yet make the produced diff/no-diff state obvious enough.

## Next Todo

- Confirm the exact Grok CLI custom model config format for API model ids.
- Make Grok CLI use `grok-code-fast-1` as the API `model_id`, not `grok-build`.
- Treat Grok stderr API failures as agent failures, including `API error status=...`.
- Treat "no files changed" after agent execution as a failure or explicit warning.
- Add V1 diff/no-diff output to the workflow artifact or summary.
- Re-run a one-exercise benchmark after the fix:
  `agent=grok`, `provider=xai`, `model=grok-code-fast-1`, `exercise=accumulate`.

## Resume Notes

Start by inspecting the Grok agent command construction and the workflow config step. The artifact from run `27020371897` is the clearest current reproduction: it reports agent success but `accumulate.log` contains the xAI 404 for `model_id=grok-build` and no diff exists.
