/**
 * V2 (SWE-Lancer) single-container execution.
 *
 * V2ContainerManager creates a long-lived Docker container.  It supports
 * two modes:
 *
 *   1. **Single-task** — `setup(opts)` runs `setup_expensify.yml` once
 *      (checkout + patch + npm install + webpack) for a single task.
 *
 *   2. **Commit-grouped** — `setupBase(commitId, firstIssueId)` runs the
 *      expensive, commit-specific steps (checkout + npm install + webpack)
 *      once.  Then for each task sharing that commit,
 *      `prepareTask(issueId)` applies the task-specific patch and
 *      `resetToBaseline()` reverts to the clean post-setup state.
 *      This avoids repeating npm install + webpack for every task.
 *
 * V2DockerExecStrategy implements the standard ExecutionStrategy interface
 * so AgentRunner / TestRunner can use it transparently — every `prepare()`
 * call emits a `docker exec` instead of `docker run`.
 */

import { mkdirSync } from 'fs';
import { join, basename } from 'path';
import type { CommandExecutor, CommandResult } from '../utils/shell';
import type { Logger } from '../utils/logger';
import type { ExecutionStrategy, Command, PrepareContext, PreparedCommand } from './types';
import {
    SWELANCER_HOST_LOGS_DIR,
    SWELANCER_ISSUES_PATH,
    SWELANCER_RUN_TESTS_HOST,
    SWELANCER_SETUP_MITMPROXY_HOST,
} from '../config/constants';
import {
    createAuthCacheArgs,
    createCliCacheArgs,
    createEnvironmentArgs,
    createNpmCacheArgs,
    NPM_CACHE_CONTAINER_PATH,
    SWELANCER_CLI_CACHE_CONTAINER_PATH,
} from '../utils/docker';
import { PROMPT_PLACEHOLDER } from '../agents/prompt-files';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Directory inside the container where host .agent-prompts/ is mounted */
const AGENT_PROMPTS_CONTAINER_DIR = '/tmp/ts-bench-agent-prompts';

// ---------------------------------------------------------------------------
// V2ContainerManager
// ---------------------------------------------------------------------------

export interface V2ContainerOptions {
    /** Task / issue ID (e.g. "15815_1") */
    issueId: string;
    /** Timeout in seconds for long-running exec calls */
    timeout?: number;
    verbose?: boolean;
}

export interface V2BaseSetupOptions {
    /** Git commit hash to checkout (shared across tasks in a group) */
    commitId: string;
    /** Any issue ID in the group — used only for cert generation & log dirs */
    firstIssueId: string;
    timeout?: number;
    verbose?: boolean;
}

export class V2ContainerManager {
    private containerId: string | null = null;

    constructor(
        private executor: CommandExecutor,
        private logger: Logger,
        private containerImage: string,
        /** Agent name for auth cache mounts (defaults to 'claude') */
        private agentName: string = 'claude',
    ) {}

    // ------------------------------------------------------------------
    // Container lifecycle
    // ------------------------------------------------------------------

    /**
     * Create and start a long-lived container with all necessary bind-mounts.
     * The container runs `tail -f /dev/null` so it stays alive until we
     * explicitly stop it.
     */
    async create(opts: V2ContainerOptions): Promise<void> {
        const mounts = this.buildMounts();
        const env = this.buildEnv(opts.issueId);

        const createArgs = [
            'docker', 'create',
            '--entrypoint', '/usr/bin/env',
            ...createCliCacheArgs(SWELANCER_CLI_CACHE_CONTAINER_PATH),
            ...createEnvironmentArgs(env),
            '--platform', 'linux/amd64',
            ...mounts,
            '-w', '/app/expensify',
            this.containerImage,
            'tail', '-f', '/dev/null',
        ];

        if (opts.verbose) {
            this.logger.info(`[v2] Creating container for task ${opts.issueId}`);
        }

        const createResult = await this.executor.execute(createArgs);
        if (createResult.exitCode !== 0) {
            throw new Error(`docker create failed: ${createResult.stderr}`);
        }
        this.containerId = createResult.stdout.trim();

        const startResult = await this.executor.execute([
            'docker', 'start', this.containerId,
        ]);
        if (startResult.exitCode !== 0) {
            throw new Error(`docker start failed: ${startResult.stderr}`);
        }

        if (opts.verbose) {
            this.logger.info(`[v2] Container started: ${this.containerId.slice(0, 12)}`);
        }
    }

