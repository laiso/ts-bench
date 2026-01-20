export interface Command {
  args: string[];
  env?: Record<string, string>;
}

export interface PrepareContext {
  exercisePath: string;
  // Optionally pass test files for read-only mounts in Docker
  testFiles?: string[];
  datasetType?: 'v1' | 'v2';
  commitId?: string;
  generatePatchPath?: string;
  applyPatchPath?: string;
}

export interface PreparedCommand {
  command: string[];
  options: import('../utils/shell').ExecuteOptions;
}

export interface ExecutionStrategy {
  prepare(core: Command, ctx: PrepareContext): PreparedCommand;
}

