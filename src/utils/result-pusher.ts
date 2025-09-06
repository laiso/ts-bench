import { SubmoduleManager, type SubmoduleConfig, type PushResult } from './submodule-manager';
import { SolutionCollector, type SolutionInfo } from './solution-collector';
import type { TestResult, BenchmarkConfig } from '../config/types';

export interface PushConfig {
  pushResults: boolean;
  githubToken?: string;
  runId: string;
  outputDir: string;
}

export interface PushSummary {
  success: boolean;
  pushedCount: number;
  totalCount: number;
  successfulCount: number;
  failedCount: number;
  branchName?: string;
  compareUrl?: string;
  error?: string;
}

export class ResultPusher {
  private submoduleManager: SubmoduleManager;
  private solutionCollector: SolutionCollector;

  constructor(
    private config: BenchmarkConfig,
    private pushConfig: PushConfig
  ) {
    const submoduleConfig: SubmoduleConfig = {
      submodulePath: './exercism-typescript',
      remoteUrl: 'https://github.com/laiso/exercism-typescript.git',
      githubToken: pushConfig.githubToken || '',
      runId: pushConfig.runId,
      agent: config.agent,
      model: config.model,
      includeAllSolutions: true // 常に全ての回答を含める
    };

    this.submoduleManager = new SubmoduleManager(submoduleConfig);
    this.solutionCollector = new SolutionCollector(pushConfig.outputDir);
  }

  async pushResults(results: TestResult[]): Promise<PushSummary> {
    if (!this.pushConfig.pushResults) {
      return {
        success: true,
        pushedCount: 0,
        totalCount: results.length,
        successfulCount: 0,
        failedCount: 0,
        error: 'Push results is disabled'
      };
    }

    if (!this.pushConfig.githubToken) {
      return {
        success: false,
        pushedCount: 0,
        totalCount: results.length,
        successfulCount: 0,
        failedCount: 0,
        error: 'GitHub token is required for pushing results'
      };
    }

    try {
      // 全ての解答を収集（成功・失敗問わず）
      const solutions = this.solutionCollector.collectAllSolutions(results);
      
      if (solutions.length === 0) {
        return {
          success: true,
          pushedCount: 0,
          totalCount: results.length,
          successfulCount: 0,
          failedCount: 0,
          error: 'No solutions found to push'
        };
      }

      // 成功・失敗の数を計算
      const successfulCount = solutions.filter(s => s.success).length;
      const failedCount = solutions.filter(s => !s.success).length;

      // サブモジュールにプッシュ
      const pushResult = await this.submoduleManager.pushResults(solutions);

      if (pushResult.success) {
        const solutionType = `${successfulCount} successful + ${failedCount} failed solutions`;
        console.log(`✅ Successfully pushed ${solutionType} to branch: ${pushResult.branchName}`);
        console.log(`🔗 Compare URL: ${pushResult.compareUrl}`);
        
        return {
          success: true,
          pushedCount: solutions.length,
          totalCount: results.length,
          successfulCount,
          failedCount,
          branchName: pushResult.branchName,
          compareUrl: pushResult.compareUrl
        };
      } else {
        return {
          success: false,
          pushedCount: 0,
          totalCount: results.length,
          successfulCount: 0,
          failedCount: 0,
          error: pushResult.error
        };
      }
    } catch (error) {
      return {
        success: false,
        pushedCount: 0,
        totalCount: results.length,
        successfulCount: 0,
        failedCount: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async cleanupOldBranches(daysOld: number = 90): Promise<void> {
    if (!this.pushConfig.githubToken) {
      console.warn('GitHub token is required for cleanup');
      return;
    }

    try {
      await this.submoduleManager.cleanupOldBranches(daysOld);
      console.log(`✅ Cleaned up branches older than ${daysOld} days`);
    } catch (error) {
      console.error('Failed to cleanup old branches:', error);
    }
  }

  generateSummaryMarkdown(summary: PushSummary): string {
    if (!summary.success || !summary.compareUrl) {
      return '';
    }

    const solutionDetails = summary.failedCount > 0 
      ? `- 成功: ${summary.successfulCount}件、失敗: ${summary.failedCount}件`
      : `- 成功: ${summary.successfulCount}件`;

    return `
### 成果物の比較

生成されたコードの差分は、以下のリンクから確認できます。

- **[Compare Changes](${summary.compareUrl})**
- プッシュされた解答数: ${summary.pushedCount}/${summary.totalCount}
${solutionDetails}
- ブランチ名: \`${summary.branchName}\`

**注意**: 失敗した回答は \`failed-attempts/\` ディレクトリに保存されています。
`;
  }
}
