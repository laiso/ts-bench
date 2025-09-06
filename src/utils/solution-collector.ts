import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { TestResult } from '../config/types';

export interface SolutionInfo {
  exercise: string;
  solutionPath: string;
  success: boolean;
  error?: string;
}

export class SolutionCollector {
  constructor(private outputDir: string) {}

  collectSuccessfulSolutions(results: TestResult[]): SolutionInfo[] {
    const successfulResults = results.filter(r => r.overallSuccess);
    const solutions: SolutionInfo[] = [];

    for (const result of successfulResults) {
      const solutionPath = this.findSolutionFile(result.exercise);
      if (solutionPath) {
        solutions.push({
          exercise: result.exercise,
          solutionPath,
          success: true
        });
      }
    }

    return solutions;
  }

  collectAllSolutions(results: TestResult[]): SolutionInfo[] {
    const solutions: SolutionInfo[] = [];

    for (const result of results) {
      const solutionPath = this.findSolutionFile(result.exercise);
      if (solutionPath) {
        solutions.push({
          exercise: result.exercise,
          solutionPath,
          success: result.overallSuccess,
          error: result.overallSuccess ? undefined : (result.agentError || result.testError)
        });
      } else if (!result.overallSuccess) {
        // 失敗した場合でも、生成されたファイルがあれば収集
        const generatedPath = this.findGeneratedFile(result.exercise);
        if (generatedPath) {
          solutions.push({
            exercise: result.exercise,
            solutionPath: generatedPath,
            success: false,
            error: result.agentError || result.testError
          });
        }
      }
    }

    return solutions;
  }

  private findSolutionFile(exercise: string): string | null {
    // 複数の可能なパスをチェック
    const possiblePaths = [
      // 標準的な出力ディレクトリ構造
      join(this.outputDir, exercise, 'solution.ts'),
      join(this.outputDir, exercise, 'solution.js'),
      join(this.outputDir, exercise, 'index.ts'),
      join(this.outputDir, exercise, 'index.js'),
      
      // エージェント固有のディレクトリ構造
      join(this.outputDir, 'solutions', exercise, 'solution.ts'),
      join(this.outputDir, 'solutions', exercise, 'solution.js'),
      join(this.outputDir, 'solutions', exercise, 'index.ts'),
      join(this.outputDir, 'solutions', exercise, 'index.js'),
      
      // 一時ディレクトリ構造
      join(this.outputDir, 'temp', exercise, 'solution.ts'),
      join(this.outputDir, 'temp', exercise, 'solution.js'),
    ];

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    // ディレクトリ内を再帰的に検索
    const exerciseDir = join(this.outputDir, exercise);
    if (existsSync(exerciseDir)) {
      const foundFile = this.searchRecursively(exerciseDir, ['solution.ts', 'solution.js', 'index.ts', 'index.js']);
      if (foundFile) {
        return foundFile;
      }
    }

    console.warn(`Solution file not found for exercise: ${exercise}`);
    return null;
  }

  private searchRecursively(dir: string, targetFiles: string[]): string | null {
    try {
      const items = readdirSync(dir);
      
      for (const item of items) {
        const fullPath = join(dir, item);
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
          const found = this.searchRecursively(fullPath, targetFiles);
          if (found) {
            return found;
          }
        } else if (stat.isFile() && targetFiles.includes(item)) {
          return fullPath;
        }
      }
    } catch (error) {
      // ディレクトリが読み取れない場合は無視
    }
    
    return null;
  }

  private findGeneratedFile(exercise: string): string | null {
    // 失敗した場合の生成ファイルを探す
    const possiblePaths = [
      // エージェントが生成したファイル
      join(this.outputDir, exercise, 'generated.ts'),
      join(this.outputDir, exercise, 'generated.js'),
      join(this.outputDir, exercise, 'attempt.ts'),
      join(this.outputDir, exercise, 'attempt.js'),
      join(this.outputDir, exercise, 'output.ts'),
      join(this.outputDir, exercise, 'output.js'),
      
      // 一時ファイル
      join(this.outputDir, 'temp', exercise, 'generated.ts'),
      join(this.outputDir, 'temp', exercise, 'generated.js'),
      join(this.outputDir, 'temp', exercise, 'attempt.ts'),
      join(this.outputDir, 'temp', exercise, 'attempt.js'),
    ];

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    return null;
  }

  async collectAllSolutionsFromDir(outputDir: string): Promise<SolutionInfo[]> {
    const solutions: SolutionInfo[] = [];
    
    if (!existsSync(outputDir)) {
      return solutions;
    }

    const items = readdirSync(outputDir);
    
    for (const item of items) {
      const fullPath = join(outputDir, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        const solutionFile = this.findSolutionFile(item);
        if (solutionFile) {
          solutions.push({
            exercise: item,
            solutionPath: solutionFile,
            success: true // ディレクトリから収集する場合は成功と仮定
          });
        }
      }
    }
    
    return solutions;
  }
}
