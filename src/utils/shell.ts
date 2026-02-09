import { spawn } from "bun";

export function escapeShellArg(str: string): string {
    return str.replace(/'/g, "'\"'\"'");
}

export function escapeForDoubleQuotes(str: string): string {
    return str.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

export interface ExecuteOptions {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number; // seconds
}

export interface CommandExecutor {
    execute(args: string[], options?: ExecuteOptions): Promise<CommandResult>;
}

export interface CommandResult {
    exitCode: number | null;
    stdout: string;
    stderr: string;
}

export class BunCommandExecutor implements CommandExecutor {
    async execute(args: string[], options?: ExecuteOptions): Promise<CommandResult> {
        const spawnOptions: any = {};
        
        if (options?.cwd) {
            spawnOptions.cwd = options.cwd;
        }
        
        if (options?.env) {
            spawnOptions.env = { ...process.env, ...options.env };
        }

        const proc = spawn(args, spawnOptions);

        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        let timedOut = false;

        try {
            if (options?.timeout && options.timeout > 0) {
                await Promise.race([
                    proc.exited,
                    new Promise<void>((resolve) => {
                        timeoutId = setTimeout(() => {
                            timedOut = true;
                            try {
                                proc.kill();
                            } catch (_) {
                                // ignore
                            }
                            resolve();
                        }, options.timeout! * 1000);
                    })
                ]);
            } else {
                await proc.exited;
            }
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }

        const stdoutRaw = await new Response(proc.stdout).text();
        const stderrRaw = await new Response(proc.stderr).text();

        const stdout = this.filterYarnNoise(stdoutRaw);
        let stderr = this.filterYarnNoise(stderrRaw);
        let exitCode: number | null = proc.exitCode;

        if (timedOut) {
            exitCode = 124;
            const msg = `Execution timed out after ${options?.timeout} seconds`;
            stderr = stderr ? `${stderr}\n${msg}` : msg;
        }
        
        return {
            exitCode,
            stdout,
            stderr
        };
    }

    private filterYarnNoise(text: string): string {
        return text.replace(/YN0000.*\n/g, '');
    }
}
