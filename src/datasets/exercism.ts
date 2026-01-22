import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import type { DatasetReader, TaskFiles } from './types';

export class ExercismDataset implements DatasetReader {
    constructor(private basePath: string) { }

    async getTasks(): Promise<string[]> {
        const practiceDir = join(process.cwd(), this.basePath, 'exercises', 'practice');
        try {
            const entries = await readdir(practiceDir, { withFileTypes: true });
            return entries
                .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
                .map(entry => entry.name)
                .sort();
        } catch (error) {
            console.error(`Error reading directory ${practiceDir}:`, error);
            return [];
        }
    }

    async getTaskFiles(taskId: string): Promise<TaskFiles> {
        try {
            const exerciseDir = join(process.cwd(), this.basePath, 'exercises', 'practice', taskId);
            const entries = await readdir(exerciseDir);

            // Generic test file patterns
            const testPatterns = [
                /\.test\./,     // .test.js, .test.ts, .test.py, etc.
                /_test\./,      // _test.js, _test.py, etc.
                /\.spec\./,     // .spec.js, .spec.ts, etc.
                /_spec\./,      // _spec.js, _spec.py, etc.
                /test_.*\.py$/, // test_*.py (Python)
                /.*_test\.py$/, // *_test.py (Python)
                /.*Test\./,     // *Test.java (Java)
                /Test.*\./,     // Test*.java (Java)
            ];

            // Implementation file patterns (TypeScript focused)
            const sourcePatterns = [
                /\.ts$/,
                /\.js$/,
                /\.jsx$/,
                /\.tsx$/,
            ];

            const testFiles = entries.filter(file =>
                testPatterns.some(pattern => pattern.test(file))
            );

            const sourceFiles = entries.filter(file =>
                sourcePatterns.some(pattern => pattern.test(file)) &&
                !testPatterns.some(pattern => pattern.test(file))
            );

            return { sourceFiles, testFiles };
        } catch (error) {
            console.warn(`Warning: Could not read files from ${taskId}`);
            return { sourceFiles: [], testFiles: [] };
        }
    }

    async getTestFiles(taskId: string): Promise<string[]> {
        const { testFiles } = await this.getTaskFiles(taskId);
        return testFiles;
    }

    async getTaskMetadata(taskId: string): Promise<{ commitId?: string; title?: string }> {
        return { title: taskId };
    }

    async getInstructions(taskId: string, baseInstruction: string, customInstruction?: string): Promise<string> {
        try {
            const environment = await readFile(join(process.cwd(), this.basePath, "CLAUDE.md"), "utf-8");
            const instructionsPath = join(process.cwd(), this.basePath, 'exercises', 'practice', taskId, '.docs', 'instructions.md');
            const exerciseInstructions = await readFile(instructionsPath, 'utf-8');

            let fullInstructions = `${baseInstruction}\n\n${exerciseInstructions}\n\n${environment}`;

            if (customInstruction) {
                fullInstructions += `\n\n${customInstruction}`;
            }

            return fullInstructions;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to read exercise instructions for ${taskId}: ${errorMsg}`);
        }
    }
}