import type { ExecutionStrategy, Command, PrepareContext, PreparedCommand } from './types';
import { SWELANCER_REPO_PATH } from '../config/constants';
import { homedir } from 'os';
import { join } from 'path';

export class LocalExecutionStrategy implements ExecutionStrategy {
  prepare(core: Command, ctx: PrepareContext): PreparedCommand {
    let cwd = `${process.cwd()}/${ctx.exercisePath}`;
    let command = core.args;

    if (ctx.datasetType === 'v2') {
        const expandedRepoPath = SWELANCER_REPO_PATH.startsWith('~') 
            ? SWELANCER_REPO_PATH.replace(/^~/, homedir())
            : join(process.cwd(), SWELANCER_REPO_PATH);
        cwd = expandedRepoPath;

        // In Local V2, we need to handle the git setup manually.
        // We wrap the command in a shell to chain git operations.
        
        // Setup: For ic_swe, we need to find the commit/patch for the issue.
        // For simplicity, we assume the environment is already prepared or we do a basic reset.
        // Ideally we'd run a subset of setup_expensify.yml logic here.
        const setupCmd = ctx.commitId ? `git reset --hard ${ctx.commitId} && ` : '';
        const patchCmd = ctx.applyPatchPath ? `git apply ${ctx.applyPatchPath} && ` : '';
        
        let postCmd = '';
        if (ctx.generatePatchPath) {
            postCmd = `; RES=$?; git diff > ${ctx.generatePatchPath}; exit $RES`;
        }

        // Wrap the original command in bash -c
        // We join the original core.args with spaces, escaping if necessary.
        // For simplicity we assume simple args for now.
        const originalCmd = core.args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ');
        
        command = [
            'bash', '-c',
            `${setupCmd}${patchCmd}${originalCmd}${postCmd}`
        ];
    }

    return {
      command,
      options: {
        cwd,
        env: core.env ? { ...core.env } : undefined
      }
    };
  }
}

