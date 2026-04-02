import { describe, expect, it, beforeEach } from 'bun:test';
import { V2ContainerManager, V2DockerExecStrategy } from '../v2-container';
import type { CommandExecutor, CommandResult } from '../../utils/shell';
import type { Logger } from '../../utils/logger';
import type { Command, PrepareContext } from '../types';
import { PROMPT_PLACEHOLDER } from '../../agents/prompt-files';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function ok(stdout = ''): CommandResult {
    return { exitCode: 0, stdout, stderr: '' };
}

function fail(stderr = 'error'): CommandResult {
    return { exitCode: 1, stdout: '', stderr };
}

class RecordingExecutor implements CommandExecutor {
    calls: { args: string[]; options?: Record<string, unknown> }[] = [];
    results: CommandResult[] = [];

    /** Queue a result for the next execute() call */
    push(result: CommandResult) {
        this.results.push(result);
    }

    async execute(args: string[], options?: Record<string, unknown>): Promise<CommandResult> {
        this.calls.push({ args, options });
        return this.results.shift() ?? ok();
    }
}

const silentLogger: Logger = {
    info: () => {},
    logAgentCommand: () => {},
    logTestCommand: () => {},
    logAgentSuccess: () => {},
    logAgentFailure: () => {},
    logAgentError: () => {},
    logTestSuccess: () => {},
    logTestFailure: () => {},
    logTestError: () => {},
    logExerciseStart: () => {},
    logExerciseResult: () => {},
};

// ---------------------------------------------------------------------------
// V2ContainerManager
// ---------------------------------------------------------------------------

