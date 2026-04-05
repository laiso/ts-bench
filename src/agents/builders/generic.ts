import { BaseAgentBuilder } from '../base';
import type { AgentBuilder, AgentConfig, FileList } from '../types';
import type { AgentDefinition } from '../registry';

export class GenericAgentBuilder extends BaseAgentBuilder implements AgentBuilder {
    constructor(agentConfig: AgentConfig, private readonly definition: AgentDefinition) {
        super(agentConfig);
    }

    protected getEnvironmentVariables(): Record<string, string> {
        return this.definition.getEnv(this.config);
    }

    protected getCoreArgs(instructions: string, fileList?: FileList): string[] {
        return this.definition.buildArgs(this.config, instructions, fileList);
    }
}
