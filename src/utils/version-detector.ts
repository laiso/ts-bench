import type { AgentType } from '../config/types';
import { TS_BENCH_CONTAINER } from '../config/constants';
import { BunCommandExecutor } from './shell';
import { DOCKER_BASE_ARGS, createCliCacheArgs } from './docker';
import { join } from 'path';

interface DetectOptions {
    useDocker?: boolean;
    containerName?: string;
    agentScriptPath?: string;
}

export class VersionDetector {
    private executor: BunCommandExecutor;

    constructor() {
        this.executor = new BunCommandExecutor();
    }

    async detectAgentVersion(agent: AgentType, options: DetectOptions = {}): Promise<string> {
        try {
            const versionArgs = this.getVersionArgs(agent, options);
            const result = await this.executor.execute(versionArgs);

            if (result.exitCode === 0) {
                return this.parseVersionOutput(agent, result.stdout);
            } else {
                console.warn(`⚠️  Failed to detect ${agent} version: ${result.stderr || 'unknown error'}`);
                return this.getDefaultVersion(agent);
            }
        } catch (error) {
            console.warn(`⚠️  Error detecting ${agent} version: ${error}`);
            return this.getDefaultVersion(agent);
        }
    }

    private getVersionArgs(agent: AgentType, options: DetectOptions): string[] {
        const { useDocker, containerName, agentScriptPath } = options;

        if (agentScriptPath) {
            if (useDocker && containerName) {
                const hostMount = agentScriptPath.startsWith('/ts-bench-host/')
                    ? ['-v', `${join(process.cwd())}:/ts-bench-host:ro`]
                    : [];
                return [
                    ...DOCKER_BASE_ARGS,
                    ...createCliCacheArgs(),
                    ...hostMount,
                    containerName,
                    'bash',
                    agentScriptPath,
                    agent,
                    '--version'
                ];
            }

            return ['bash', agentScriptPath, agent, '--version'];
        }

        const baseCommand = this.getAgentVersionCommand(agent);

        if (useDocker) {
            const container = containerName || TS_BENCH_CONTAINER;
            return [
                ...DOCKER_BASE_ARGS,
                ...createCliCacheArgs(),
                container,
                ...baseCommand
            ];
        }

        return baseCommand;
    }

    private getAgentVersionCommand(agent: AgentType): string[] {
        switch (agent) {
            case 'claude':
                return ['claude', '--version'];
            case 'aider':
                return ['aider', '--version'];
            case 'goose':
                return ['goose', '--version'];
            case 'codex':
                return ['codex', '--version'];
            case 'gemini':
                return ['gemini', '--version'];
            case 'qwen':
                return ['qwen', '--version'];
            case 'opencode':
                return ['opencode', '--version'];
            case 'cursor':
                return ['cursor-agent', '--version'];
            case 'copilot':
                return ['copilot', '--version'];
            case 'vibe':
                // vibe doesn't support --version flag, use --help and parse or return default
                return ['vibe', '--help'];
            default:
                throw new Error(`Unknown agent: ${agent}`);
        }
    }

    private parseVersionOutput(agent: AgentType, output: string): string {
        const cleanOutput = output.trim();
        
        switch (agent) {
            case 'claude':
                // Claude Code output: "claude-code 1.2.3" or "1.2.3"
                const claudeMatch = cleanOutput.match(/(?:claude-code\s+)?(\d+\.\d+\.\d+)/i);
                return claudeMatch && claudeMatch[1] ? claudeMatch[1] : this.extractGenericVersion(cleanOutput);
                
            case 'aider':
                // Aider output: "aider 0.45.1" or "0.45.1"
                const aiderMatch = cleanOutput.match(/(?:aider\s+)?(\d+\.\d+\.\d+)/i);
                return aiderMatch && aiderMatch[1] ? aiderMatch[1] : this.extractGenericVersion(cleanOutput);
                
            case 'goose':
                // Goose output: "goose 1.2.0" or "1.2.0"
                const gooseMatch = cleanOutput.match(/(?:goose\s+)?(\d+\.\d+\.\d+)/i);
                return gooseMatch && gooseMatch[1] ? gooseMatch[1] : this.extractGenericVersion(cleanOutput);
                
            case 'codex':
                // Codex output: "codex 1.0.0" or "1.0.0"
                const codexMatch = cleanOutput.match(/(?:codex\s+)?(\d+\.\d+\.\d+)/i);
                return codexMatch && codexMatch[1] ? codexMatch[1] : this.extractGenericVersion(cleanOutput);
                
            case 'gemini':
                // Gemini output: "gemini 1.0.0" or "1.0.0"
                const geminiMatch = cleanOutput.match(/(?:gemini\s+)?(\d+\.\d+\.\d+)/i);
                return geminiMatch && geminiMatch[1] ? geminiMatch[1] : this.extractGenericVersion(cleanOutput);
                
            case 'qwen':
                // Qwen output: "qwen 1.0.0" or "1.0.0"
                const qwenMatch = cleanOutput.match(/(?:qwen\s+)?(\d+\.\d+\.\d+)/i);
                return qwenMatch && qwenMatch[1] ? qwenMatch[1] : this.extractGenericVersion(cleanOutput);
                
            case 'opencode':
                // OpenCode output: "opencode 1.0.0" or "1.0.0"
                const opencodeMatch = cleanOutput.match(/(?:opencode\s+)?(\d+\.\d+\.\d+)/i);
                return opencodeMatch && opencodeMatch[1] ? opencodeMatch[1] : this.extractGenericVersion(cleanOutput);
            case 'copilot':
                // Copilot output: "copilot 1.0.0" or "1.0.0"
                const copilotMatch = cleanOutput.match(/(?:copilot\s+)?(\d+\.\d+\.\d+)/i);
                return copilotMatch && copilotMatch[1] ? copilotMatch[1] : this.extractGenericVersion(cleanOutput);
            case 'vibe':
                // vibe doesn't have version in --help output, use default
                return this.extractGenericVersion(cleanOutput) || '0.1.0';
            case 'cursor':
                // Cursor Agent output: generic semver or text containing version
                return this.extractGenericVersion(cleanOutput);
            
            default:
                return this.extractGenericVersion(cleanOutput);
        }
    }

    private extractGenericVersion(output: string): string {
        // Try to extract any semver pattern
        const semverMatch = output.match(/(\d+\.\d+\.\d+)/);
        if (semverMatch && semverMatch[1]) {
            return semverMatch[1];
        }
        
        // Try to extract x.y pattern and add .0
        const shortVersionMatch = output.match(/(\d+\.\d+)/);
        if (shortVersionMatch && shortVersionMatch[1]) {
            return `${shortVersionMatch[1]}.0`;
        }
        
        // Last resort: extract just major version and add .0.0
        const majorVersionMatch = output.match(/(\d+)/);
        if (majorVersionMatch && majorVersionMatch[1]) {
            return `${majorVersionMatch[1]}.0.0`;
        }
        
        return 'unknown';
    }

    private getDefaultVersion(agent: AgentType): string {
        return '0.0.0';
    }
}
