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
        const spawnOptions: any = {
            stdout: "pipe",
            stderr: "pipe"
        };
        
        if (options?.cwd) {
            spawnOptions.cwd = options.cwd;
        }
        
        if (options?.env) {
            spawnOptions.env = { ...process.env, ...options.env };
        }

        const proc = spawn(args, spawnOptions);

        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        let timedOut = false;

        let stdoutRaw = "";
        let stderrRaw = "";
        
        let stdoutReader: any;
        let stderrReader: any;

        const readStream = async (stream: ReadableStream, isStdout: boolean) => {
            const reader = stream.getReader();
            if (isStdout) stdoutReader = reader;
            else stderrReader = reader;
            
            const decoder = new TextDecoder();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value) {
                        const chunk = decoder.decode(value, { stream: true });
                        if (isStdout) stdoutRaw += chunk;
                        else stderrRaw += chunk;
                    }
                }
            } catch (e) {
                // Stream might be cancelled or errored
            } finally {
                const final = decoder.decode();
                if (isStdout) stdoutRaw += final;
                else stderrRaw += final;
                reader.releaseLock();
            }
        };

        const stdoutPromise = proc.stdout ? readStream(proc.stdout, true) : Promise.resolve();
        const stderrPromise = proc.stderr ? readStream(proc.stderr, false) : Promise.resolve();

        try {
            if (options?.timeout && options.timeout > 0) {
                await Promise.race([
                    proc.exited,
                    new Promise<void>((resolve) => {
                        timeoutId = setTimeout(() => {
                            timedOut = true;
                            try {
                                proc.kill(9); // SIGKILL
                            } catch (_) {
                                // ignore
                            }
                            // Force streams to close to prevent reading from hanging
                            try { stdoutReader?.cancel(); } catch (_) {}
                            try { stderrReader?.cancel(); } catch (_) {}
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

        await Promise.all([stdoutPromise, stderrPromise]);

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