    /**
     * Run `setup_expensify.yml` inside the container (once per task).
     * Checks out the correct commit, applies `bug_reintroduce.patch`,
     * installs npm deps, and compiles webpack.
     */
    async setup(opts: V2ContainerOptions): Promise<CommandResult> {
        const setupCmd = [
            `export ISSUE_ID=${opts.issueId}`,
            'export CI=true',
            'export NPM_CONFIG_YES=true',
            // Unset NPM_CONFIG_PREFIX before sourcing nvm to avoid conflicts
            `sed 's|source /root/.nvm/nvm.sh|unset NPM_CONFIG_PREFIX npm_config_prefix NPM_PREFIX; source /root/.nvm/nvm.sh|g' /app/tests/setup_expensify.yml > /tmp/setup_expensify_unset.yml`,
            'ansible-playbook -i "localhost," --connection=local /tmp/setup_expensify_unset.yml',
            // Commit the baseline so agent diffs are clean
            'git add -A',
            'git -c user.email=ts-bench@local -c user.name=ts-bench commit -m "setup baseline" --no-gpg-sign --allow-empty',
        ].join(' && ');

        if (opts.verbose) {
            this.logger.info(`[v2] Running setup_expensify for ${opts.issueId} (one-time)...`);
        }

        return this.exec(setupCmd, { timeout: opts.timeout });
    }

    // ------------------------------------------------------------------
    // Commit-grouped lifecycle (shared setup across tasks)
    // ------------------------------------------------------------------

    /**
     * Run the expensive, commit-specific parts of setup_expensify once:
     *   cert generation → git checkout → npm_fix → nvm install → npm install → webpack
     * Task-specific patches are NOT applied here — use `prepareTask()`.
     */
    async setupBase(opts: V2BaseSetupOptions): Promise<CommandResult> {
        // Reuse the proven ansible-playbook path (same as setup()).
        // The playbook handles certs, git checkout, npm_fix, nvm,
        // npm install, webpack — AND applies the task-specific
        // bug_reintroduce.patch for firstIssueId.
        //
        // After ansible finishes we revert tracked-file changes so the
        // baseline is commit-clean (no task-specific patch).  Build
        // artifacts (node_modules, dist/) are untracked and stay put.
        // prepareTask() will apply each task's patch individually.
        const setupCmd = [
            `export ISSUE_ID=${opts.firstIssueId}`,
            'export CI=true',
            'export NPM_CONFIG_YES=true',
            // Fix nvm NPM_CONFIG_PREFIX conflict (same sed as setup())
            `sed 's|source /root/.nvm/nvm.sh|unset NPM_CONFIG_PREFIX npm_config_prefix NPM_PREFIX; source /root/.nvm/nvm.sh|g' /app/tests/setup_expensify.yml > /tmp/setup_expensify_unset.yml`,
            'ansible-playbook -i "localhost," --connection=local /tmp/setup_expensify_unset.yml',
            // Undo the task-specific patch that ansible applied — revert
            // tracked source files to the checked-out commit state while
            // keeping untracked build artifacts (node_modules, dist, etc.)
            'cd /app/expensify',
            'git checkout -- .',
            // Commit the clean baseline
            'git add -A',
            'git -c user.email=ts-bench@local -c user.name=ts-bench commit -m "base setup" --no-gpg-sign --allow-empty',
        ].join(' && ');

        if (opts.verbose) {
            this.logger.info(`[v2] Running base setup for commit ${opts.commitId.slice(0, 12)} (shared across tasks)...`);
        }

        return this.exec(setupCmd, { timeout: opts.timeout });
    }

