import type { AgentBuilder, AgentConfig } from '../types';
import { BaseAgentBuilder } from '../base';
import { requireEnv } from '../../utils/env';

export class KimiAgentBuilder extends BaseAgentBuilder implements AgentBuilder {
    constructor(agentConfig: AgentConfig) {
        super(agentConfig);
    }

    protected getEnvironmentVariables(): Record<string, string> {
        const provider = this.config.provider ?? 'moonshot';
        if (provider !== 'moonshot') {
            throw new Error(`Unsupported provider for Kimi: ${provider}`);
        }

        return {
            KIMI_API_KEY: requireEnv('KIMI_API_KEY', 'Missing KIMI_API_KEY for Kimi (Moonshot) provider')
        };
    }

    protected getCoreArgs(instructions: string): string[] {
        const model = this.config.model;
        const baseUrl = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
        const config = {
            default_model: model,
            providers: {
                moonshot: {
                    type: 'kimi',
                    base_url: baseUrl,
                    api_key: 'env'
                }
            },
            models: {
                [model]: {
                    provider: 'moonshot',
                    model,
                    max_context_size: 262144
                }
            }
        };

        return [
            'bash',
            this.config.agentScriptPath,
            'kimi',
            '--print',
            '--output-format',
            'text',
            '--config',
            JSON.stringify(config),
            '--model',
            model,
            '-p',
            instructions
        ];
    }
}
