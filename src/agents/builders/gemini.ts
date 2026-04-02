import type { AgentBuilder, AgentConfig } from '../types';
import { BaseAgentBuilder } from '../base';
import { tryAnyEnv } from '../../utils/env';
import { hasAuthCache } from '../../utils/docker';

export class GeminiAgentBuilder extends BaseAgentBuilder implements AgentBuilder {
    constructor(agentConfig: AgentConfig) {
        super(agentConfig);
    }

    protected getEnvironmentVariables(): Record<string, string> {
        const found = tryAnyEnv(['GEMINI_API_KEY', 'GOOGLE_API_KEY']);

        if (found) {
            const env: Record<string, string> = {
                GEMINI_API_KEY: found.value
            };
            if (found.key !== 'GEMINI_API_KEY') {
                env[found.key] = found.value;
            }
            console.log(`[auth] Gemini: using API key (${found.key})`);
            return env;
        }

        if (this.config.useDocker && hasAuthCache('gemini')) {
            console.log('[auth] Gemini: using subscription auth (no API key, auth cache found)');
            return {};
        }

        throw new Error(
            'Missing GEMINI_API_KEY or GOOGLE_API_KEY for Gemini. ' +
            'Set an API key or run: bun src/index.ts --setup-auth gemini'
        );
    }

    protected getCoreArgs(instructions: string): string[] {
        return [
            'bash',
            this.config.agentScriptPath,
            'gemini',
            '--model', this.config.model,
            '-y',
            '-p', instructions
        ];
    }
}
