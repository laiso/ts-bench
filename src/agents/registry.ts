import type { ProviderType } from '../config/base-types';
import type { AgentConfig, FileList } from './types';
import { loadAgentRegistryFromDir, createAgentDefinitionFromSchema, loadAgentSchemaFromFile } from './loader';
import type { InstallConfig } from './schema';

export type { InstallConfig };

export interface AgentDefinition {
    /** Default provider for this agent */
    defaultProvider: ProviderType;
    /** CLI installation configuration (used by run-agent.sh) */
    install: InstallConfig;
    /** Resolve environment variables required by this agent */
    getEnv(config: AgentConfig): Record<string, string>;
    /** Build CLI args array (starting with 'bash', agentScriptPath, ...) */
    buildArgs(config: AgentConfig, instructions: string, fileList?: FileList): string[];
}

/**
 * Dynamic Agent Registry loaded from `config/agents/*.yaml` (and custom configs)
 */
export const AGENT_REGISTRY: Record<string, AgentDefinition> = loadAgentRegistryFromDir();

export type AgentType = string;

export function registerAgentFromFile(filePath: string): string {
    const schema = loadAgentSchemaFromFile(filePath);
    AGENT_REGISTRY[schema.name] = createAgentDefinitionFromSchema(schema);
    return schema.name;
}

export function getAgentDefaultProvider(agent: string): ProviderType | undefined {
    return AGENT_REGISTRY[agent]?.defaultProvider;
}

export const AGENT_DEFAULT_PROVIDER: Record<string, ProviderType> = new Proxy({}, {
    get(_target, prop: string) {
        return AGENT_REGISTRY[prop]?.defaultProvider ?? 'openai';
    },
    ownKeys() {
        return Object.keys(AGENT_REGISTRY);
    },
    getOwnPropertyDescriptor(target, prop) {
        return {
            enumerable: true,
            configurable: true,
            value: AGENT_REGISTRY[prop as string]?.defaultProvider
        };
    }
});
