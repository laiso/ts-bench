import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const execAsync = promisify(exec);

export interface SubmoduleConfig {
  submodulePath: string;
  remoteUrl: string;
  githubToken: string;
  runId: string;
  agent: string;
  model: string;
  includeAllSolutions?: boolean; // すべての回答（成功・失敗）を含めるかどうか
}

export interface PushResult {
  success: boolean;
  branchName: string;
  compareUrl: string;
  error?: string;
}

export class SubmoduleManager {
  private config: SubmoduleConfig;

  constructor(config: SubmoduleConfig) {
    this.config = config;
  }

  async pushResults(solutions: Array<{ exercise: string; solutionPath: string; success: boolean; error?: string }>): Promise<PushResult> {
    try {
      const branchName = this.generateBranchName();
      
      // サブモジュールディレクトリに移動してブランチを作成
      await this.createBranch(branchName);
      
      // 解答をコピー
      await this.copySolutions(solutions);
      
      // 変更をコミット
      await this.commitChanges(branchName);
      
      // リモートにプッシュ
      await this.pushToRemote(branchName);
      
      const compareUrl = this.generateCompareUrl(branchName);
      
      return {
        success: true,
        branchName,
        compareUrl
      };
    } catch (error) {
      return {
        success: false,
        branchName: '',
        compareUrl: '',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private generateBranchName(): string {
    const { agent, model, runId } = this.config;
    return `results/${agent}-${model}/${runId}`;
  }

  private async createBranch(branchName: string): Promise<void> {
    const { submodulePath } = this.config;
    
    // サブモジュールディレクトリに移動
    process.chdir(submodulePath);
    
    // 最新のmainブランチを取得
    await execAsync('git fetch origin main');
    await execAsync('git checkout main');
    await execAsync('git pull origin main');
    
    // 新しいブランチを作成
    await execAsync(`git checkout -b ${branchName}`);
  }

  private async copySolutions(solutions: Array<{ exercise: string; solutionPath: string; success: boolean; error?: string }>): Promise<void> {
    for (const solution of solutions) {
      const { exercise, solutionPath, success, error } = solution;
      const targetDir = join(this.config.submodulePath, 'exercises', 'practice', exercise);
      
      if (!existsSync(targetDir)) {
        throw new Error(`Exercise directory not found: ${targetDir}`);
      }
      
      // 解答ファイルをコピー
      if (existsSync(solutionPath)) {
        let fileName: string;
        let subDir: string;
        
        if (success) {
          // 成功した回答は通常のsolution.tsとして保存
          fileName = 'solution.ts';
          subDir = '';
        } else {
          // 失敗した回答は別ディレクトリに保存
          fileName = 'attempt.ts';
          subDir = 'failed-attempts';
        }
        
        const targetPath = subDir 
          ? join(targetDir, subDir, fileName)
          : join(targetDir, fileName);
        
        // サブディレクトリを作成（必要に応じて）
        if (subDir) {
          const subDirPath = join(targetDir, subDir);
          if (!existsSync(subDirPath)) {
            mkdirSync(subDirPath, { recursive: true });
          }
        }
        
        copyFileSync(solutionPath, targetPath);
        
        // 失敗した場合はエラー情報も保存
        if (!success && error) {
          const errorPath = subDir 
            ? join(targetDir, subDir, 'error.txt')
            : join(targetDir, 'error.txt');
          const { writeFile } = await import('fs/promises');
          await writeFile(errorPath, error, 'utf-8');
        }
        
        console.log(`Copied ${success ? 'successful' : 'failed'} solution for ${exercise} to ${targetPath}`);
      }
    }
  }

  private async commitChanges(branchName: string): Promise<void> {
    const { agent, model, runId, includeAllSolutions } = this.config;
    
    // Git設定
    await execAsync('git config user.email "github-actions[bot]@users.noreply.github.com"');
    await execAsync('git config user.name "github-actions[bot]"');
    
    // 変更をステージング
    await execAsync('git add .');
    
    // コミット
    const solutionType = includeAllSolutions ? 'all solutions (successful and failed)' : 'successful solutions';
    const commitMessage = `feat(results): Add ${solutionType} from ${agent}/${model} (Run ${runId})`;
    await execAsync(`git commit -m "${commitMessage}"`);
  }

  private async pushToRemote(branchName: string): Promise<void> {
    const { remoteUrl, githubToken } = this.config;
    
    // 認証付きURLを使用
    const authUrl = remoteUrl.replace('https://', `https://${githubToken}@`);
    
    await execAsync(`git push ${authUrl} ${branchName}`);
  }

  private generateCompareUrl(branchName: string): string {
    const { remoteUrl } = this.config;
    const repoName = remoteUrl.split('/').slice(-2).join('/').replace('.git', '');
    return `https://github.com/${repoName}/compare/main...${branchName}`;
  }

  async cleanupOldBranches(daysOld: number = 90): Promise<void> {
    const { submodulePath } = this.config;
    
    process.chdir(submodulePath);
    
    // 古いブランチを取得
    const { stdout } = await execAsync('git for-each-ref --format="%(refname:short) %(committerdate)" refs/remotes/origin/results/');
    const branches = stdout.trim().split('\n').filter(line => line.trim());
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    for (const branchInfo of branches) {
      const [branchName, dateStr] = branchInfo.split(' ');
      if (!dateStr) continue;
      const branchDate = new Date(dateStr);
      
      if (branchDate < cutoffDate) {
        try {
          await execAsync(`git push origin --delete ${branchName}`);
          console.log(`Deleted old branch: ${branchName}`);
        } catch (error) {
          console.warn(`Failed to delete branch ${branchName}:`, error);
        }
      }
    }
  }
}
