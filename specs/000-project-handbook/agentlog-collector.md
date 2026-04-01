# Extensible Agent Log Collector**

### **1. Background**

In the `ts-bench` project, it is important not only to evaluate the performance of each AI coding agent by their execution results, but also to analyze the thought process behind their code generation. To enable this analysis, we need a feature that collects each agent's conversation logs and safely stores them as GitHub Actions Artifacts.

However, each agent outputs logs in very different ways:

    * **Claude Code**: Automatically saves conversation logs as `.jsonl` files in specific directories under `~/.claude/projects/`.
    * **Other Agents**: May output detailed logs to standard output (stdout).

We need a highly extensible design that can handle these differences individually and easily accommodate new agents in the future. Additionally, since logs may contain sensitive information such as API keys, masking must be performed before saving.

### **2. Goals**

The goals of this design are:

    * **Extensibility**: Build a mechanism that allows new agent log collection logic to be added easily, with minimal impact on existing code.
    * **Uniformity**: Ensure that logs can be collected via a unified interface from `AgentRunner`, regardless of the underlying approach.
    * **Security**: Reliably remove (mask) sensitive information such as API keys and tokens from all collected logs.
    * **Accuracy**: Capture logs in a way that is precise and tailored to each agent's specifications.

As a proof of concept, we will implement support for the `claude-code` agent.

### **3. Proposed Design**

To encapsulate the different log collection methods for each agent and allow dynamic switching, we will use the **Strategy Pattern**.

#### **Architecture Overview**

1.  **`LogCollector` (Strategy Interface)**: Defines a common interface for log collection algorithms. All concrete collectors implement this interface.
2.  **Concrete Strategies**:
            * `ClaudeLogCollector`: Implements log collection logic specific to `claude-code` (searching the `~/.claude` directory).
            * `GenericLogCollector`: Default strategy for other agents, saving command execution stdout as logs.
3.  **`AgentLoggerFactory` (Factory)**: Determines the agent type and generates the appropriate `LogCollector` (strategy) instance.
4.  **`AgentRunner` (Context)**: Uses the `LogCollector` instance obtained via `AgentLoggerFactory` to invoke log collection after agent execution.

With this design, `AgentRunner` depends only on the `LogCollector` interface, without knowing the details of log collection, resulting in a loosely coupled and highly extensible structure.

### **4. Implementation Details**

#### **File Structure**

```
src/
├── runners/
│   └── agent.ts        # Modified: Calls AgentLoggerFactory
├── agents/
│   └── builders/
└── utils/
        ├── agent-logger.ts   # New: Implements the strategy pattern
        └── logger.ts         # Unchanged: Reuses redact method
```

#### **`utils/agent-logger.ts`**

This new file implements the core logic of the design.

```typescript
// src/utils/agent-logger.ts

import { readdir, readFile, writeFile, mkdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { ConsoleLogger } from './logger';
import type { AgentType, BenchmarkConfig } from '../config/types';
import type { CommandResult } from './shell';

/**
 * Common interface for log collection logic
 */
interface LogCollector {
        collect(config: BenchmarkConfig, exercise: string, exercisePath: string, result: CommandResult): Promise<void>;
}

/**
 * Class for collecting Claude Code logs
 */
class ClaudeLogCollector implements LogCollector {
        async collect(config: BenchmarkConfig, exercise: string, exercisePath: string): Promise<void> {
                // ... Logic to identify the latest log file from ~/.claude/projects,
                // apply redact processing, and save to logDir ...
        }
}

/**
 * Generic class for saving stdout as logs
 */
class GenericLogCollector implements LogCollector {
        async collect(config: BenchmarkConfig, exercise: string, result: CommandResult): Promise<void> {
                // ... Combine result.stdout and result.stderr,
                // apply redact processing, and save to logDir ...
        }
}

/**
 * Factory that returns the appropriate LogCollector based on agent type
 */
export class AgentLoggerFactory {
        static create(agent: AgentType): LogCollector {
                switch (agent) {
                        case 'claude':
                                return new ClaudeLogCollector();
                        case 'aider':
                                return new AiderLogCollector();
                        default:
                                return new GenericLogCollector();
                }
        }
}
```

#### **Modifications to `runners/agent.ts`**

`AgentRunner` now simply calls the factory after command execution.

```typescript
// src/runners/agent.ts

import { AgentLoggerFactory } from '../utils/agent-logger';

// ...
export class AgentRunner {
        async run(/*...args...*/): Promise<AgentResult> {
                // ...
                try {
                        // ... Execute agent command
                        const result = await this.executor.execute(prepared.command, execOptions);

                        // Invoke log collection
                        const logCollector = AgentLoggerFactory.create(config.agent);
                        await logCollector.collect(config, exercise, exercisePath, result);
                        
                        // ... Handle execution results
                } catch (error) {
                        // ...
                }
        }
}
```

#### **Security: Masking Sensitive Information**

All concrete `LogCollector` classes (`ClaudeLogCollector`, `GenericLogCollector`) call the `redact` method from `src/utils/logger.ts` to sanitize content before writing logs to files. This ensures consistent removal of sensitive information from all logs.

### **5. Alternatives Considered**

#### **`if/switch` Branching in `AgentRunner`**

The simplest approach is to use conditional branching in the `run` method of `AgentRunner`, such as `if (config.agent === 'claude') { ... } else if (config.agent === 'aider') { ... }`.

    * **Disadvantages**: This approach requires modifying `AgentRunner` every time a new agent is added, bloating the class's responsibilities. It reduces maintainability and violates the Open/Closed Principle, so it was not adopted.

-----

### **6. Future Work**

With this design, supporting new agents in the future becomes straightforward:

1.  Investigate the log collection method for the new agent.
2.  If necessary, add a new `LogCollector` class to `src/utils/agent-logger.ts`.
3.  Add a single new `case` statement to `AgentLoggerFactory`.
