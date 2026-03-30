import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Command } from '../../execution/types';
import type { AgentBuilder, AgentConfig, FileList } from '../types';
import { BaseAgentBuilder } from '../base';
import { requireAnyEnv, requireEnv } from '../../utils/env';

/** Mounted read-only; docker-strategy rewrites -p to "$(cat <path>)" for v2 bash -c wrapper */
const PROMPT_MOUNT_CONTAINER = '/tmp/ts-bench-claude-prompt.txt';

export class ClaudeAgentBuilder extends BaseAgentBuilder implements AgentBuilder {
    constructor(agentConfig: AgentConfig) {
        super(agentConfig);
    }

    protected getEnvironmentVariables(): Record<string, string> {
        const provider = this.config.provider ?? 'anthropic';
        const env: Record<string, string> = {};

        switch (provider) {
            case 'dashscope': {
                const value = requireEnv('DASHSCOPE_API_KEY', 'Missing DASHSCOPE_API_KEY for Claude (DashScope) provider');
                env.ANTHROPIC_API_KEY = value;
                env.ANTHROPIC_AUTH_TOKEN = value;
                env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://dashscope-intl.aliyuncs.com/api/v2/apps/claude-code-proxy';
                break;
            }
            case 'deepseek': {
                const value = requireEnv('DEEPSEEK_API_KEY', 'Missing DEEPSEEK_API_KEY for Claude (DeepSeek) provider');
                env.ANTHROPIC_API_KEY = value;
                env.ANTHROPIC_AUTH_TOKEN = value;
                env.ANTHROPIC_BASE_URL = 'https://api.deepseek.com/anthropic';
                break;
            }
            case 'moonshot': {
                const value = requireEnv('MOONSHOT_API_KEY', 'Missing MOONSHOT_API_KEY for Claude (Moonshot) provider');
                env.ANTHROPIC_API_KEY = value;
                env.ANTHROPIC_AUTH_TOKEN = value;
                env.ANTHROPIC_BASE_URL = 'https://api.moonshot.ai/anthropic';
                break;
            }
            case 'zai': {
                const value = requireEnv('ZAI_API_KEY', 'Missing ZAI_API_KEY for Claude (ZAI) provider');
                env.ANTHROPIC_API_KEY = value;
                env.ANTHROPIC_AUTH_TOKEN = value;
                env.ANTHROPIC_BASE_URL = 'https://api.z.ai/api/anthropic';
                break;
            }
            case 'openrouter': {
                const value = requireEnv('OPENROUTER_API_KEY', 'Missing OPENROUTER_API_KEY for Claude (OpenRouter) provider');
                env.ANTHROPIC_API_KEY = '';
                env.ANTHROPIC_AUTH_TOKEN = value;
                env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://openrouter.ai/api';
                break;
            }
            default: {
                const { value } = requireAnyEnv(
                    ['ANTHROPIC_API_KEY', 'DASHSCOPE_API_KEY'],
                    'Missing ANTHROPIC_API_KEY or DASHSCOPE_API_KEY for Claude'
                );
                env.ANTHROPIC_API_KEY = value;
            }
        }

        // Override model short names to prevent fallback to Anthropic API
        if (provider !== 'anthropic') {
            const model = this.config.model;
            env.ANTHROPIC_DEFAULT_SONNET_MODEL = model;
            env.ANTHROPIC_DEFAULT_OPUS_MODEL = model;
            env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model;
        }

        return env;
    }

    override async buildCommand(instructions: string, fileList?: FileList): Promise<Command> {
        const useDockerV2 =
            this.config.dataset === 'v2' &&
            this.config.useDocker !== false &&
            this.config.exercise;

        if (useDockerV2) {
            const dir = join(process.cwd(), '.agent-prompts');
            await mkdir(dir, { recursive: true });
            const hostPath = join(dir, `${this.config.exercise}.txt`);
            await writeFile(hostPath, instructions, 'utf8');

            const args = this.getCoreArgs('$(cat ' + PROMPT_MOUNT_CONTAINER + ')', fileList);
            return {
                args,
                env: this.getEnvironmentVariables(),
                promptFileHostPath: hostPath,
                promptFileContainerPath: PROMPT_MOUNT_CONTAINER
            };
        }

        return {
            args: this.getCoreArgs(instructions, fileList),
            env: this.getEnvironmentVariables()
        };
    }

    protected getCoreArgs(instructions: string, _fileList?: FileList): string[] {
        const permissionArgs = this.config.useDocker ? [] : ['--dangerously-skip-permissions'];
        return [
            'bash',
            this.config.agentScriptPath,
            'claude',
            '--debug',
            '--verbose',
            ...permissionArgs,
            '--model', this.config.model,
            '-p', instructions
        ];
    }
}
