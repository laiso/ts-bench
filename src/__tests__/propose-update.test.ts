import { describe, expect, it, spyOn } from 'bun:test';
import { runProposeUpdate } from '../index';
import type { spawnSync as SpawnSyncFn } from 'child_process';

type SpawnSyncResult = ReturnType<typeof SpawnSyncFn>;

function makeSpawnSync(
    overrides: Record<string, { status: number }> = {}
): { fn: typeof SpawnSyncFn; calls: Array<{ cmd: string; args: string[] }> } {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const fn = (cmd: string, args: string[]) => {
        calls.push({ cmd, args });
        if (cmd === 'bun' && overrides['bun']) return overrides['bun'] as SpawnSyncResult;
        if (cmd === 'git' && args[0] === 'diff' && overrides['git-diff']) return overrides['git-diff'] as SpawnSyncResult;
        if (cmd === 'gh' && overrides['gh']) return overrides['gh'] as SpawnSyncResult;
        if (cmd === 'git' && args[0] === 'checkout' && overrides['git-checkout']) return overrides['git-checkout'] as SpawnSyncResult;
        if (cmd === 'git' && args[0] === 'commit' && overrides['git-commit']) return overrides['git-commit'] as SpawnSyncResult;
        if (cmd === 'git' && args[0] === 'push' && overrides['git-push']) return overrides['git-push'] as SpawnSyncResult;
        return { status: 0 } as SpawnSyncResult;
    };
    return { fn: fn as unknown as typeof SpawnSyncFn, calls };
}

const noopReadFileSync = (_p: string, _enc: BufferEncoding) => '';
const noopWriteFileSync = () => {};
const noopExistsSync = () => false;

