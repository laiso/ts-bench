export interface TaskFile {
    path: string;
    content?: string;
}

export interface TaskFiles {
    sourceFiles: string[];
    testFiles: string[];
}

export interface DatasetReader {
    /**
     * Get a list of all available task IDs/names
     */
    getTasks(): Promise<string[]>;

    /**
     * Get the list of source and test files for a specific task
     */
    getTaskFiles(taskId: string): Promise<TaskFiles>;

    /**
     * Get just the list of test files for a specific task
     */
    getTestFiles(taskId: string): Promise<string[]>;

    /**
     * Get metadata for a specific task (e.g. commit hash)
     */
    getTaskMetadata(taskId: string): Promise<{ commitId?: string; title?: string }>;

    /**
     * Get commit IDs for multiple tasks at once (for grouping).
     * Returns a map of taskId → commitId.  Tasks whose commit cannot be
     * determined are omitted from the map.
     */
    getCommitIds?(taskIds: string[]): Promise<Map<string, string>>;

    /**
     * Get the formatted instructions for a specific task
     */
    getInstructions(taskId: string, baseInstruction: string, customInstruction?: string): Promise<string>;
}
