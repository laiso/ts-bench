import { readdir, readFile, writeFile, mkdir, stat } from 'fs/promises';
import { join, basename, resolve } from 'path';
import { homedir } from 'os';
import { ConsoleLogger } from './logger';
import type { AgentType, BenchmarkConfig } from '../config/types';
import type { CommandResult } from './shell';

const logger = new ConsoleLogger();

function getLogDir(config: BenchmarkConfig): string {
    const outputDir = config.outputDir || 'results';
    return join(outputDir, config.agent, 'logs');
}

export interface LogCollector {
    collect(config: BenchmarkConfig, exercise: string, exercisePath: string, result: CommandResult): Promise<void>;
}

/**
 * Class for collecting Claude Code logs
 */
class ClaudeLogCollector implements LogCollector {
    // Build Claude Code project directory name from absolute exercise path
    // e.g. "/Users/foo/bar/exercism-typescript/exercises/practice/accumulate" -> "-Users-foo-bar-exercism-typescript-exercises-practice-accumulate"
    // Windows: "C:\\Users\\foo\\proj" -> "C-Users-foo-proj"
    private toProjectDirName(absExercisePath: string): string {
        let p = absExercisePath.replace(/[\\/]/g, '-');
        p = p.replace(/:/g, '');
        return p;
    }

    async collect(config: BenchmarkConfig, exercise: string, exercisePath: string, _result: CommandResult): Promise<void> {
        const logDir = getLogDir(config);
        await mkdir(logDir, { recursive: true });

        try {
            const claudeProjects = join(homedir(), '.claude', 'projects');

            let candidateProject: string;
            if (config.dataset === 'v2' && config.useDocker) {
                // In V2 (Docker/Monolith), the agent runs in /app
                // So the project name in logs is derived from /app -> -app
                candidateProject = join(claudeProjects, '-app');
            } else {
                // For V1 OR Local V2
                const absExercisePath = resolve(process.cwd(), exercisePath);
                
                // If it's Local V2, the exercisePath might be handled differently in strategy,
                // but ExerciseRunner passes the "practice" path which doesn't exist for V2.
                // We should use the actual CWD used in strategy.
                let targetPath = absExercisePath;
                if (config.dataset === 'v2' && !config.useDocker) {
                    const { SWELANCER_REPO_PATH } = require('../config/constants');
                    targetPath = resolve(SWELANCER_REPO_PATH.replace(/^~/, homedir()));
                }
                
                candidateProject = join(claudeProjects, this.toProjectDirName(targetPath));
            }

            const pickNewestJsonl = async (dir: string) => {
                const entries = await readdir(dir);
                const jsonls = entries.filter(f => f.endsWith('.jsonl'));
                if (jsonls.length === 0) return null;
                const dated = await Promise.all(jsonls.map(async file => ({ file, time: (await stat(join(dir, file))).mtime.getTime() })));
                dated.sort((a, b) => b.time - a.time);
                return join(dir, dated[0]!.file);
            };

            const jsonlPath = await pickNewestJsonl(candidateProject);
            if (!jsonlPath) {
                logger.info(`No Claude JSONL logs found for ${exercise}. Checked: ${candidateProject} (root and sessions).`);
                return;
            }

            const logContent = await readFile(jsonlPath, 'utf-8');
            const redactedContent = logger.redact(logContent);
            const logFile = join(logDir, `${exercise}.log`);
            await writeFile(logFile, redactedContent);
            logger.info(`Saved Claude log for ${exercise} to ${logFile}`);
        } catch (error) {
            logger.info(`ERROR: Failed to collect Claude logs for ${exercise}: ${error}`);
        }
    }
}

/**
 * Generic class for saving stdout as logs
 */
class GenericLogCollector implements LogCollector {
    async collect(config: BenchmarkConfig, exercise: string, exercisePath: string, result: CommandResult): Promise<void> {
        const logDir = getLogDir(config);
        await mkdir(logDir, { recursive: true });

        const logContent = `STDOUT:\n${result.stdout}\n\nSTDERR:\n${result.stderr}`;
        const redactedContent = logger.redact(logContent);

        const logFile = join(logDir, `${exercise}.log`);
        await writeFile(logFile, redactedContent);
        logger.info(`Saved generic log for ${exercise} to ${logFile}`);
    }
}

/**
 * TODO: Class for collecting Aider logs. For now, it's the same as GenericLogCollector.
 */
class AiderLogCollector extends GenericLogCollector {}

export class AgentLoggerFactory {
    static create(agent: AgentType): LogCollector {
        switch (agent) {
            case 'claude':
                return new ClaudeLogCollector();
            case 'aider':
                return new AiderLogCollector();
            default:
                return new GenericLogCollector();
        }
    }
}