describe('runProposeUpdate', () => {
    it('exits early when update-leaderboard.ts fails', async () => {
        const { fn: spawnSync } = makeSpawnSync({ bun: { status: 1 } });
        const errorOutput: string[] = [];
        const consoleSpy = spyOn(console, 'error').mockImplementation((msg: string) => { errorOutput.push(msg); });
        let exitCode: number | undefined;
        const exitSpy = spyOn(process, 'exit').mockImplementation((code?: number) => {
            exitCode = code;
            throw new Error(`process.exit(${code})`);
        });

        await expect(
            runProposeUpdate('/tmp/result.json', 'local', { spawnSync, existsSync: noopExistsSync, readFileSync: noopReadFileSync, writeFileSync: noopWriteFileSync })
        ).rejects.toThrow('process.exit');

        expect(exitCode).toBe(1);
        expect(errorOutput.some(m => m.includes('update-leaderboard.ts failed'))).toBe(true);

        consoleSpy.mockRestore();
        exitSpy.mockRestore();
    });

    it('prints "No changes to commit." and returns when git diff has no changes', async () => {
        const { fn: spawnSync, calls } = makeSpawnSync({ 'git-diff': { status: 0 } });
        const logOutput: string[] = [];
        const logSpy = spyOn(console, 'log').mockImplementation((msg: string) => { logOutput.push(msg); });

        await runProposeUpdate('/tmp/result.json', 'local', { spawnSync, existsSync: noopExistsSync, readFileSync: noopReadFileSync, writeFileSync: noopWriteFileSync });

        expect(logOutput.some(m => m.includes('No changes to commit.'))).toBe(true);
        const commitCalls = calls.filter(c => c.cmd === 'git' && c.args[0] === 'commit');
        expect(commitCalls.length).toBe(0);

        logSpy.mockRestore();
    });

    it('runs full flow: update-leaderboard, git add, commit, push, pr create', async () => {
        const { fn: spawnSync, calls } = makeSpawnSync({ 'git-diff': { status: 1 } });
        const writtenFiles: Record<string, string> = {};
        spyOn(console, 'log').mockImplementation(() => {});

        await runProposeUpdate('/tmp/result.json', 'local', {
            spawnSync,
            existsSync: noopExistsSync,
            readFileSync: noopReadFileSync,
            writeFileSync: (p: string, content: string) => { writtenFiles[p] = content; },
        });

        const cmds = calls.map(c => `${c.cmd} ${c.args.join(' ')}`);
        expect(cmds.some(c => c.includes('bun') && c.includes('update-leaderboard.ts'))).toBe(true);
        expect(cmds.some(c => c.includes('git add public/data/results/'))).toBe(true);
        expect(cmds.some(c => c.includes('git commit'))).toBe(true);
        expect(cmds.some(c => c.includes('git push'))).toBe(true);
        expect(cmds.some(c => c.includes('gh pr create'))).toBe(true);
    });

    it('uses provided sourceLabel in commit title when no pr-title.txt', async () => {
        let prCreateArgs: string[] = [];
        const { fn: baseSpawnSync } = makeSpawnSync({ 'git-diff': { status: 1 } });
        const spawnSync = ((cmd: string, args: string[]) => {
            if (cmd === 'gh' && args[0] === 'pr') prCreateArgs = args;
            return (baseSpawnSync as Function)(cmd, args);
        }) as unknown as typeof SpawnSyncFn;

        spyOn(console, 'log').mockImplementation(() => {});

        await runProposeUpdate('/tmp/result.json', 'my-runner', {
            spawnSync,
            existsSync: noopExistsSync,
            readFileSync: noopReadFileSync,
            writeFileSync: noopWriteFileSync,
        });

        const titleIdx = prCreateArgs.indexOf('--title');
        expect(titleIdx).toBeGreaterThan(-1);
        expect(prCreateArgs[titleIdx + 1]).toContain('my-runner');
    });

    it('uses pr-title.txt content when it exists and is non-empty', async () => {
        let prCreateArgs: string[] = [];
        let writtenMsgContent = '';
        const { fn: baseSpawnSync } = makeSpawnSync({ 'git-diff': { status: 1 } });
        const spawnSync = ((cmd: string, args: string[]) => {
            if (cmd === 'gh' && args[0] === 'pr') prCreateArgs = args;
            return (baseSpawnSync as Function)(cmd, args);
        }) as unknown as typeof SpawnSyncFn;

        spyOn(console, 'log').mockImplementation(() => {});

        await runProposeUpdate('/tmp/result.json', 'local', {
            spawnSync,
            existsSync: (p: string) => p === 'pr-title.txt',
            readFileSync: (_p: string) => 'feat(leaderboard): Custom PR Title',
            writeFileSync: (_p: string, content: string) => { writtenMsgContent = content; },
        });

        const titleIdx = prCreateArgs.indexOf('--title');
        expect(prCreateArgs[titleIdx + 1]).toBe('feat(leaderboard): Custom PR Title');
        expect(writtenMsgContent).toContain('feat(leaderboard): Custom PR Title');
    });

    it('uses --body-file commit-body.md when file exists', async () => {
        let prCreateArgs: string[] = [];
        const { fn: baseSpawnSync } = makeSpawnSync({ 'git-diff': { status: 1 } });
        const spawnSync = ((cmd: string, args: string[]) => {
            if (cmd === 'gh' && args[0] === 'pr') prCreateArgs = args;
            return (baseSpawnSync as Function)(cmd, args);
        }) as unknown as typeof SpawnSyncFn;

        spyOn(console, 'log').mockImplementation(() => {});

        await runProposeUpdate('/tmp/result.json', 'local', {
            spawnSync,
            existsSync: (p: string) => p === 'commit-body.md',
            readFileSync: noopReadFileSync,
            writeFileSync: noopWriteFileSync,
        });

        expect(prCreateArgs).toContain('--body-file');
        expect(prCreateArgs).toContain('commit-body.md');
    });

    it('falls back to --body "" when commit-body.md does not exist', async () => {
        let prCreateArgs: string[] = [];
        const { fn: baseSpawnSync } = makeSpawnSync({ 'git-diff': { status: 1 } });
        const spawnSync = ((cmd: string, args: string[]) => {
            if (cmd === 'gh' && args[0] === 'pr') prCreateArgs = args;
            return (baseSpawnSync as Function)(cmd, args);
        }) as unknown as typeof SpawnSyncFn;

        spyOn(console, 'log').mockImplementation(() => {});

        await runProposeUpdate('/tmp/result.json', 'local', {
            spawnSync,
            existsSync: noopExistsSync,
            readFileSync: noopReadFileSync,
            writeFileSync: noopWriteFileSync,
        });

        expect(prCreateArgs).toContain('--body');
        expect(prCreateArgs).not.toContain('--body-file');
    });
});
