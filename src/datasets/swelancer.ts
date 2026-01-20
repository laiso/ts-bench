import { readFile } from 'fs/promises';
import { join } from 'path';
import { parse } from 'csv-parse/sync';
import type { DatasetReader, TaskFiles } from './types';
import { SWELANCER_DATA_PATH } from '../config/constants';

interface SweLancerTask {
    question_id: string;
    variant: string;
    price: string;
    price_limit: string;
    manager_data: string;
    manager_commit: string;
    acceptable_folders: string;
    cwd: string;
    set: string;
    title: string;
    description: string;
    proposals: string;
}

export class SweLancerDataset implements DatasetReader {
    private tasksCache: SweLancerTask[] | null = null;
    private csvPath = join(process.cwd(), SWELANCER_DATA_PATH);

    private async loadTasks(): Promise<SweLancerTask[]> {
        if (this.tasksCache) return this.tasksCache;

        try {
            const content = await readFile(this.csvPath, 'utf-8');
            const records = parse(content, {
                columns: true,
                skip_empty_lines: true
            }) as SweLancerTask[];

            // Filter for IC tasks
            this.tasksCache = records.filter(task => task.variant === 'ic_swe');
            return this.tasksCache;
        } catch (error) {
            console.error(`Error loading SWE-Lancer tasks from ${this.csvPath}:`, error);
            return [];
        }
    }

    async getTasks(): Promise<string[]> {
        const tasks = await this.loadTasks();
        return tasks.map(t => t.question_id);
    }

    async getTaskFiles(taskId: string): Promise<TaskFiles> {
        // SWE-Lancer tasks are in a complex repo structure.
        // For the purpose of the agent knowing which files it *can* edit, 
        // we might return nothing and let the agent rely on `find` tools.
        return {
            sourceFiles: [],
            testFiles: []
        };
    }

    async getTestFiles(taskId: string): Promise<string[]> {
        return [];
    }

    async getTaskMetadata(taskId: string): Promise<{ commitId?: string; title?: string }> {
        const tasks = await this.loadTasks();
        const task = tasks.find(t => t.question_id === taskId);

        // Read commit_id.txt
        let commitId: string | undefined;
        try {
            const commitIdPath = join(process.cwd(), 'repos/frontier-evals/project/swelancer/issues', taskId, 'commit_id.txt');
            const content = await readFile(commitIdPath, 'utf-8');
            commitId = content.trim();
        } catch (e) {
            console.warn(`Could not read commit_id.txt for ${taskId}`);
        }

        return {
            commitId,
            title: task?.title
        };
    }

    async getInstructions(taskId: string, baseInstruction: string, customInstruction?: string): Promise<string> {
        const tasks = await this.loadTasks();
        const task = tasks.find(t => t.question_id === taskId);
        if (!task) throw new Error(`Task ${taskId} not found`);

        let instructions = `${baseInstruction}\n\n`;
        instructions += `# Task: ${task.title}\n\n`;
        instructions += `## Description\n${task.description}\n\n`;
        instructions += `## Goal\nFix the bug described above. The codebase is the Expensify App (React Native).\n`;
        instructions += `You should explore the codebase to identify the issue. The current working directory is the root of the app.\n`;

        if (customInstruction) {
            instructions += `\n\n${customInstruction}`;
        }

        return instructions;
    }
}