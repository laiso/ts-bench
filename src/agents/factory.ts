import type { BenchmarkConfig } from '../config/types';
import type { AgentBuilder } from './types';
import { AGENT_REGISTRY } from './registry';
import { GenericAgentBuilder } from './builders/generic';

export class AgentFactory {
    static create(
        config: BenchmarkConfig,
        containerName: string,
        agentScriptPath: string,
        exercise?: string
    ): AgentBuilder {
        const agentConfig = {
            model: config.model,
            provider: config.provider,
            containerName,
            agentScriptPath,
            useDocker: config.useDocker,
            dataset: config.dataset,
            exercise
        };

        const definition = AGENT_REGISTRY[config.agent as keyof typeof AGENT_REGISTRY];
        if (!definition) {
            throw new Error(`Unknown agent: ${config.agent}`);
        }
        return new GenericAgentBuilder(agentConfig, definition);
    }
}