    /**
     * Apply the task-specific patch (revert_command or bug_reintroduce.patch)
     * and commit so agent diffs are clean.
     */
    async prepareTask(issueId: string, opts?: { timeout?: number; verbose?: boolean }): Promise<CommandResult> {
        // Mirrors the revert_command / bug_reintroduce.patch logic from
        // setup_expensify.yml, but runs as a lightweight docker exec.
        const cmd = [
            'cd /app/expensify',
            `export ISSUE_ID=${issueId}`,

            // Create log/attempts dirs
            `mkdir -p /app/tests/logs/${issueId}`,
            `mkdir -p /app/tests/attempts/${issueId}`,

            // Apply revert_command if non-empty, else apply bug_reintroduce.patch
            `REVERT=$(cat /app/tests/issues/${issueId}/revert_command.txt 2>/dev/null || echo "")`,
            `PATCH=$(cat /app/tests/issues/${issueId}/bug_reintroduce.patch 2>/dev/null | head -c 1 || echo "")`,
            'if [ -n "$REVERT" ]; then eval "$REVERT";' +
            ' elif [ -n "$PATCH" ]; then patch -p1 < /app/tests/issues/$ISSUE_ID/bug_reintroduce.patch;' +
            ' fi',

            // Commit so agent git-diff is clean
            'git add -A',
            `git -c user.email=ts-bench@local -c user.name=ts-bench commit -m "task ${issueId} patch" --no-gpg-sign --allow-empty`,
        ].join(' && ');

        if (opts?.verbose) {
            this.logger.info(`[v2] Preparing task ${issueId} (applying patch)...`);
        }

        return this.exec(cmd, { timeout: opts?.timeout });
    }

    /**
     * Revert the working tree to the base-setup state (undo task patch +
     * agent changes).  Call this between tasks in a commit group.
     *
     * Also kills background services started by the test phase (run.sh)
     * so the next task can bind the same ports (e.g. :9000 web-proxy).
     */
    async resetToBaseline(opts?: { verbose?: boolean }): Promise<CommandResult> {
        const cmd = [
            // 1. Kill background services left by the previous test phase.
            //    run.sh starts: concurrently(web-proxy :9000, webpack-dev-server :8082),
            //    nginx, mitmdump.  We kill them all so the next task can start fresh.
            'pkill -f "web/proxy.ts" || true',
            'pkill -f "webpack-dev-server" || true',
            'pkill -f "mitmdump" || true',
            'pkill -f "concurrently" || true',
            'nginx -s stop 2>/dev/null || true',
            // Remove the setup-done sentinel so the next run.sh can recreate it
            'rm -f /setup_done.txt',
            // 2. Git reset to the base-setup commit
            'cd /app/expensify',
            'BASE=$(git log --all --oneline --grep="base setup" --format="%H" | tail -1)',
            'git reset --hard $BASE',
            'git clean -fd',
        ].join(' && ');

        if (opts?.verbose) {
            this.logger.info('[v2] Resetting to baseline for next task...');
        }

        return this.exec(cmd);
    }

    /**
     * Execute an arbitrary command inside the running container.
     */
    async exec(
        command: string,
        options?: { timeout?: number; env?: Record<string, string> },
    ): Promise<CommandResult> {
        if (!this.containerId) {
            throw new Error('Container not created yet - call create() first');
        }

        const args = ['docker', 'exec'];
        if (options?.env) {
            for (const [k, v] of Object.entries(options.env)) {
                args.push('-e', `${k}=${v}`);
            }
        }
        args.push(this.containerId, 'bash', '-c', command);

        return this.executor.execute(args, { timeout: options?.timeout });
    }

    /**
     * Remove the container (idempotent).
     */
    async destroy(): Promise<void> {
        if (this.containerId) {
            await this.executor.execute([
                'docker', 'rm', '-f', this.containerId,
            ]);
            this.containerId = null;
        }
    }

    /** Return the container ID (for logging / debugging). */
    getId(): string | null {
        return this.containerId;
    }

    // ------------------------------------------------------------------
    // Private helpers
    // ------------------------------------------------------------------