describe('V2ContainerManager', () => {
    let executor: RecordingExecutor;
    let mgr: V2ContainerManager;

    beforeEach(() => {
        executor = new RecordingExecutor();
        mgr = new V2ContainerManager(executor, silentLogger, 'test-image:latest');
    });

    describe('create()', () => {
        it('should issue docker create then docker start', async () => {
            executor.push(ok('abc123def456\n')); // docker create
            executor.push(ok());                  // docker start

            await mgr.create({ issueId: '12345_1' });

            expect(executor.calls).toHaveLength(2);
            expect(executor.calls[0]!.args[0]).toBe('docker');
            expect(executor.calls[0]!.args[1]).toBe('create');
            expect(executor.calls[0]!.args).toContain('test-image:latest');
            expect(executor.calls[1]!.args).toEqual(['docker', 'start', 'abc123def456']);
        });

        it('should store the container ID (trimmed)', async () => {
            executor.push(ok('  abc123  \n'));
            executor.push(ok());

            await mgr.create({ issueId: '12345_1' });
            expect(mgr.getId()).toBe('abc123');
        });

        it('should throw when docker create fails', async () => {
            executor.push(fail('no space'));

            await expect(mgr.create({ issueId: '12345_1' })).rejects.toThrow(
                'docker create failed',
            );
        });

        it('should throw when docker start fails', async () => {
            executor.push(ok('abc123\n'));
            executor.push(fail('cannot start'));

            await expect(mgr.create({ issueId: '12345_1' })).rejects.toThrow(
                'docker start failed',
            );
        });
    });

    describe('exec()', () => {
        it('should throw if container has not been created', async () => {
            await expect(mgr.exec('echo hi')).rejects.toThrow(
                'Container not created yet',
            );
        });

        it('should pass env flags when provided', async () => {
            executor.push(ok('cid\n'));
            executor.push(ok());
            await mgr.create({ issueId: '1' });

            executor.push(ok());
            await mgr.exec('echo hi', { env: { FOO: 'bar' } });

            const execCall = executor.calls[2]!;
            expect(execCall.args).toContain('-e');
            expect(execCall.args).toContain('FOO=bar');
            expect(execCall.args).toContain('bash');
            expect(execCall.args).toContain('-c');
            expect(execCall.args).toContain('echo hi');
        });
    });

    describe('setup()', () => {
        it('should run ansible-playbook with ISSUE_ID', async () => {
            executor.push(ok('cid\n'));
            executor.push(ok());
            await mgr.create({ issueId: '15815_1' });

            executor.push(ok());
            await mgr.setup({ issueId: '15815_1' });

            const setupCall = executor.calls[2]!;
            const bashCmd = setupCall.args[setupCall.args.length - 1]!;
            expect(bashCmd).toContain('ISSUE_ID=15815_1');
            expect(bashCmd).toContain('ansible-playbook');
            expect(bashCmd).toContain('setup baseline');
        });
    });

    describe('setupBase()', () => {
        it('should checkout the given commitId', async () => {
            executor.push(ok('cid\n'));
            executor.push(ok());
            await mgr.create({ issueId: '15815_1' });

            executor.push(ok());
            await mgr.setupBase({
                commitId: 'abc123',
                firstIssueId: '15815_1',
            });

            const call = executor.calls[2]!;
            const bashCmd = call.args[call.args.length - 1]!;
            expect(bashCmd).toContain('git checkout -f abc123');
            expect(bashCmd).toContain('npm install');
            expect(bashCmd).toContain('webpack');
            expect(bashCmd).toContain('"base setup"');
        });
    });

    describe('prepareTask()', () => {
        it('should apply patch for the given issueId', async () => {
            executor.push(ok('cid\n'));
            executor.push(ok());
            await mgr.create({ issueId: '15815_1' });

            executor.push(ok());
            await mgr.prepareTask('48694_681');

            const call = executor.calls[2]!;
            const bashCmd = call.args[call.args.length - 1]!;
            expect(bashCmd).toContain('ISSUE_ID=48694_681');
            expect(bashCmd).toContain('bug_reintroduce.patch');
            expect(bashCmd).toContain('revert_command.txt');
        });
    });

    describe('resetToBaseline()', () => {
        it('should git reset --hard to the base setup commit', async () => {
            executor.push(ok('cid\n'));
            executor.push(ok());
            await mgr.create({ issueId: '15815_1' });

            executor.push(ok());
            await mgr.resetToBaseline();

            const call = executor.calls[2]!;
            const bashCmd = call.args[call.args.length - 1]!;
            expect(bashCmd).toContain('git reset --hard $BASE');
            expect(bashCmd).toContain('git clean -fd');
            expect(bashCmd).toContain('"base setup"');
        });
    });

    describe('destroy()', () => {
        it('should call docker rm -f', async () => {
            executor.push(ok('cid\n'));
            executor.push(ok());
            await mgr.create({ issueId: '1' });

            executor.push(ok());
            await mgr.destroy();

            const rmCall = executor.calls[2]!;
            expect(rmCall.args).toEqual(['docker', 'rm', '-f', 'cid']);
            expect(mgr.getId()).toBeNull();
        });

        it('should be idempotent (no-op when already destroyed)', async () => {
            executor.push(ok('cid\n'));
            executor.push(ok());
            await mgr.create({ issueId: '1' });

            executor.push(ok());
            await mgr.destroy();
            await mgr.destroy();

            // Only 3 calls: create + start + rm
            expect(executor.calls).toHaveLength(3);
        });
    });
});

// ---------------------------------------------------------------------------
// V2DockerExecStrategy
// ---------------------------------------------------------------------------

