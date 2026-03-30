import {
  DOCKER_BASE_ARGS,
  createCliCacheArgs,
  createEnvironmentArgs,
  createNpmCacheArgs,
  createWorkspaceArgs,
  NPM_CACHE_CONTAINER_PATH,
  SWELANCER_CLI_CACHE_CONTAINER_PATH
} from '../utils/docker';
import type { ExecutionStrategy, Command, PrepareContext, PreparedCommand } from './types';
import {
  SWELANCER_ISSUES_PATH,
  SWELANCER_RUN_TESTS_HOST,
  SWELANCER_SETUP_MITMPROXY_HOST
} from '../config/constants';
import { mkdirSync } from 'node:fs';
import { join } from 'path';

export class DockerExecutionStrategy implements ExecutionStrategy {
  constructor(private containerName: string) { }

  prepare(core: Command, ctx: PrepareContext): PreparedCommand {
    if (ctx.datasetType === 'v2') {
      // SWE-Lancer monolith strategy
      // Mount ts-bench root to /ts-bench-host so we can access scripts
      const hostMount = ['-v', `${process.cwd()}:/ts-bench-host:ro`];

      const promptMount: string[] =
        core.promptFileHostPath && core.promptFileContainerPath
          ? ['-v', `${core.promptFileHostPath}:${core.promptFileContainerPath}:ro`]
          : [];

      // Mount local .claude directory to capture logs
      const claudeMount = ['-v', `${join(process.env.HOME || '/root', '.claude')}:/root/.claude`];

      // Mount patches directory for write access
      const patchesMount = ['-v', `${join(process.cwd(), '.patches')}:/patches`];
      const issuesMount = ['-v', `${join(process.cwd(), SWELANCER_ISSUES_PATH)}:/app/tests/issues:ro`];
      const runTestsHost = join(process.cwd(), SWELANCER_RUN_TESTS_HOST);
      const runTestsMount = ['-v', `${runTestsHost}:/app/tests/run_tests.yml:ro`];
      const mitmHost = join(process.cwd(), SWELANCER_SETUP_MITMPROXY_HOST);
      const mitmMount = ['-v', `${mitmHost}:/app/tests/setup_mitmproxy.yml:ro`];
      const npmCacheMount = createNpmCacheArgs();

      // Extract ISSUE_ID from context (fallback to exercise path basename)
      const issueId = ctx.issueId ?? require('path').basename(ctx.exercisePath);

      // Persist /app/tests/logs/<ISSUE_ID>/ (pytest.log, npm, mitm, etc.) on the host so
      // `docker run --rm` does not discard them — needed for GHA artifacts and local debugging.
      const hostV2LogsDir = join(process.cwd(), '.v2-test-logs', issueId);
      mkdirSync(hostV2LogsDir, { recursive: true });
      const v2TestLogsMount = [
        '-v',
        `${hostV2LogsDir}:/app/tests/logs/${issueId}`
      ];

      const v2VerboseMounts: string[] = [];
      if (ctx.verbose) {
        const hostAttemptsDir = join(process.cwd(), '.v2-test-logs', issueId, 'attempts');
        const hostUserToolDir = join(process.cwd(), '.v2-test-logs', issueId, 'user_tool');
        mkdirSync(hostAttemptsDir, { recursive: true });
        mkdirSync(hostUserToolDir, { recursive: true });
        v2VerboseMounts.push(
          '-v',
          `${hostAttemptsDir}:/app/tests/attempts/${issueId}`,
          '-v',
          `${hostUserToolDir}:/app/expensify/user_tool`
        );
      }

      // Use setup_expensify.yml for setup. This handles git checkout, dependencies, etc.
      // We explicitly set ISSUE_ID env var for the command
      // Set CI=true and NPM_CONFIG_YES=true to prevent interactive prompts during build
      const setupApFlags = ctx.verbose ? '-vv ' : '';
      const setupCmd = `export ISSUE_ID=${issueId} && export CI=true && export NPM_CONFIG_YES=true && sed 's|source /root/.nvm/nvm.sh|unset NPM_CONFIG_PREFIX npm_config_prefix NPM_PREFIX; source /root/.nvm/nvm.sh|g' /app/tests/setup_expensify.yml > /tmp/setup_expensify_unset.yml && ansible-playbook ${setupApFlags}-i "localhost," --connection=local /tmp/setup_expensify_unset.yml && git add -A && git -c user.email=ts-bench@local -c user.name=ts-bench commit -m "setup baseline" --no-gpg-sign --allow-empty && `;
      const patchCmd = ctx.applyPatchPath
        ? `if [ -s ${ctx.applyPatchPath} ]; then git apply ${ctx.applyPatchPath}; fi; `
        : '';

      let postCmd = '';
      if (ctx.generatePatchPath) {
        postCmd = `; RES=$?; git diff > ${ctx.generatePatchPath}; exit $RES`;
      } else {
        postCmd = '';
      }

      const env: Record<string, string> = {
        ...(core.env || {}),
        NPM_CONFIG_CACHE: NPM_CACHE_CONTAINER_PATH,
        // Do not shadow image /root/.local (mitmdump, pipx); install agents under /opt/ts-bench-cli
        RUN_AGENT_CLI_PREFIX: SWELANCER_CLI_CACHE_CONTAINER_PATH,
        ...(issueId ? { ISSUE_ID: issueId } : {})
      };
      if (ctx.verbose) {
        env.TRACE = 'true';
        env.TS_BENCH_RUN_TESTS_VERBOSE = '1';
      }

      // Inline the core command into a single bash -c string instead of using
      // (exec "$@") which replaces the shell and kills background services.
      let coreCommandStr = core.args.length >= 3 && core.args[0] === 'bash' && core.args[1] === '-c'
        ? core.args[2]!
        : core.args.join(' ');

      if (core.promptFileHostPath && core.promptFileContainerPath) {
        const sq = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
        const pIdx = core.args.indexOf('-p');
        const promptPath = core.promptFileContainerPath;
        if (pIdx !== -1 && pIdx + 1 < core.args.length) {
          const before = core.args.slice(0, pIdx).map(sq);
          const after = core.args.slice(pIdx + 2).map(sq);
          coreCommandStr = [...before, '-p', `"$(cat ${promptPath})"`, ...after].join(' ');
        }
      }

      const command = [
        ...DOCKER_BASE_ARGS,
        "--entrypoint", "/usr/bin/env",
        ...createCliCacheArgs(SWELANCER_CLI_CACHE_CONTAINER_PATH),
        ...createEnvironmentArgs(env),
        "--platform", "linux/amd64",
        ...hostMount,
        ...promptMount,
        ...claudeMount,
        ...npmCacheMount,
        ...patchesMount,
        ...issuesMount,
        ...runTestsMount,
        ...mitmMount,
        ...v2TestLogsMount,
        ...v2VerboseMounts,
        "-w", "/app/expensify",
        this.containerName,
        "bash", "-c",
        `${setupCmd}${patchCmd}${coreCommandStr}${postCmd}`,
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