    private buildMounts(): string[] {
        const cwd = process.cwd();
        // ts-bench root (read-only)
        const hostMount = ['-v', `${cwd}:/ts-bench-host:ro`];
        // Agent auth cache (subscription-auth + log capture)
        const authMount = createAuthCacheArgs(this.agentName);
        // Patches directory (read-write: agent writes, test reads)
        const patchesDir = join(cwd, '.patches');
        mkdirSync(patchesDir, { recursive: true });
        const patchesMount = ['-v', `${patchesDir}:/patches`];
        // Agent prompt files (written by writeAgentPromptFile, read by agent exec)
        const promptsDir = join(cwd, '.agent-prompts');
        mkdirSync(promptsDir, { recursive: true });
        const promptsMount = ['-v', `${promptsDir}:${AGENT_PROMPTS_CONTAINER_DIR}:ro`];
        // Issues (test definitions, read-only)
        const issuesMount = ['-v', `${join(cwd, SWELANCER_ISSUES_PATH)}:/app/tests/issues:ro`];
        // Patched YAML files
        const runTestsMount = ['-v', `${join(cwd, SWELANCER_RUN_TESTS_HOST)}:/app/tests/run_tests.yml:ro`];
        const mitmMount = ['-v', `${join(cwd, SWELANCER_SETUP_MITMPROXY_HOST)}:/app/tests/setup_mitmproxy.yml:ro`];
        // Log directory (survives container removal)
        const logsDir = join(cwd, SWELANCER_HOST_LOGS_DIR);
        mkdirSync(logsDir, { recursive: true });
        const logsMount = ['-v', `${logsDir}:/app/tests/logs`];
        // npm cache
        const npmCacheMount = createNpmCacheArgs();

        return [
            ...hostMount,
            ...authMount,
            ...npmCacheMount,
            ...patchesMount,
            ...promptsMount,
            ...issuesMount,
            ...runTestsMount,
            ...mitmMount,
            ...logsMount,
        ];
    }

    private buildEnv(issueId: string): Record<string, string> {
        return {
            NPM_CONFIG_CACHE: NPM_CACHE_CONTAINER_PATH,
            RUN_AGENT_CLI_PREFIX: SWELANCER_CLI_CACHE_CONTAINER_PATH,
            ISSUE_ID: issueId,
        };
    }
}

// ---------------------------------------------------------------------------
// V2DockerExecStrategy
// ---------------------------------------------------------------------------

/**
 * ExecutionStrategy that emits `docker exec` commands targeting an existing
 * V2 container.  Unlike DockerExecutionStrategy (which produces `docker run`
 * with inline setup), this strategy assumes setup is already complete and
 * only wraps the core command.
 */
export class V2DockerExecStrategy implements ExecutionStrategy {
    constructor(private containerId: string) {}

    prepare(core: Command, ctx: PrepareContext): PreparedCommand {
        const issueId = ctx.issueId ?? basename(ctx.exercisePath);

        // --- Patch handling ---------------------------------------------------
        const patchCmd = ctx.applyPatchPath
            ? `if [ -s ${ctx.applyPatchPath} ]; then git apply ${ctx.applyPatchPath}; fi; `
            : '';

        let postCmd = '';
        if (ctx.generatePatchPath) {
            postCmd = '; RES=$?; git diff > ' + ctx.generatePatchPath + '; exit $RES';
        }

        // --- Core command string ----------------------------------------------
        let coreCommandStr = core.args.length >= 3 && core.args[0] === 'bash' && core.args[1] === '-c'
            ? core.args[2]!
            : core.args.join(' ');

        // --- Prompt-file expansion (same logic as DockerExecutionStrategy) -----
        if (core.promptFileHostPath) {
            const filename = basename(core.promptFileHostPath);
            const containerPromptPath = `${AGENT_PROMPTS_CONTAINER_DIR}/${filename}`;
            const sq = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
            const catArg = `"$(cat ${containerPromptPath})"`;

            const phIdx = core.args.indexOf(PROMPT_PLACEHOLDER);
            if (phIdx !== -1) {
                coreCommandStr = core.args
                    .map((a) => (a === PROMPT_PLACEHOLDER ? catArg : sq(a)))
                    .join(' ');
            } else {
                const pIdx = core.args.indexOf('-p');
                if (pIdx !== -1 && pIdx + 1 < core.args.length) {
                    const before = core.args.slice(0, pIdx).map(sq);
                    const after = core.args.slice(pIdx + 2).map(sq);
                    coreCommandStr = [...before, '-p', catArg, ...after].join(' ');
                }
            }
        }

        // --- Environment vars for docker exec -e flags -------------------------
        const envArgs: string[] = [];
        const mergedEnv: Record<string, string> = {
            ...(core.env || {}),
            ISSUE_ID: issueId,
        };
        for (const [k, v] of Object.entries(mergedEnv)) {
            if (typeof v === 'string' && v.length > 0) {
                envArgs.push('-e', `${k}=${v}`);
            }
        }

        // --- Final command ----------------------------------------------------
        const command = [
            'docker', 'exec',
            ...envArgs,
            this.containerId,
            'bash', '-c',
            `${patchCmd}${coreCommandStr}${postCmd}`,
        ];

        return { command, options: {} };
    }
}
