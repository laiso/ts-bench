/**
 * V2 (SWE-Lancer) single-container execution.
 *
 * V2ContainerManager creates a long-lived Docker container and runs
 * `setup_expensify.yml` exactly once.  V2DockerExecStrategy implements
 * the standard ExecutionStrategy interface so AgentRunner / TestRunner
 * can use it transparently — every `prepare()` call emits a `docker exec`
 * instead of `docker run`, so the expensive setup is never repeated.
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
    /** Timeout in ms for long-running exec calls */
    timeout?: number;
    verbose?: boolean;
}

export class V2ContainerManager {
    private containerId: string | null = null;

    constructor(
        private executor: CommandExecutor,
        private logger: Logger,
        private containerImage: string,
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
        const home = process.env.HOME || '/root';

        // ts-bench root (read-only)
        const hostMount = ['-v', `${cwd}:/ts-bench-host:ro`];
        // Claude config (for agent log capture)
        const claudeMount = ['-v', `${join(home, '.claude')}:/root/.claude`];
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
            ...claudeMount,
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
