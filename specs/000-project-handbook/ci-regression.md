# Regression Testing on CI

Add E2E CI to this repository to ensure that a single benchmark case runs successfully using OpenRouter's free model.

## How to Add E2E CI

The ts-bench repository already has a comprehensive CI/CD system. [1](#0-0) You can create a new workflow for E2E testing by referring to the current workflow.

### Verifying with a Single Case

The existing workflow allows you to specify a particular problem using the `exercise` parameter. [2](#0-1) For a single test case, set it as follows:

```yaml
exercise: "hello-world"  # Specify a single problem
```

### Setting Up OpenRouter's Free Model

The OpenRouter provider is already supported. [3](#0-2) Environment variable setup is also ready. [4](#0-3)

OpenRouter configuration is implemented in the code as well. [5](#0-4)

### Example E2E CI Workflow

It is recommended to create a new workflow file `.github/workflows/e2e-ci.yml`:

```yaml
name: E2E CI Test
on:
    push:
        branches: [main]
    pull_request:
        branches: [main]

jobs:
    e2e-test:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
                with:
                    submodules: recursive
            - uses: oven-sh/setup-bun@v2
            - run: bun install --frozen-lockfile
            - name: Run single benchmark test
                env:
                    OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
                run: |
                    bun src/index.ts \
                        --agent qwen \
                        --model qwen/qwen3-coder:free \
                        --provider openrouter \
                        --exercise acronym \
                        --verbose
```

## TODO

When running a complete E2E benchmark—including agent code generation, test execution, and success/failure judgment—the overall success (`overallSuccess = agentSuccess && testSuccess`) is not reflected in the process exit code. As a result, CI systems like GitHub Actions cannot reliably detect failures.

### Current Situation

- In benchmark mode, both agent and test execution are performed, but the exit code remains 0 even if the benchmark fails.
- There is a proposal to add exit code control using an environment variable such as `CI_FAIL_ON_ERROR`, but this is not yet implemented.

### Impact

- Even if a single-case E2E benchmark fails in CI, it cannot be automatically detected.
- Test results cannot be used for automation purposes such as PR checks or main branch protection.