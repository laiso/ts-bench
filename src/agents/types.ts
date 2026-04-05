import type { Command } from '../execution/types';
import type { DatasetType } from '../config/base-types';

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
    dataset?: DatasetType;
    /** Current task id (e.g. v2 issue id); used for stable temp paths */
    exercise?: string;
}
