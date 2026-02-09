import { BunCommandExecutor } from './shell';
import type { Logger } from './logger';

export interface CleanupStats {
  removedCount: number;
  failedCount: number;
  errors: string[];
}

export class DockerCleanupManager {
  private executor: BunCommandExecutor;

  constructor(private logger: Logger) {
    this.executor = new BunCommandExecutor();
  }

  /**
   * 実行前: SWE-Lancer コンテナを全削除
   * 対象: swelancer/swelancer_x86_monolith:releasev1
   */
  async cleanupBefore(): Promise<CleanupStats> {
    return this.removeContainersByImage(
      'swelancer/swelancer_x86_monolith:releasev1'
    );
  }

  /**
   * 実行後（エラー時）: 特定コンテナを強制削除
   */
  async cleanupAfterError(containerNameOrId: string): Promise<boolean> {
    try {
      const result = await this.executor.execute(
        ['docker', 'rm', '-f', containerNameOrId]
      );

      if (result.exitCode === 0) {
        this.logger.info(
          `✅ Container cleanup successful: ${containerNameOrId}`
        );
        return true;
      } else {
        this.logger.info(
          `⚠️ Container cleanup failed: ${result.stderr}`
        );
        return false;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.info(`❌ Container cleanup error: ${msg}`);
      return false;
    }
  }

  /**
   * 実行中のコンテナリスト取得
   */
  async getRunningContainers(): Promise<string[]> {
    try {
      const result = await this.executor.execute([
        'docker', 'ps',
        '--filter', 'ancestor=swelancer/swelancer_x86_monolith:releasev1',
        '-q'
      ]);

      if (result.exitCode !== 0) {
        this.logger.info(`⚠️ Failed to list running containers: ${result.stderr}`);
        return [];
      }

      return result.stdout
        .trim()
        .split('\n')
        .filter(id => id.length > 0);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.info(`❌ Error getting container list: ${msg}`);
      return [];
    }
  }

  /**
   * イメージ名からコンテナ一覧を取得して削除
   */
  private async removeContainersByImage(
    imageName: string
  ): Promise<CleanupStats> {
    const stats: CleanupStats = {
      removedCount: 0,
      failedCount: 0,
      errors: []
    };

    try {
      // コンテナ一覧取得: docker ps -a --filter ancestor=imageName -q
      const listResult = await this.executor.execute([
        'docker', 'ps', '-a',
        '--filter', `ancestor=${imageName}`,
        '-q'
      ]);

      if (listResult.exitCode !== 0) {
        const msg = `Failed to list containers: ${listResult.stderr}`;
        stats.errors.push(msg);
        this.logger.info(`⚠️ ${msg}`);
        return stats;
      }

      const containerIds = listResult.stdout
        .trim()
        .split('\n')
        .filter(id => id.length > 0);

      if (containerIds.length === 0) {
        this.logger.info(`✅ No stale containers found for ${imageName}`);
        return stats;
      }

      this.logger.info(
        `🧹 Found ${containerIds.length} stale containers, removing...`
      );

      // 一括削除: docker rm -f container1 container2 ...
      for (const containerId of containerIds) {
        const rmResult = await this.executor.execute(
          ['docker', 'rm', '-f', containerId]
        );

        if (rmResult.exitCode === 0) {
          stats.removedCount++;
          this.logger.info(`✅ Removed container: ${containerId.slice(0, 12)}`);
        } else {
          stats.failedCount++;
          const error = `Failed to remove ${containerId}: ${rmResult.stderr}`;
          stats.errors.push(error);
          this.logger.info(`⚠️ ${error}`);
        }
      }

      if (stats.removedCount > 0) {
        this.logger.info(
          `✅ Cleanup complete: ${stats.removedCount} removed, ` +
          `${stats.failedCount} failed`
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      stats.errors.push(msg);
      this.logger.info(`❌ Cleanup error: ${msg}`);
    }

    return stats;
  }
}
