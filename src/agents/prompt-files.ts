import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Single mount path inside SWE-Lancer monolith for all agents */
export const PROMPT_MOUNT_CONTAINER = '/tmp/ts-bench-agent-prompt.txt';

/**
 * Marker passed to getCoreArgs instead of real instructions; docker-strategy replaces
 * it with "$(cat <mount>)" so long SWE-Lancer bodies never embed in bash -c.
 */
export const PROMPT_PLACEHOLDER = '__TS_BENCH_AGENT_PROMPT_PLACEHOLDER__';

export async function writeAgentPromptFile(exercise: string, body: string): Promise<string> {
    const dir = join(process.cwd(), '.agent-prompts');
    await mkdir(dir, { recursive: true });
    const hostPath = join(dir, `${exercise}.txt`);
    await writeFile(hostPath, body, 'utf8');
    return hostPath;
}
