# Methodology

This document outlines the methodology used to generate the benchmark results for the **TypeScript Agent Benchmark (ts-bench)**. Our primary goal is transparency and reproducibility, as stated in the project's PRD. All code for this benchmark is open-source and available in the repository.

## 1. Benchmark Environment

* **Runner**: The benchmark is designed to be executed within a GitHub Actions runner using the `ubuntu-latest` image.
* **Execution**: The benchmark script is a TypeScript application run using **Bun**.
* **Isolation**: To ensure a clean and isolated environment for each agent, execution can be containerized using **Docker**. The framework provides utilities to build and run agents within Docker containers.

---

## 2. Problem Set

* **Source**: The benchmark uses a set of TypeScript problems derived from the **Exercism** practice exercises. By default, a curated list of 25 exercises is used for standard runs.
* **Structure**: Each problem consists of:
    * A detailed instruction file in Markdown (`.docs/instructions.md`).
    * Stub source code file(s) for the agent to complete.
    * A pre-written test suite (e.g., `*.test.ts`) used for evaluation.

---

## 3. Execution Process

The benchmark runner executes a sequence of steps for each problem to ensure consistency and fairness.

1.  **Reset State**: Before each run, the specific exercise directory is reset to its original clean state using `git checkout HEAD -- .`. This reverts any changes from previous runs.
2.  **Run AI Agent**: The selected AI agent is invoked with a standardized prompt containing the problem instructions. The agent then attempts to modify the source file(s) to solve the problem.
3.  **Restore Tests**: In case the agent modified any test files, they are restored to their original state to prevent the agent from altering the evaluation criteria.
4.  **Run Tests**: The official test suite for the exercise is executed using the configured `testCommand` (e.g., `corepack yarn && corepack yarn test`).

---

## 4. Agent Invocation

* **Standardized Interface**: The framework uses a factory pattern to support multiple command-line AI agents (`claude`, `aider`, `goose`, etc.).
* **Command Building**: For each agent, a specific `AgentBuilder` constructs the shell command, setting the appropriate model, environment variables, and prompt arguments.
* **Prompt**: The prompt sent to the agent is a combination of a base instruction, the exercise's specific `instructions.md`, and environment details.

---

## 5. Evaluation and Scoring

* **Success Criteria**: A problem is marked as an **`overallSuccess`** only if **both** of the following conditions are met:
    1.  The agent process completes successfully (exit code 0) (`agentSuccess`).
    2.  The subsequent test suite run passes all tests (exit code 0) (`testSuccess`).
* **Metrics**: The following data points are recorded for each run:
    * Success status (agent, test, and overall).
    * Duration for the agent and test phases.
    * Any errors from the agent or test processes.
   

---

## 6. Transparency and Reporting

* **Result Storage**: All results from a benchmark run are saved into a detailed JSON file. This includes metadata about the run (agent, model, timestamp) and the full list of per-exercise results.
* **Aggregated JSON**: A utility can merge result files into `public/data/leaderboard.json` for optional comparison across agents and models (see [leaderboard.md](leaderboard.md)). The main README does not embed a ranked table.
* **Automation**: The entire process is designed to be automated via GitHub Actions, with results and logs being publicly available for scrutiny.