describe('V2DockerExecStrategy', () => {
    const strategy = new V2DockerExecStrategy('test-container-id');

    it('should produce a docker exec command for a basic command', () => {
        const core: Command = { args: ['bash', '-c', 'echo hello'] };
        const ctx: PrepareContext = { exercisePath: '/issues/12345_1' };

        const result = strategy.prepare(core, ctx);

        expect(result.command[0]).toBe('docker');
        expect(result.command[1]).toBe('exec');
        expect(result.command).toContain('test-container-id');
        expect(result.command).toContain('bash');
        expect(result.command).toContain('-c');
        // The inner bash -c content
        const bashArg = result.command[result.command.length - 1]!;
        expect(bashArg).toContain('echo hello');
    });

    it('should set ISSUE_ID from ctx.issueId', () => {
        const core: Command = { args: ['bash', '-c', 'run-test'] };
        const ctx: PrepareContext = {
            exercisePath: '/issues/12345_1',
            issueId: '99999_2',
        };

        const result = strategy.prepare(core, ctx);
        expect(result.command).toContain('-e');
        expect(result.command).toContain('ISSUE_ID=99999_2');
    });

    it('should fall back to basename of exercisePath when issueId is missing', () => {
        const core: Command = { args: ['bash', '-c', 'run-test'] };
        const ctx: PrepareContext = { exercisePath: '/some/path/48694_681' };

        const result = strategy.prepare(core, ctx);
        expect(result.command).toContain('ISSUE_ID=48694_681');
    });

    it('should prepend patch application when applyPatchPath is set', () => {
        const core: Command = { args: ['bash', '-c', 'run-agent'] };
        const ctx: PrepareContext = {
            exercisePath: '/issues/12345_1',
            applyPatchPath: '/patches/12345_1.patch',
        };

        const result = strategy.prepare(core, ctx);
        const bashArg = result.command[result.command.length - 1]!;
        expect(bashArg).toContain('git apply /patches/12345_1.patch');
        expect(bashArg).toContain('run-agent');
    });

    it('should append git diff when generatePatchPath is set', () => {
        const core: Command = { args: ['bash', '-c', 'run-agent'] };
        const ctx: PrepareContext = {
            exercisePath: '/issues/12345_1',
            generatePatchPath: '/patches/out.patch',
        };

        const result = strategy.prepare(core, ctx);
        const bashArg = result.command[result.command.length - 1]!;
        expect(bashArg).toContain('git diff > /patches/out.patch');
    });

    it('should expand PROMPT_PLACEHOLDER with cat from container path', () => {
        const core: Command = {
            args: ['codex', '-p', PROMPT_PLACEHOLDER, '--model', 'gpt-5.4-mini'],
            promptFileHostPath: '/host/.agent-prompts/12345_1.txt',
        };
        const ctx: PrepareContext = { exercisePath: '/issues/12345_1' };

        const result = strategy.prepare(core, ctx);
        const bashArg = result.command[result.command.length - 1]!;
        expect(bashArg).toContain('$(cat /tmp/ts-bench-agent-prompts/12345_1.txt)');
        expect(bashArg).not.toContain(PROMPT_PLACEHOLDER);
    });

    it('should expand -p flag with cat when promptFileHostPath is set', () => {
        const core: Command = {
            args: ['codex', '-p', 'some prompt text', '--model', 'gpt-5.4-mini'],
            promptFileHostPath: '/host/.agent-prompts/task.txt',
        };
        const ctx: PrepareContext = { exercisePath: '/issues/12345_1' };

        const result = strategy.prepare(core, ctx);
        const bashArg = result.command[result.command.length - 1]!;
        expect(bashArg).toContain('$(cat /tmp/ts-bench-agent-prompts/task.txt)');
    });

    it('should merge core.env into docker exec -e flags', () => {
        const core: Command = {
            args: ['bash', '-c', 'run'],
            env: { MY_VAR: 'value1', ANOTHER: 'value2' },
        };
        const ctx: PrepareContext = {
            exercisePath: '/issues/12345_1',
            issueId: '12345_1',
        };

        const result = strategy.prepare(core, ctx);
        expect(result.command).toContain('MY_VAR=value1');
        expect(result.command).toContain('ANOTHER=value2');
        expect(result.command).toContain('ISSUE_ID=12345_1');
    });

    it('should skip empty env values', () => {
        const core: Command = {
            args: ['bash', '-c', 'run'],
            env: { EMPTY: '' },
        };
        const ctx: PrepareContext = { exercisePath: '/issues/12345_1' };

        const result = strategy.prepare(core, ctx);
        const envEntries = result.command.filter(a => a.startsWith('EMPTY='));
        expect(envEntries).toHaveLength(0);
    });

    it('should handle both applyPatchPath and generatePatchPath together', () => {
        const core: Command = { args: ['bash', '-c', 'run-agent'] };
        const ctx: PrepareContext = {
            exercisePath: '/issues/12345_1',
            applyPatchPath: '/patches/input.patch',
            generatePatchPath: '/patches/output.patch',
        };

        const result = strategy.prepare(core, ctx);
        const bashArg = result.command[result.command.length - 1]!;
        expect(bashArg).toContain('git apply /patches/input.patch');
        expect(bashArg).toContain('git diff > /patches/output.patch');
        expect(bashArg).toContain('run-agent');
    });
});
