export interface Command {
  args: string[];
  env?: Record<string, string>;
  /** When set (v2 Docker + agents with long -p), mount this host file and expand prompt via file instead of inline -p */
  promptFileHostPath?: string;
  promptFileContainerPath?: string;
}

export interface PrepareContext {
  exercisePath: string;
  // Optionally pass test files for read-only mounts in Docker
  testFiles?: string[];
  datasetType?: 'v1' | 'v2';
  issueId?: string;
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
