import { DOCKER_BASE_ARGS, createCliCacheArgs, createEnvironmentArgs, createWorkspaceArgs } from '../utils/docker';
import type { ExecutionStrategy, Command, PrepareContext, PreparedCommand } from './types';
import { join } from 'path';

export class DockerExecutionStrategy implements ExecutionStrategy {
  constructor(private containerName: string) { }

  prepare(core: Command, ctx: PrepareContext): PreparedCommand {
    if (ctx.datasetType === 'v2') {
      // SWE-Lancer monolith strategy
      // Mount ts-bench root to /ts-bench-host so we can access scripts
      const hostMount = ['-v', `${process.cwd()}:/ts-bench-host:ro`];

      // Mount local .claude directory to capture logs
      const claudeMount = ['-v', `${join(process.env.HOME || '/root', '.claude')}:/root/.claude`];

      // Mount patches directory for write access
      const patchesMount = ['-v', `${join(process.cwd(), '.patches')}:/patches`];

      // Extract ISSUE_ID from exercise path (basename)
      const issueId = require('path').basename(ctx.exercisePath);

      // Use setup_expensify.yml for setup. This handles git checkout, dependencies, etc.
      // We explicitly set ISSUE_ID env var for the command
      // Set CI=true and NPM_CONFIG_YES=true to prevent interactive prompts during build
      const setupCmd = `export ISSUE_ID=${issueId} && export CI=true && export NPM_CONFIG_YES=true && ansible-playbook -i "localhost," --connection=local /app/tests/setup_expensify.yml && source /root/.nvm/nvm.sh && `;
      const patchCmd = ctx.applyPatchPath ? `git apply ${ctx.applyPatchPath} && ` : '';

      let postCmd = '';
      if (ctx.generatePatchPath) {
        postCmd = `; RES=$?; git diff > ${ctx.generatePatchPath}; exit $RES`;
      } else {
        postCmd = '';
      }

      const command = [
        ...DOCKER_BASE_ARGS,
        "--entrypoint", "/usr/bin/env",
        ...createCliCacheArgs(),
        ...createEnvironmentArgs(core.env || {}),
        "--platform", "linux/amd64",
        ...hostMount,
        ...claudeMount,
        ...patchesMount,
        "-w", "/app/expensify",
        this.containerName,
        "bash", "-c",
        `${setupCmd}${patchCmd}(exec "$@")${postCmd}`,
        "--",
        ...core.args
      ];

      return {
        command,
        options: {}
      };
    }

    const workspacePath = join(process.cwd(), ctx.exercisePath);

    // Build read-only mounts for test files to prevent modification
    const testMountArgs: string[] = [];
    if (ctx.testFiles && ctx.testFiles.length > 0) {
      for (const testFile of ctx.testFiles) {
        const hostPath = join(workspacePath, testFile);
        const containerPath = `/workspace/${testFile}`;
        testMountArgs.push('-v', `${hostPath}:${containerPath}:ro`);
      }
    }

    const command = [
      ...DOCKER_BASE_ARGS,
      ...createCliCacheArgs(),
      ...createEnvironmentArgs(core.env || {}),
      ...createWorkspaceArgs({ workspacePath }),
      ...testMountArgs,
      this.containerName,
      ...core.args
    ];

    return {
      command,
      options: {}
    };
  }
}
