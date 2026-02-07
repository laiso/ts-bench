import type { Command } from '../execution/types';

export interface AgentBuilder {
    buildCommand(instructions: string, fileList?: FileList): Promise<Command>;
}

export interface FileList {
    sourceFiles: string[];
    testFiles: string[];
}

export interface AgentConfig {
    model: string;
    provider?: string;
    containerName: string;
    agentScriptPath: string;
    useDocker?: boolean;
}
